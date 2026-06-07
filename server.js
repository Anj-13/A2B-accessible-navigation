"use strict";
try { require("fs").readFileSync(".env","utf8").split("\n").forEach(l=>{ const [k,...v]=l.split("="); if(k&&k.trim()&&v.length) process.env[k.trim()]=v.join("=").trim(); }); } catch {}

const fs = require("node:fs");
const http = require("node:http");
const fs = require("node:fs");
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
const FRONTEND_DIR = path.join(__dirname, "frontend");
const FRONTEND_ENTRY = path.join(FRONTEND_DIR, "A2B Prototype.html");
const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
});

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendFile(response, filePath) {
  const contentType =
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";

  response.writeHead(200, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(filePath).pipe(response);
}

function getFrontendFile(pathname) {
  if (pathname === "/") return FRONTEND_ENTRY;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(FRONTEND_DIR, relativePath);
  const relativeToFrontend = path.relative(FRONTEND_DIR, filePath);

  if (
    relativeToFrontend.startsWith("..") ||
    path.isAbsolute(relativeToFrontend)
  ) {
    return null;
  }

  return filePath;
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

  if (request.method === "GET") {
    const filePath = getFrontendFile(url.pathname);
    if (filePath) {
      try {
        if (fs.statSync(filePath).isFile()) {
          sendFile(response, filePath);
          return;
        }
      } catch {
        // Fall through to the JSON 404 response.
      }
    }
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
