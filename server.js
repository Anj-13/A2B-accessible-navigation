"use strict";
try { require("fs").readFileSync(".env","utf8").split("\n").forEach(l=>{ const [k,...v]=l.split("="); if(k&&k.trim()&&v.length) process.env[k.trim()]=v.join("=").trim(); }); } catch {}

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const { demoScenarios } = require("./demoScenarios");
const { buildRecommendationInput, adaptDataRoute, loadSupportingFiles } = require("./dataIntegration");
const { recommendRoute } = require("./scoreRoute");
const { fetchJourneys, fetchDisruptions } = require("./tflClient");

const VLLM_BASE_URL = process.env.VLLM_BASE_URL || "http://localhost:8000";
const VLLM_MODEL = process.env.VLLM_MODEL || "unsloth/NVIDIA-Nemotron-3-Nano-Omni-30B-A3B-Reasoning-GGUF";
const VLLM_TIMEOUT_MS = Number(process.env.VLLM_TIMEOUT_SECONDS || 30) * 1000;

function callVLLM(messages) {
  return new Promise((resolve, reject) => {
    const url = new URL("/v1/chat/completions", VLLM_BASE_URL);
    const payload = JSON.stringify({ model: VLLM_MODEL, messages, max_tokens: 300, temperature: 0.1 });
    const req = http.request(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), "Authorization": "Bearer VLLM_API_KEY" } },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("vLLM: invalid JSON response")); } });
      }
    );
    req.setTimeout(VLLM_TIMEOUT_MS, () => { req.destroy(); reject(new Error("vLLM: request timed out")); });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const DEST_ROUTE_FILES = {
  baker:  "route_data_baker.json",
  museum: "route_data_museum.json",
  camden: "route_data_camden.json",
  tower:  "route_data_tower.json",
  kings:  "route_data_kings.json",
};

