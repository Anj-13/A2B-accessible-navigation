"use strict";

const {
  normalizeUserProfile,
  prepareRoute,
} = require("./datashape");

const DEFAULT_REROUTE_THRESHOLD = 8;
const CLOSED_ROUTE_PENALTY = 10_000;

function roundScore(score) {
  return Math.round((score + Number.EPSILON) * 100) / 100;
}

function calculateEstimatedCost(route, journeyTime = new Date()) {
  const preparedRoute = prepareRoute(route);
  const date = journeyTime instanceof Date ? journeyTime : new Date(journeyTime);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("journeyTime must be a valid Date or date value.");
  }

  const minutes = date.getHours() * 60 + date.getMinutes();
  const isMorningPeak = minutes >= 390 && minutes <= 570;
  const isEveningPeak = minutes >= 960 && minutes <= 1140;
  const isPeakTime = isMorningPeak || isEveningPeak;

  return {
    estimatedCost:
      preparedRoute.usesTrain && isPeakTime
        ? preparedRoute.peakFare
        : preparedRoute.offPeakFare ?? preparedRoute.baseFare,
    isPeakTime: preparedRoute.usesTrain && isPeakTime,
  };
}

function prepareRouteForJourney(route, journeyTime) {
  const preparedRoute = prepareRoute(route);

  if (journeyTime === undefined) {
    return preparedRoute;
  }

  return {
    ...preparedRoute,
    ...calculateEstimatedCost(preparedRoute, journeyTime),
  };
}

function scorePreparedRoute(route, userProfile) {
  let score = 0;

  score += route.etaMinutes;
  score += route.walkingMinutes * 1.5;
  score += route.transfers * 6;
  score += route.disruptionMinutes * 1.2;
  score += route.trafficDelayMinutes * 1.5;

  if (route.isClosed) score += CLOSED_ROUTE_PENALTY;

  if (route.crowdingLevel === "high") score += 8;
  if (route.crowdingLevel === "medium") score += 4;

  if (userProfile.accessibilityRequired) {
    if (!route.stepFree) score += 100;

    if (["tube", "train", "mixed"].includes(route.mode)) {
      if (!route.liftAvailable) score += 80;
      if (route.liftStatus === "out_of_service") score += 120;
      if (route.liftStatus === "unknown") score += 25;
      if (!route.rampAvailable) score += 40;
    }

    if (route.mode === "bus" && !route.rampAvailable) {
      score += 40;
    }

    score += route.walkingMinutes * 1.5;
    score += route.transfers * 4;
  }

  if (
    userProfile.maxWalkingMinutes !== null &&
    route.walkingMinutes > userProfile.maxWalkingMinutes
  ) {
    score += (route.walkingMinutes - userProfile.maxWalkingMinutes) * 8;
  }

  if (userProfile.prefersFewerTransfers) {
    score += route.transfers * 5;
  }

  if (userProfile.costSensitive) {
    score += route.estimatedCost * 3;

    if (route.usesTrain && route.isPeakTime) {
      score += 6;
    }
  }

  if (
    userProfile.preferredModes.length > 0 &&
    !userProfile.preferredModes.includes(route.mode)
  ) {
    score += 12;
  }

  if (userProfile.avoidModes.includes(route.mode)) {
    score += 80;
  }

  return roundScore(score);
}

function scoreRoute(route, userProfile = {}, options = {}) {
  const profile = normalizeUserProfile(userProfile);
  const preparedRoute = prepareRouteForJourney(route, options.journeyTime);
  return scorePreparedRoute(preparedRoute, profile);
}

function rankRoutes(routes, userProfile = {}, options = {}) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new TypeError("routes must be a non-empty array.");
  }

  const profile = normalizeUserProfile(userProfile);

  return routes
    .map((route, index) => {
      const preparedRoute = prepareRouteForJourney(route, options.journeyTime);

      return {
        route: preparedRoute,
        score: scorePreparedRoute(preparedRoute, profile),
        originalIndex: index,
      };
    })
    .sort((left, right) => left.score - right.score || left.originalIndex - right.originalIndex)
    .map(({ route, score }) => ({ route, score }));
}

function shouldReroute(
  currentRoute,
  bestAlternative,
  userProfile = {},
  options = {},
) {
  if (!bestAlternative) {
    throw new TypeError("bestAlternative is required.");
  }

  const threshold =
    options.rerouteThreshold ??
    options.reroute_threshold ??
    DEFAULT_REROUTE_THRESHOLD;

  if (
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    threshold < 0
  ) {
    throw new TypeError("rerouteThreshold must be a non-negative number.");
  }

  const profile = normalizeUserProfile(userProfile);
  const current = prepareRouteForJourney(currentRoute, options.journeyTime);
  const alternative = prepareRouteForJourney(
    bestAlternative,
    options.journeyTime,
  );
  const currentScore = scorePreparedRoute(current, profile);
  const alternativeScore = scorePreparedRoute(alternative, profile);
  const improvement = roundScore(currentScore - alternativeScore);

  const currentRouteClosed = current.isClosed && !alternative.isClosed;
  const alternativeRouteClosed = alternative.isClosed;
  const scoreImprovement = improvement >= threshold;

  let trigger = "below_threshold";
  let reroute = false;

  if (alternativeRouteClosed) {
    trigger = "alternative_closed";
  } else if (currentRouteClosed) {
    trigger = "route_closed";
    reroute = true;
  } else if (scoreImprovement) {
    trigger =
      current.trafficDelayMinutes > alternative.trafficDelayMinutes
        ? "traffic"
        : current.disruptionMinutes > alternative.disruptionMinutes
          ? "disruption"
          : "better_score";
    reroute = true;
  }

  return {
    shouldReroute: reroute,
    trigger,
    improvement,
    threshold,
    currentScore,
    alternativeScore,
  };
}

