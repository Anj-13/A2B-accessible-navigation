"use strict";

const ROUTE_MODES = Object.freeze([
  "walk",
  "cycle",
  "car",
  "bus",
  "tube",
  "train",
  "mixed",
]);
const LIFT_STATUSES = Object.freeze(["working", "out_of_service", "unknown"]);
const CROWDING_LEVELS = Object.freeze(["low", "medium", "high"]);

const FIELD_ALIASES = Object.freeze({
  eta_minutes: "etaMinutes",
  walking_minutes: "walkingMinutes",
  step_free: "stepFree",
  lift_available: "liftAvailable",
  lift_status: "liftStatus",
  ramp_available: "rampAvailable",
  disruption_minutes: "disruptionMinutes",
  traffic_delay_minutes: "trafficDelayMinutes",
  is_closed: "isClosed",
  road_closed: "isClosed",
  closure_reason: "closureReason",
  crowding_level: "crowdingLevel",
  uses_train: "usesTrain",
  base_fare: "baseFare",
  peak_fare: "peakFare",
  off_peak_fare: "offPeakFare",
  estimated_cost: "estimatedCost",
  is_peak_time: "isPeakTime",
});

const USER_PROFILE_ALIASES = Object.freeze({
  accessibility_required: "accessibilityRequired",
  prefers_fewer_transfers: "prefersFewerTransfers",
  max_walking_minutes: "maxWalkingMinutes",
  cost_sensitive: "costSensitive",
  preferred_modes: "preferredModes",
  avoid_modes: "avoidModes",
});

const REQUIRED_ROUTE_FIELDS = Object.freeze([
  "id",
  "etaMinutes",
  "walkingMinutes",
  "transfers",
  "stepFree",
  "liftAvailable",
  "liftStatus",
  "rampAvailable",
  "disruptionMinutes",
  "crowdingLevel",
  "usesTrain",
  "baseFare",
  "peakFare",
  "offPeakFare",
]);

function applyAliases(value, aliases) {
  const normalized = { ...value };

  for (const [alias, canonicalName] of Object.entries(aliases)) {
    if (normalized[canonicalName] === undefined && normalized[alias] !== undefined) {
      normalized[canonicalName] = normalized[alias];
    }
  }

  return normalized;
}

function normalizeRoute(route) {
  if (!route || typeof route !== "object" || Array.isArray(route)) {
    throw new TypeError("Route must be an object.");
  }

  const normalized = applyAliases(route, FIELD_ALIASES);
  const modeAliases = {
    cycling: "cycle",
    bicycle: "cycle",
    bike: "cycle",
    driving: "car",
    drive: "car",
  };
  const mode = modeAliases[normalized.mode] ?? normalized.mode;

  return {
    ...normalized,
    summary: normalized.summary ?? normalized.id,
    mode: mode ?? (normalized.usesTrain ? "train" : "mixed"),
    disruptionMinutes: normalized.disruptionMinutes ?? 0,
    trafficDelayMinutes: normalized.trafficDelayMinutes ?? 0,
    isClosed: normalized.isClosed ?? false,
    closureReason: normalized.closureReason ?? null,
    crowdingLevel: normalized.crowdingLevel ?? "low",
    liftStatus: normalized.liftStatus ?? "unknown",
    estimatedCost:
      normalized.estimatedCost ?? normalized.offPeakFare ?? normalized.baseFare,
    isPeakTime: normalized.isPeakTime ?? false,
  };
}