function loadDestRouteFile(destId) {
  const filename = DEST_ROUTE_FILES[destId] || "route_data.json";
  return JSON.parse(fs.readFileSync(path.join(__dirname, filename), "utf8"));
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY_BYTES = 1_000_000;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    let rejected = false;

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (rejected) return;

      rawBody += chunk;

      if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        rejected = true;
        reject(error);
      }
    });
    request.on("end", () => {
      if (rejected) return;

      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        const error = new Error("Request body must contain valid JSON.");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function normalizeRequestBody(body) {
  return {
    userProfile: body.userProfile ?? body.user_profile ?? {},
    currentRoute: body.currentRoute ?? body.current_route,
    alternativeRoutes: body.alternativeRoutes ?? body.alternative_routes,
    journeyTime: body.journeyTime ?? body.journey_time,
    rerouteThreshold: body.rerouteThreshold ?? body.reroute_threshold,
  };
}

async function requestHandler(request, response) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/demo-scenarios") {
    sendJson(response, 200, demoScenarios);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/destinations") {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, "destinations.json"), "utf8"));
      sendJson(response, 200, data);
    } catch (error) {
      sendJson(response, 500, { error: "Could not load destinations." });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/recommend-from-data") {
    try {
      const body = await readJsonBody(request);
      const destId = body.destinationId ?? body.destination_id ?? null;
      const input = buildRecommendationInput({
        userProfile: body.userProfile ?? body.user_profile ?? {},
        currentRouteId: body.currentRouteId ?? body.current_route_id,
        journeyTime: body.journeyTime ?? body.journey_time,
        rerouteThreshold: body.rerouteThreshold ?? body.reroute_threshold,
        routeData: destId ? loadDestRouteFile(destId) : undefined,
        modeFilter: body.mode ?? null,
      });
      sendJson(response, 200, recommendRoute(input));
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        error: error.message,
        details: error.details ?? [],
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/recommend-route") {
    try {
      const body = await readJsonBody(request);
      const result = recommendRoute(normalizeRequestBody(body));
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        error: error.message,
        details: error.details ?? [],
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/analyze-route") {
    try {
      const body = await readJsonBody(request);
      const fromCoord    = body.fromCoord;
      const destId       = body.destinationId ?? body.destination_id ?? null;
      const transportGroup = body.transportGroup ?? "tfl";
      const userProfile  = body.userProfile ?? {};
      const currentRouteId = body.currentRouteId;
      const currentLegId   = body.currentLegId;

      const destinations = JSON.parse(fs.readFileSync(path.join(__dirname, "destinations.json"), "utf8"));
      const dest = destinations.find((d) => d.id === destId);
      if (!dest) {
        sendJson(response, 400, { error: `Unknown destinationId: ${destId}` });
        return;
      }
      const toCoord = dest.coord;

      // Car and Walk: use existing static route data (no TfL call)
      if (transportGroup === "car" || transportGroup === "walk" || !fromCoord) {
        const modeFilter = transportGroup === "car" ? "car" : transportGroup === "walk" ? "walk" : undefined;
        const input = buildRecommendationInput({
          userProfile,
          currentRouteId,
          journeyTime: body.journeyTime,
          rerouteThreshold: body.rerouteThreshold,
          routeData: loadDestRouteFile(destId),
          modeFilter,
        });
        const result = recommendRoute(input);
        result.allRoutes = [result.recommendedRoute, ...(result.alternativeRoutes || [])].filter(Boolean);
        sendJson(response, 200, result);
        return;
      }

      // Check next-leg disruptions for Guide Agent polling requests
      let nextLegDisruptions = [];
      if (currentLegId && Array.isArray(body.activeRouteLegs)) {
        const legs = body.activeRouteLegs;
        const currentIdx = legs.findIndex((l) => l.leg_id === currentLegId);
        const nextLeg = currentIdx >= 0 ? legs[currentIdx + 1] : null;
        if (nextLeg?.line_id) {
          nextLegDisruptions = await fetchDisruptions(nextLeg.line_id);
        }
      }

      // Fetch live routes from TfL Journey Planner
      const tflModes = transportGroup === "bus"
        ? ["bus"]
        : ["tube", "bus", "dlr", "overground"];

      const routes = await fetchJourneys(fromCoord, toCoord, tflModes, {
        accessibilityRequired: Boolean(userProfile.accessibilityRequired),
      });

      if (routes.length === 0) {
        sendJson(response, 404, { error: "No routes found from TfL API." });
        return;
      }

      // Overlay static accessibility + traffic event data where available
      const { accessibilityData, trafficData } = loadSupportingFiles();
      const adaptedRoutes = routes.map((r) => adaptDataRoute(r, accessibilityData, trafficData));

      // Analyzer: call GPT-OSS 120B via Ollama on DGX Spark; fall back to scoreRoute if unreachable
      const selectedId = currentRouteId ?? adaptedRoutes[0].id;
      const currentRoute = adaptedRoutes.find((r) => r.id === selectedId) ?? adaptedRoutes[0];
      const alternatives = adaptedRoutes.filter((r) => r.id !== currentRoute.id);

      let result;
      if (VLLM_BASE_URL && VLLM_BASE_URL !== "http://localhost:8000") {
        try {
          const routePayload = {
            task: "route_selection",
            user_constraints: {
              accessibilityRequired: Boolean(userProfile.accessibilityRequired),
              prefersFewerTransfers: Boolean(userProfile.prefersFewerTransfers),
              costSensitive: Boolean(userProfile.costSensitive),
              preferredModes: userProfile.preferredModes || [],
              avoidModes: userProfile.avoidModes || [],
            },
            candidate_routes: adaptedRoutes.map((r) => ({
              id: r.id,
              summary: r.summary || r.id,
              mode: r.mode,
              eta_minutes: r.etaMinutes ?? r.eta_minutes,
              walking_minutes: r.walkingMinutes ?? r.walking_minutes,
              transfers: r.transfers,
              step_free: r.stepFree ?? r.step_free,
              lift_status: r.liftStatus ?? r.lift_status ?? "unknown",
              disruption_minutes: r.disruptionMinutes ?? r.disruption_minutes ?? 0,
              crowding_level: r.crowdingLevel ?? r.crowding_level ?? "unknown",
              base_fare: r.baseFare ?? r.base_fare ?? 0,
            })),
            current_route_id: currentRoute.id,
            current_leg_id: currentLegId ?? null,
          };

          const messages = [
            {
              role: "system",
              content:
                "You are an accessibility-first route selection engine for London transit. " +
                "Given a JSON payload with candidate_routes and user_constraints, " +
                "respond ONLY with valid JSON matching exactly: " +
                '{"recommended_route_id":"...","explanation":"...","should_reroute":false,"scores":{}}',
            },
            { role: "user", content: JSON.stringify(routePayload) },
          ];

          const vllmResp = await callVLLM(messages);
          const content = vllmResp?.choices?.[0]?.message?.content ?? "";
          const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

          const recommended =
            adaptedRoutes.find((r) => r.id === parsed.recommended_route_id) ?? currentRoute;
          const alts = adaptedRoutes.filter((r) => r.id !== recommended.id);

          result = {
            recommendedRoute: recommended,
            alternativeRoutes: alts,
            shouldReroute: Boolean(parsed.should_reroute),
            rerouteTrigger: parsed.reroute_trigger ?? null,
            explanation: parsed.explanation ?? "GPT-OSS 120B selected this route.",
            confidence: 0.9,
            scores: parsed.scores ?? {},
          };
        } catch {
          result = recommendRoute({
            userProfile,
            currentRoute,
            alternativeRoutes: alternatives,
            journeyTime: body.journeyTime,
            rerouteThreshold: body.rerouteThreshold,
          });
        }
      } else {
        result = recommendRoute({
          userProfile,
          currentRoute,
          alternativeRoutes: alternatives,
          journeyTime: body.journeyTime,
          rerouteThreshold: body.rerouteThreshold,
        });
      }

      // Force reroute flag if TfL reports active disruption on next leg
      if (nextLegDisruptions.length > 0 && !result.shouldReroute && alternatives.length > 0) {
        result.shouldReroute = true;
        result.rerouteTrigger = "disruption";
        const desc = nextLegDisruptions[0].description
          || nextLegDisruptions[0].categoryDescription
          || "service disruption";
        result.explanation = `Disruption on your next leg: ${desc}. Switching to a faster alternative.`;
      }

      result.allRoutes = adaptedRoutes;
      result.nextLegDisruptions = nextLegDisruptions;
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, {
        error: error.message,
        details: error.details ?? [],
      });
    }
    return;
  }

  sendJson(response, 404, { error: "Route not found." });
}

function createServer() {
  return http.createServer(requestHandler);
}

if (require.main === module) {
  const server = createServer();

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Try: PORT=3001 npm start`,
      );
    } else if (error.code === "EPERM") {
      console.error(
        `Permission denied while starting on ${HOST}:${PORT}. Try another port with: PORT=3001 npm start`,
      );
    } else {
      console.error("Failed to start route recommendation API:", error);
    }

    process.exitCode = 1;
  });

  server.listen(PORT, HOST, () => {
    console.log(`Route recommendation API listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { createServer, requestHandler };
