"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRecommendationInput,
  loadDataFiles,
} = require("./dataIntegration");
const { recommendRoute } = require("./scoreRoute");

test("merged data files adapt to the route engine contract", () => {
  const input = buildRecommendationInput();

  assert.equal(input.currentRoute.id, "route_1");
  assert.equal(input.alternativeRoutes.length, 3);
  assert.equal(
    input.alternativeRoutes.find((route) => route.id === "route_3").mode,
    "cycle",
  );
  assert.equal(
    input.alternativeRoutes.find((route) => route.id === "route_4").mode,
    "car",
  );
});

test("active traffic events are applied to affected routes", () => {
  const input = buildRecommendationInput();
  const carRoute = input.alternativeRoutes.find(
    (route) => route.id === "route_4",
  );

  assert.equal(carRoute.disruption_minutes, 0);
  assert.equal(carRoute.traffic_delay_minutes, 8);
  assert.equal(carRoute.activeEvents[0].event_id, "evt_2");
});

test("route engine recommends an unaffected route from merged data", () => {
  const result = recommendRoute(buildRecommendationInput());

  assert.equal(result.shouldReroute, true);
  assert.equal(result.rerouteTrigger, "disruption");
  assert.equal(result.recommendedRoute.id, "route_2");
});

test("all expected merged data files load", () => {
  const data = loadDataFiles();

  assert.equal(data.routeData.routes.length, 4);
  assert.ok(data.accessibilityData.route_accessibility_summary);
  assert.equal(data.trafficData.events.length, 3);
});