function normalizeUserProfile(userProfile = {}) {
  if (
    !userProfile ||
    typeof userProfile !== "object" ||
    Array.isArray(userProfile)
  ) {
    throw new TypeError("User profile must be an object.");
  }

  const normalized = applyAliases(userProfile, USER_PROFILE_ALIASES);
  const preferredModes = normalized.preferredModes ?? [];
  const avoidModes = normalized.avoidModes ?? [];

  for (const [field, modes] of [
    ["preferredModes", preferredModes],
    ["avoidModes", avoidModes],
  ]) {
    if (
      !Array.isArray(modes) ||
      modes.some((mode) => !ROUTE_MODES.includes(mode))
    ) {
      throw new TypeError(
        `${field} must contain only: ${ROUTE_MODES.join(", ")}`,
      );
    }
  }

  return {
    accessibilityRequired: normalized.accessibilityRequired ?? false,
    prefersFewerTransfers: normalized.prefersFewerTransfers ?? false,
    maxWalkingMinutes: normalized.maxWalkingMinutes ?? null,
    costSensitive: normalized.costSensitive ?? false,
    preferredModes,
    avoidModes,
  };
}

function validateRoute(route) {
  const errors = [];

  for (const field of REQUIRED_ROUTE_FIELDS) {
    if (route[field] === undefined || route[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (route.id !== undefined && (typeof route.id !== "string" || !route.id.trim())) {
    errors.push("id must be a non-empty string");
  }

  const nonNegativeNumbers = [
    "etaMinutes",
    "walkingMinutes",
    "transfers",
    "disruptionMinutes",
    "trafficDelayMinutes",
    "baseFare",
    "peakFare",
    "offPeakFare",
    "estimatedCost",
  ];

  for (const field of nonNegativeNumbers) {
    if (
      route[field] !== undefined &&
      (typeof route[field] !== "number" ||
        !Number.isFinite(route[field]) ||
        route[field] < 0)
    ) {
      errors.push(`${field} must be a non-negative finite number`);
    }
  }

  for (const field of [
    "stepFree",
    "liftAvailable",
    "rampAvailable",
    "usesTrain",
    "isPeakTime",
    "isClosed",
  ]) {
    if (route[field] !== undefined && typeof route[field] !== "boolean") {
      errors.push(`${field} must be a boolean`);
    }
  }

  if (route.mode !== undefined && !ROUTE_MODES.includes(route.mode)) {
    errors.push(`mode must be one of: ${ROUTE_MODES.join(", ")}`);
  }

  if (
    route.liftStatus !== undefined &&
    !LIFT_STATUSES.includes(route.liftStatus)
  ) {
    errors.push(`liftStatus must be one of: ${LIFT_STATUSES.join(", ")}`);
  }

  if (
    route.crowdingLevel !== undefined &&
    !CROWDING_LEVELS.includes(route.crowdingLevel)
  ) {
    errors.push(`crowdingLevel must be one of: ${CROWDING_LEVELS.join(", ")}`);
  }

  if (
    route.closureReason !== null &&
    route.closureReason !== undefined &&
    typeof route.closureReason !== "string"
  ) {
    errors.push("closureReason must be a string or null");
  }

  return errors;
}

function prepareRoute(route) {
  const normalized = normalizeRoute(route);
  const errors = validateRoute(normalized);

  if (errors.length > 0) {
    const error = new TypeError(`Invalid route "${normalized.id ?? "unknown"}".`);
    error.details = errors;
    throw error;
  }

  return normalized;
}

const exampleRoute = Object.freeze({
  id: "route_A",
  summary: "Elizabeth line + District line",
  mode: "mixed",
  etaMinutes: 42,
  walkingMinutes: 10,
  transfers: 2,
  stepFree: true,
  liftAvailable: true,
  liftStatus: "working",
  rampAvailable: true,
  disruptionMinutes: 5,
  trafficDelayMinutes: 3,
  isClosed: false,
  closureReason: null,
  crowdingLevel: "medium",
  usesTrain: true,
  baseFare: 2.8,
  peakFare: 3.4,
  offPeakFare: 2.8,
  estimatedCost: 3.4,
  isPeakTime: true,
});

module.exports = {
  CROWDING_LEVELS,
  LIFT_STATUSES,
  ROUTE_MODES,
  exampleRoute,
  normalizeRoute,
  normalizeUserProfile,
  prepareRoute,
  validateRoute,
};
