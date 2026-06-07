# NVIDIA Hack-for-Impact Challenge

### Team: NetRunner
**Members :** 

## Route recommendation engine

This repository contains an accessibility-aware route decision engine for the
hackathon prototype. It ranks route options using:

- journey time, walking, transfers, disruption, and crowding
- live traffic delay and hard road/line closures
- walking, cycling, car, bus, tube, train, and mixed-mode routes
- step-free access, lift availability/status, and ramps
- peak and off-peak train fares
- user preferences for accessibility, fewer transfers, walking limits, and cost

Lower route scores are better. A reroute is only recommended when the best
alternative improves the current route's score by at least 8 points. A closed
route immediately triggers a reroute when an open alternative exists.

### Run locally

Requires Node.js 18 or newer.

```bash
npm test
npm run demo
npm start
```

The server listens on `http://localhost:3000` by default and serves both the
A2B frontend and the route recommendation API from that address.

For the full voice and NVIDIA DGX Spark demo, follow
[`DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md). The main readiness commands are:

```bash
npm run demo:check
npm run demo:dgx
```

If port 3000 is unavailable:

```bash
PORT=3001 npm start
```

Local development binds to `127.0.0.1`. To make the API reachable from another
computer on the same network:

```bash
HOST=0.0.0.0 npm start
```

### API

```text
POST /api/recommend-route
POST /api/recommend-from-data
GET  /api/demo-scenarios
GET  /health
```

`POST /api/recommend-from-data` reads the merged `route_data.json`,
`traffic_events.json`, and `accessibility_data.json` files, applies active
events, and runs the route engine. Its minimal request is:

```json
{
  "userProfile": {
    "accessibilityRequired": false
  },
  "currentRouteId": "route_1"
}
```

Example request:

```json
{
  "userProfile": {
    "accessibilityRequired": true,
    "prefersFewerTransfers": true,
    "maxWalkingMinutes": 12,
    "costSensitive": false,
    "preferredModes": ["tube", "train"],
    "avoidModes": ["car"]
  },
  "journeyTime": "2026-06-08T08:00:00",
  "currentRoute": {
    "id": "route_A",
    "summary": "District line",
    "mode": "tube",
    "etaMinutes": 42,
    "walkingMinutes": 10,
    "transfers": 2,
    "stepFree": false,
    "liftAvailable": false,
    "liftStatus": "out_of_service",
    "rampAvailable": false,
    "disruptionMinutes": 12,
    "trafficDelayMinutes": 8,
    "isClosed": false,
    "closureReason": null,
    "crowdingLevel": "high",
    "usesTrain": true,
    "baseFare": 2.8,
    "peakFare": 3.4,
    "offPeakFare": 2.8
  },
  "alternativeRoutes": [
    {
      "id": "route_B",
      "summary": "Elizabeth line + accessible interchange",
      "mode": "mixed",
      "etaMinutes": 38,
      "walkingMinutes": 8,
      "transfers": 1,
      "stepFree": true,
      "liftAvailable": true,
      "liftStatus": "working",
      "rampAvailable": true,
      "disruptionMinutes": 2,
      "trafficDelayMinutes": 1,
      "isClosed": false,
      "closureReason": null,
      "crowdingLevel": "medium",
      "usesTrain": true,
      "baseFare": 2.8,
      "peakFare": 3.4,
      "offPeakFare": 2.8
    }
  ]
}
```

The API and exported `recommendRoute` function accept both camelCase and
snake_case field names.

Example response:

```json
{
  "recommendedRoute": {
    "id": "route_B"
  },
  "shouldReroute": true,
  "rerouteTrigger": "traffic",
  "explanation": "Recommended because it has 4 minutes faster, fewer transfers, less walking, working lift access, step-free access, ramp availability, includes peak train fare, less affected by disruption, 7 minutes less traffic delay.",
  "scores": {
    "current": 476.4,
    "recommended": 84.9,
    "bestAlternative": 84.9,
    "improvement": 391.5
  },
  "confidence": 0.99
}
```

Reusable logic is exported from `scoreRoute.js`; the shared route contract and
validation helpers are exported from `datashape.js`.
