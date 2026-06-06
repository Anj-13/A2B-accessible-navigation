"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { demoScenarios } = require("./demoScenarios");
const {
  calculateEstimatedCost,
  rankRoutes,
  recommendRoute,
  scoreRoute,
  shouldReroute,
} = require("./scoreRoute");

test("normal profile recommends a meaningfully faster route", () => {
  const result = recommendRoute(demoScenarios.fastest);

  assert.equal(result.shouldReroute, true);
  assert.equal(result.recommendedRoute.id, "fast_recommended");
  assert.match(result.explanation, /9 minutes faster/);
});

test("accessibility profile strongly prefers the working lift route", () => {
  const result = recommendRoute(demoScenarios.accessibility);

  assert.equal(result.shouldReroute, true);
  assert.equal(result.recommendedRoute.id, "access_recommended");
  assert.match(result.explanation, /working lift access/);
  assert.match(result.explanation, /step-free access/);
});

test("mid-route disruption triggers rerouting", () => {
  const result = recommendRoute(demoScenarios.disruption);

  assert.equal(result.shouldReroute, true);
  assert.equal(result.recommendedRoute.id, "disruption_recommended");
  assert.match(result.explanation, /less affected by disruption/);
});

test("road closure forces a reroute even when the alternative is slower", () => {
  const result = recommendRoute(demoScenarios.roadClosure);

  assert.equal(result.shouldReroute, true);
  assert.equal(result.rerouteTrigger, "route_closed");
  assert.equal(result.recommendedRoute.id, "closure_recommended");
  assert.match(result.explanation, /avoids a closure/);
});

test("traffic delay can trigger the score-based reroute decision", () => {
  const currentRoute = {
    ...demoScenarios.fastest.currentRoute,
    trafficDelayMinutes: 12,
  };
  const alternative = {
    ...demoScenarios.fastest.currentRoute,
    id: "clear_alternative",
    trafficDelayMinutes: 1,
  };
  const decision = shouldReroute(currentRoute, alternative, {});

  assert.equal(decision.shouldReroute, true);
  assert.equal(decision.trigger, "traffic");
  assert.ok(decision.improvement >= 8);
});

test("a closed alternative is never recommended", () => {
  const currentRoute = demoScenarios.fastest.currentRoute;
  const closedAlternative = {
    ...currentRoute,
    id: "closed_alternative",
    etaMinutes: 1,
    isClosed: true,
    closureReason: "Police incident",
  };
  const decision = shouldReroute(currentRoute, closedAlternative, {});

  assert.equal(decision.shouldReroute, false);
  assert.equal(decision.trigger, "alternative_closed");
});

test("small improvements do not trigger an annoying reroute", () => {
  const currentRoute = demoScenarios.fastest.currentRoute;
  const alternativeRoute = {
    ...currentRoute,
    id: "tiny_improvement",
    etaMinutes: currentRoute.etaMinutes - 1,
  };
  const result = recommendRoute({
    currentRoute,
    alternativeRoutes: [alternativeRoute],
  });

  assert.equal(result.shouldReroute, false);
  assert.equal(result.recommendedRoute.id, currentRoute.id);
});

test("peak train journeys use the peak fare", () => {
  const route = demoScenarios.fastest.currentRoute;
  const peak = calculateEstimatedCost(route, new Date("2026-06-08T08:00:00"));
  const offPeak = calculateEstimatedCost(route, new Date("2026-06-08T12:00:00"));

  assert.deepEqual(peak, { estimatedCost: 3.4, isPeakTime: true });
  assert.deepEqual(offPeak, { estimatedCost: 2.8, isPeakTime: false });
});

test("cost-sensitive ranking accounts for peak fares", () => {
  const baseRoute = demoScenarios.fastest.currentRoute;
  const routes = [
    { ...baseRoute, id: "train", estimatedCost: 3.4, isPeakTime: true },
    {
      ...baseRoute,
      id: "bus",
      usesTrain: false,
      estimatedCost: 1.75,
      isPeakTime: false,
    },
  ];
  const ranked = rankRoutes(routes, { costSensitive: true });

  assert.equal(ranked[0].route.id, "bus");
  assert.ok(
    scoreRoute(routes[0], { costSensitive: true }) >
      scoreRoute(routes[1], { costSensitive: true }),
  );
});

test("cycle and car routes are valid scoring modes", () => {
  const baseRoute = demoScenarios.fastest.currentRoute;
  const cycleRoute = {
    ...baseRoute,
    id: "cycle",
    mode: "cycle",
    usesTrain: false,
  };
  const carRoute = {
    ...baseRoute,
    id: "car",
    mode: "car",
    usesTrain: false,
  };

  assert.equal(typeof scoreRoute(cycleRoute), "number");
  assert.equal(typeof scoreRoute(carRoute), "number");
});

test("user mode preferences influence route ranking", () => {
  const baseRoute = demoScenarios.fastest.currentRoute;
  const routes = [
    {
      ...baseRoute,
      id: "car",
      mode: "car",
      usesTrain: false,
      etaMinutes: 20,
    },
    {
      ...baseRoute,
      id: "cycle",
      mode: "cycle",
      usesTrain: false,
      etaMinutes: 24,
    },
  ];
  const ranked = rankRoutes(routes, {
    preferredModes: ["cycle"],
    avoidModes: ["car"],
  });

  assert.equal(ranked[0].route.id, "cycle");
});

test("street-level accessible modes do not require station lifts", () => {
  const baseRoute = demoScenarios.fastest.currentRoute;
  const cycleRoute = {
    ...baseRoute,
    id: "accessible_cycle",
    mode: "cycle",
    stepFree: true,
    liftAvailable: false,
    liftStatus: "unknown",
    rampAvailable: false,
    usesTrain: false,
  };
  const normalScore = scoreRoute(cycleRoute);
  const accessibleScore = scoreRoute(cycleRoute, {
    accessibilityRequired: true,
  });

  assert.equal(
    accessibleScore - normalScore,
    cycleRoute.walkingMinutes * 1.5 + cycleRoute.transfers * 4,
  );
});

test("snake_case data is accepted for teammate integration", () => {
  const result = recommendRoute({
    user_profile: { accessibility_required: true },
    current_route: {
      id: "current",
      eta_minutes: 30,
      walking_minutes: 5,
      transfers: 1,
      step_free: false,
      lift_available: false,
      lift_status: "out_of_service",
      ramp_available: false,
      disruption_minutes: 2,
      crowding_level: "low",
      uses_train: true,
      base_fare: 2.8,
      peak_fare: 3.4,
      off_peak_fare: 2.8,
    },
    alternative_routes: [
      {
        id: "alternative",
        eta_minutes: 36,
        walking_minutes: 7,
        transfers: 1,
        step_free: true,
        lift_available: true,
        lift_status: "working",
        ramp_available: true,
        disruption_minutes: 0,
        crowding_level: "low",
        uses_train: true,
        base_fare: 2.8,
        peak_fare: 3.4,
        off_peak_fare: 2.8,
      },
    ],
  });

  assert.equal(result.recommendedRoute.id, "alternative");
});