function explainReroute(currentRoute, newRoute, userProfile = {}) {
  const current = prepareRoute(currentRoute);
  const recommended = prepareRoute(newRoute);
  const profile = normalizeUserProfile(userProfile);
  const reasons = [];

  if (current.isClosed && !recommended.isClosed) {
    reasons.push(
      current.closureReason
        ? `avoids a closure (${current.closureReason})`
        : "avoids a route closure",
    );
  }

  if (recommended.etaMinutes < current.etaMinutes) {
    reasons.push(`${current.etaMinutes - recommended.etaMinutes} minutes faster`);
  }

  if (recommended.transfers < current.transfers) {
    reasons.push("fewer transfers");
  }

  if (recommended.walkingMinutes < current.walkingMinutes) {
    reasons.push("less walking");
  }

  if (profile.accessibilityRequired) {
    if (
      recommended.liftAvailable &&
      recommended.liftStatus === "working" &&
      (!current.liftAvailable || current.liftStatus !== "working")
    ) {
      reasons.push("working lift access");
    }

    if (recommended.stepFree && !current.stepFree) {
      reasons.push("step-free access");
    }

    if (recommended.rampAvailable && !current.rampAvailable) {
      reasons.push("ramp availability");
    }
  }

  if (recommended.estimatedCost < current.estimatedCost) {
    reasons.push(
      `£${(current.estimatedCost - recommended.estimatedCost).toFixed(2)} cheaper`,
    );
  }

  if (recommended.usesTrain && recommended.isPeakTime) {
    reasons.push("includes peak train fare");
  }

  if (recommended.disruptionMinutes < current.disruptionMinutes) {
    reasons.push("less affected by disruption");
  }

  if (recommended.trafficDelayMinutes < current.trafficDelayMinutes) {
    reasons.push(
      `${current.trafficDelayMinutes - recommended.trafficDelayMinutes} minutes less traffic delay`,
    );
  }

  return reasons.length > 0
    ? `Recommended because it has ${reasons.join(", ")}.`
    : "Recommended because it has the best overall journey score.";
}

function recommendRoute(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Recommendation input must be an object.");
  }

  const userProfile = input.userProfile ?? input.user_profile ?? {};
  const currentRoute = input.currentRoute ?? input.current_route;
  const alternativeRoutes =
    input.alternativeRoutes ?? input.alternative_routes;
  const journeyTime = input.journeyTime ?? input.journey_time;
  const rerouteThreshold =
    input.rerouteThreshold ??
    input.reroute_threshold ??
    DEFAULT_REROUTE_THRESHOLD;

  if (!currentRoute) {
    throw new TypeError("currentRoute is required.");
  }

  if (!Array.isArray(alternativeRoutes)) {
    throw new TypeError("alternativeRoutes must be an array.");
  }

  if (
    typeof rerouteThreshold !== "number" ||
    !Number.isFinite(rerouteThreshold) ||
    rerouteThreshold < 0
  ) {
    throw new TypeError("rerouteThreshold must be a non-negative number.");
  }

  const profile = normalizeUserProfile(userProfile);
  const current = prepareRouteForJourney(currentRoute, journeyTime);
  const currentScore = scorePreparedRoute(current, profile);

  if (alternativeRoutes.length === 0) {
    return {
      recommendedRoute: current,
      shouldReroute: false,
      rerouteTrigger: "no_alternative",
      explanation: "Keep the current route because no alternatives are available.",
      scores: {
        current: currentScore,
        recommended: currentScore,
        improvement: 0,
      },
      confidence: 1,
    };
  }

  const [bestAlternative] = rankRoutes(alternativeRoutes, profile, {
    journeyTime,
  });
  const decision = shouldReroute(current, bestAlternative.route, profile, {
    journeyTime,
    rerouteThreshold,
  });
  const recommendedRoute = decision.shouldReroute
    ? bestAlternative.route
    : current;
  const recommendedScore = decision.shouldReroute
    ? bestAlternative.score
    : currentScore;
  const confidence = Math.min(
    0.99,
    roundScore(
      0.5 +
        Math.max(0, decision.improvement) / Math.max(currentScore, 1),
    ),
  );

  return {
    recommendedRoute,
    shouldReroute: decision.shouldReroute,
    rerouteTrigger: decision.trigger,
    explanation: decision.shouldReroute
      ? explainReroute(current, bestAlternative.route, profile)
      : bestAlternative.route.isClosed
        ? "Keep the current route because the best alternative is closed."
        : `Keep the current route because the best alternative improves the score by only ${Math.max(0, decision.improvement)} points; ${rerouteThreshold} are required.`,
    scores: {
      current: currentScore,
      recommended: recommendedScore,
      bestAlternative: bestAlternative.score,
      improvement: decision.improvement,
    },
    confidence,
  };
}

module.exports = {
  DEFAULT_REROUTE_THRESHOLD,
  CLOSED_ROUTE_PENALTY,
  calculateEstimatedCost,
  explainReroute,
  rankRoutes,
  recommendRoute,
  scoreRoute,
  shouldReroute,
};
