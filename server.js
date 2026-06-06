"use strict";

const http = require("node:http");
const { URL } = require("node:url");

const { demoScenarios } = require("./demoScenarios");
const { recommendRoute } = require("./scoreRoute");

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
