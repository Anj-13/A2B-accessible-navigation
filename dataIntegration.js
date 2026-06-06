"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DATA_FILES = Object.freeze({
  routes: "route_data.json",
  accessibility: "accessibility_data.json",
  traffic: "traffic_events.json",
});

function loadJson(filename) {
  const filePath = path.join(__dirname, filename);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadDataFiles() {
  return {
    routeData: loadJson(DATA_FILES.routes),
    accessibilityData: loadJson(DATA_FILES.accessibility),
    trafficData: loadJson(DATA_FILES.traffic),
  };
}

function getActiveEventsForRoute(route, trafficData) {
  const routeId = route.id ?? route.route_id;
  const legIds = new Set((route.legs ?? []).map((leg) => leg.leg_id));

  return (trafficData.events ?? []).filter((event) => {
    if (!event.active) return false;

    const routeMatch = (event.affected_route_ids ?? []).includes(routeId);
    const legMatch = (event.affected_leg_ids ?? []).some((id) => legIds.has(id));
    return routeMatch || legMatch;
  });
}

function adaptDataRoute(route, accessibilityData, trafficData) {
  const routeId = route.id ?? route.route_id;
  const accessibility =
    accessibilityData.route_accessibility_summary?.[routeId];
  const activeEvents = getActiveEventsForRoute(route, trafficData);

  const disruptionMinutes = activeEvents
    .filter((event) => event.type !== "road_congestion")
    .reduce((total, event) => total + (event.delay_min ?? 0), 0);
  const trafficDelayMinutes = activeEvents
    .filter((event) => event.type === "road_congestion")
    .reduce((total, event) => total + (event.delay_min ?? 0), 0);
  const closureEvent = activeEvents.find(
    (event) =>
      event.type === "road_closure" ||
      event.type === "line_closure" ||
      event.type === "station_closure",
  );

  return {
    ...route,
    id: routeId,
    mode:
      route.primary_mode === "transit"
        ? route.mode
        : route.primary_mode ?? route.mode,
    step_free: accessibility?.fully_step_free ?? route.step_free,
    disruption_minutes:
      activeEvents.length > 0
        ? disruptionMinutes
        : route.disruption_minutes ?? 0,
    traffic_delay_minutes: Math.max(
      route.traffic_delay_minutes ?? 0,
      trafficDelayMinutes,
    ),
    is_closed: Boolean(closureEvent),
    closure_reason: closureEvent?.headline ?? null,
    activeEvents,
  };
}

function buildRecommendationInput({
  userProfile = {},
  currentRouteId,
  journeyTime,
  rerouteThreshold,
} = {}) {
  const { routeData, accessibilityData, trafficData } = loadDataFiles();
  const routes = (routeData.routes ?? []).map((route) =>
    adaptDataRoute(route, accessibilityData, trafficData),
  );

  if (routes.length === 0) {
    throw new Error("route_data.json does not contain any routes.");
  }

  const selectedCurrentRouteId =
    currentRouteId ??
    routes.find((route) => route.recommended)?.id ??
    routes[0].id;
  const currentRoute = routes.find(
    (route) => route.id === selectedCurrentRouteId,
  );

  if (!currentRoute) {
    const error = new Error(`Unknown currentRouteId: ${selectedCurrentRouteId}`);
    error.statusCode = 400;
    throw error;
  }

  return {
    userProfile,
    currentRoute,
    alternativeRoutes: routes.filter((route) => route.id !== currentRoute.id),
    journeyTime: journeyTime ?? routeData.journey?.requested_at,
    rerouteThreshold,
  };
}

module.exports = {
  adaptDataRoute,
  buildRecommendationInput,
  getActiveEventsForRoute,
  loadDataFiles,
};
