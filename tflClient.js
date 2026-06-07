"use strict";

const https = require("node:https");

const TFL_BASE = "https://api.tfl.gov.uk";

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "A2B-Route-App/1.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`TfL API ${res.statusCode} for ${url.slice(0, 80)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("TfL API returned invalid JSON")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(new Error("TfL API timeout")); });
  });
}

// TfL mode id → our schema mode name
const TFL_MODE_MAP = {
  walking:          "walk",
  tube:             "tube",
  bus:              "bus",
  dlr:              "tube",
  overground:       "train",
  "elizabeth-line": "tube",
  tflrail:          "train",
  "national-rail":  "train",
  cycle:            "cycle",
};

function normalizeTflLeg(leg, legIndex, journeyIndex) {
  const tflMode = (leg.mode?.id || "walking").toLowerCase();
  const mode = TFL_MODE_MAP[tflMode] || "walk";
  const lineId   = leg.routeOptions?.[0]?.lineIdentifier?.id  || null;
  const lineName = leg.routeOptions?.[0]?.name                || null;
  const disruptions = Array.isArray(leg.disruptions) ? leg.disruptions : [];
  const hasLiftIssue = disruptions.some((d) =>
    (d.description || d.categoryDescription || "").toLowerCase().includes("lift")
  );
  return {
    leg_id: `tfl_${journeyIndex}_leg_${legIndex}`,
    mode,
    instruction: leg.instruction?.summary || `${mode} leg`,
    from: {
      name: leg.departurePoint?.commonName || "Departure",
      lat:  leg.departurePoint?.lat,
      lng:  leg.departurePoint?.lon,
    },
    to: {
      name: leg.arrivalPoint?.commonName || "Arrival",
      lat:  leg.arrivalPoint?.lat,
      lng:  leg.arrivalPoint?.lon,
    },
    duration_min: leg.duration || 0,
    distance_m:   null,
    departure: leg.departureTime ? String(leg.departureTime).slice(11, 16) : "",
    arrival:   leg.arrivalTime   ? String(leg.arrivalTime).slice(11, 16)   : "",
    line:      lineName,
    line_id:   lineId,
    is_disrupted: Boolean(leg.isDisrupted),
    lift_issue:   hasLiftIssue,
    disruptions,
  };
}

function normalizeTflJourney(journey, index) {
  const legs = (journey.legs || []).map((leg, i) => normalizeTflLeg(leg, i, index));

  let walkingMin = 0;
  let transfers = 0;
  let usesTrain = false;
  let disruptionMin = 0;
  let liftIssue = false;
  const transitLegs = [];

  for (const leg of legs) {
    if (leg.mode === "walk") {
      walkingMin += leg.duration_min;
    } else {
      if (transitLegs.length > 0) transfers++;
      transitLegs.push(leg);
      if (leg.mode === "tube" || leg.mode === "train") usesTrain = true;
      if (leg.is_disrupted) disruptionMin += 5;
      if (leg.lift_issue) liftIssue = true;
    }
  }

  let modeName = "walk";
  let primaryMode = "walk";
  let summary = "Walk";

  if (transitLegs.length > 0) {
    const allBus = transitLegs.every((l) => l.mode === "bus");
    if (allBus) {
      modeName = "bus"; primaryMode = "bus";
      const firstLine = transitLegs[0].line;
      summary = firstLine ? `Bus ${firstLine}` : "Bus";
    } else {
      modeName = "tube"; primaryMode = "transit";
      const firstLine = transitLegs.find((l) => l.line)?.line;
      if (transfers === 0 && firstLine) {
        summary = `${firstLine} line`;
      } else if (firstLine) {
        summary = `${firstLine} + ${transfers} change${transfers !== 1 ? "s" : ""}`;
      } else {
        summary = `${transfers + 1} leg${transfers > 0 ? "s" : ""}`;
      }
    }
  }

  const baseFare = journey.fare?.totalCost ? journey.fare.totalCost / 100 : 0;
  const etaMin = journey.duration || 0;
  const routeId = `tfl_journey_${index}`;

  return {
    route_id: routeId,
    id:       routeId,
    summary,
    primary_mode: primaryMode,
    mode:         modeName,
    total_duration_min: etaMin,
    eta_minutes:        etaMin,
    walking_minutes:    walkingMin,
    transfers,
    step_free:      !liftIssue,
    lift_available: liftIssue,
    lift_status:    liftIssue ? "out_of_service" : "unknown",
    ramp_available: false,
    disruption_minutes:  disruptionMin,
    traffic_delay_minutes: 0,
    is_closed:     false,
    crowding_level: "medium",
    uses_train:    usesTrain,
    base_fare:     baseFare,
    peak_fare:     baseFare > 0 ? Math.round((baseFare + 0.60) * 100) / 100 : 0,
    off_peak_fare: baseFare,
    co2_grams: modeName === "walk" ? 0
               : modeName === "bus" ? Math.round(89 * (etaMin / 30))
               : Math.round(41 * (etaMin / 30)),
    legs,
  };
}

async function fetchJourneys(fromCoord, toCoord, modes, options = {}) {
  const from = `${fromCoord[0]},${fromCoord[1]}`;
  const to   = `${toCoord[0]},${toCoord[1]}`;
  const modeParam = Array.isArray(modes) ? modes.join(",") : modes;

  const params = new URLSearchParams({
    mode: modeParam,
    alternativeRoutes: "true",
  });
  if (options.accessibilityRequired) {
    params.set("accessibilityPreference", "StepFreeToVehicle,StepFreeToPlatform");
  }

  const url = `${TFL_BASE}/Journey/JourneyResults/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}?${params}`;
  const data = await httpsGet(url);
  const journeys = Array.isArray(data.journeys) ? data.journeys : [];
  return journeys.slice(0, 6).map((j, i) => normalizeTflJourney(j, i));
}

async function fetchDisruptions(lineId) {
  if (!lineId) return [];
  try {
    const data = await httpsGet(`${TFL_BASE}/Line/${encodeURIComponent(lineId)}/Disruption`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

module.exports = { fetchJourneys, fetchDisruptions };
