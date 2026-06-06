"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { demoScenarios } = require("./demoScenarios");
const { createServer } = require("./server");

test("POST /api/recommend-route returns a recommendation", async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/recommend-route`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demoScenarios.disruption),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.shouldReroute, true);
  assert.equal(body.recommendedRoute.id, "disruption_recommended");
});

test("invalid routes return a useful 400 response", async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/recommend-route`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentRoute: { id: "incomplete" },
        alternativeRoutes: [],
      }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Invalid route/);
  assert.ok(body.details.length > 0);
});

test("POST /api/recommend-from-data uses the merged JSON files", async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/recommend-from-data`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userProfile: {} }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.recommendedRoute.id, "route_2");
});

test("GET / serves the merged frontend", async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.match(body, /<div id="root"><\/div>/);
  assert.match(body, /src="app\.jsx"/);
});

test("GET /app.jsx serves frontend assets", async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/app.jsx`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/javascript/);
  assert.match(body, /function App\(\)/);
});
