"use strict";

const sharedRouteFields = {
  mode: "mixed",
  liftAvailable: true,
  liftStatus: "working",
  rampAvailable: true,
  disruptionMinutes: 0,
  trafficDelayMinutes: 0,
  isClosed: false,
  closureReason: null,
  crowdingLevel: "low",
  usesTrain: true,
  baseFare: 2.8,
  peakFare: 3.4,
  offPeakFare: 2.8,
};

const demoScenarios = {
  fastest: {
    userProfile: {},
    currentRoute: {
      ...sharedRouteFields,
      id: "fast_current",
      summary: "Central line",
      etaMinutes: 34,
      walkingMinutes: 8,
      transfers: 1,
      stepFree: true,
    },
    alternativeRoutes: [
      {
        ...sharedRouteFields,
        id: "fast_recommended",
        summary: "Elizabeth line + Jubilee line",
        etaMinutes: 25,
        walkingMinutes: 6,
        transfers: 1,
        stepFree: true,
      },
    ],
  },
  accessibility: {
    userProfile: {
      accessibilityRequired: true,
      prefersFewerTransfers: true,
      maxWalkingMinutes: 12,
    },
    currentRoute: {
      ...sharedRouteFields,
      id: "access_current",
      summary: "Fast route with unavailable lift",
      etaMinutes: 28,
      walkingMinutes: 7,
      transfers: 2,
      stepFree: false,
      liftAvailable: false,
      liftStatus: "out_of_service",
      rampAvailable: false,
    },
    alternativeRoutes: [
      {
        ...sharedRouteFields,
        id: "access_recommended",
        summary: "Step-free route via accessible stations",
        etaMinutes: 34,
        walkingMinutes: 8,
        transfers: 1,
        stepFree: true,
      },
    ],
  },
  disruption: {
    userProfile: {
      accessibilityRequired: true,
      prefersFewerTransfers: true,
    },
    currentRoute: {
      ...sharedRouteFields,
      id: "disrupted_current",
      summary: "District line with severe delays",
      etaMinutes: 46,
      walkingMinutes: 10,
      transfers: 2,
      stepFree: true,
      disruptionMinutes: 12,
      crowdingLevel: "high",
    },
    alternativeRoutes: [
      {
        ...sharedRouteFields,
        id: "disruption_recommended",
        summary: "Elizabeth line + accessible interchange",
        etaMinutes: 38,
        walkingMinutes: 8,
        transfers: 1,
        stepFree: true,
        disruptionMinutes: 2,
        crowdingLevel: "medium",
      },
    ],
  },
  roadClosure: {
    userProfile: {},
    currentRoute: {
      ...sharedRouteFields,
      id: "closed_current",
      summary: "Bus route via Bishopsgate",
      etaMinutes: 24,
      walkingMinutes: 4,
      transfers: 0,
      stepFree: true,
      isClosed: true,
      closureReason: "Bishopsgate road closure",
    },
    alternativeRoutes: [
      {
        ...sharedRouteFields,
        id: "closure_recommended",
        summary: "Diversion via Liverpool Street",
        etaMinutes: 31,
        walkingMinutes: 6,
        transfers: 1,
        stepFree: true,
      },
    ],
  },
};

module.exports = { demoScenarios };
