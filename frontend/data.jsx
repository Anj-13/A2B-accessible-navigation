// data.jsx — destinations, transport modes, route metadata for A2B

const MODES = [
  { id: 'car',  label: 'Car',         verb: 'Driving' },
  { id: 'bus',  label: 'Bus',         verb: 'On the bus' },
  { id: 'tube', label: 'Underground', verb: 'On the Underground' },
  { id: 'walk', label: 'Walking',     verb: 'Walking' },
];

// Simulated "current location" — central London (Piccadilly Circus).
const ORIGIN_COORD = [51.5101, -0.1340];

// Each destination carries real coordinates and per-mode info.
const DESTINATIONS = [
  {
    id: 'baker', name: 'Baker Street Station', area: 'Underground hub · NW1',
    phrase: 'I need to get to Baker Street Station', seed: 3, coord: [51.5226, -0.1571],
    modes: {
      tube: { eta: 12, line: 'Circle / Hammersmith & City', detail: '2 stops · no changes', stops: 3 },
      car:  { eta: 18, line: 'via Marylebone Road', detail: 'Moderate traffic' },
      bus:  { eta: 24, line: 'Bus 274 then 18', detail: '1 change · every 6 min' },
      walk: { eta: 38, line: 'Direct route', detail: '2.9 km · mostly flat' },
    },
  },
  {
    id: 'museum', name: 'The British Museum', area: 'Great Russell St · WC1',
    phrase: 'Take me to the British Museum', seed: 7, coord: [51.5194, -0.1270],
    modes: {
      tube: { eta: 16, line: 'Central Line', detail: 'change at Tottenham Ct Rd', stops: 4 },
      car:  { eta: 21, line: 'via New Oxford Street', detail: 'Heavy traffic' },
      bus:  { eta: 27, line: 'Bus 8', detail: 'Direct · every 8 min' },
      walk: { eta: 31, line: 'Direct route', detail: '2.4 km · flat' },
    },
  },
  {
    id: 'camden', name: 'Camden Market', area: 'Camden Lock · NW1',
    phrase: 'Get me to Camden Market', seed: 12, coord: [51.5414, -0.1466],
    modes: {
      tube: { eta: 19, line: 'Northern Line', detail: '4 stops · no changes', stops: 5 },
      car:  { eta: 23, line: 'via Camden Road', detail: 'Busy near market' },
      bus:  { eta: 29, line: 'Bus 88 then 274', detail: '1 change · every 7 min' },
      walk: { eta: 46, line: 'Canal towpath', detail: '3.6 km · scenic' },
    },
  },
  {
    id: 'tower', name: 'Tower Bridge', area: 'Tower Bridge Rd · SE1',
    phrase: 'I want to go to Tower Bridge', seed: 19, coord: [51.5055, -0.0754],
    modes: {
      tube: { eta: 24, line: 'Jubilee Line', detail: 'change at Westminster', stops: 6 },
      car:  { eta: 28, line: 'via Victoria Embankment', detail: 'Slow river crossing' },
      bus:  { eta: 35, line: 'Bus 15', detail: 'Direct · every 10 min' },
      walk: { eta: 58, line: 'Riverside path', detail: '4.5 km · scenic' },
    },
  },
  {
    id: 'kings', name: "King's Cross St. Pancras", area: 'Euston Road · N1C',
    phrase: "Navigate to King's Cross", seed: 24, coord: [51.5308, -0.1238],
    modes: {
      tube: { eta: 14, line: 'Victoria Line', detail: '3 stops · no changes', stops: 4 },
      car:  { eta: 20, line: 'via Pentonville Road', detail: 'Moderate traffic' },
      bus:  { eta: 22, line: 'Bus 73', detail: 'Direct · every 5 min' },
      walk: { eta: 34, line: 'Direct route', detail: '2.7 km · flat' },
    },
  },
];

// Shortcut "saved places" on the home screen
const SAVED = {
  home: {
    id: 'home', name: 'Home', area: '221B Baker Street · NW1', seed: 5, coord: [51.5238, -0.1585],
    modes: {
      tube: { eta: 11, line: 'Bakerloo Line', detail: '2 stops · no changes', stops: 3 },
      car:  { eta: 15, line: 'via Marylebone Road', detail: 'Light traffic' },
      bus:  { eta: 21, line: 'Bus 139', detail: 'Direct · every 8 min' },
      walk: { eta: 33, line: 'Direct route', detail: '2.6 km · flat' },
    },
  },
  work: {
    id: 'work', name: 'Work', area: 'Canary Wharf · E14', seed: 16, coord: [51.5054, -0.0235],
    modes: {
      tube: { eta: 26, line: 'Elizabeth Line', detail: '5 stops · no changes', stops: 6 },
      car:  { eta: 34, line: 'via A13', detail: 'Heavy traffic' },
      bus:  { eta: 48, line: 'Bus 277 then D7', detail: '1 change · every 9 min' },
      walk: { eta: 92, line: 'Not recommended', detail: '7.1 km' },
    },
  },
};

const MODE_TINT = {
  car:  '#FFBF00',
  bus:  '#FFBF00',
  tube: '#FFBF00',
  walk: '#FFBF00',
};

// Alternative routes per mode — the optimal one first, then plausible
// variants (other lines / bus numbers / roads / paths). `bump` adjusts ETA.
const ALT_TEMPLATES = {
  tube: [
    { bump: 4,  line: 'Bakerloo + Jubilee', detail: '1 change · every 3 min' },
    { bump: 8,  line: 'Metropolitan Line',  detail: '2 changes · longer walk' },
  ],
  bus:  [
    { bump: 5,  line: 'Bus 13',         detail: 'Direct · every 12 min' },
    { bump: 9,  line: 'Bus 82 then 113', detail: '1 change · every 8 min' },
  ],
  car:  [
    { bump: -3, line: 'via the A40',     detail: 'Faster · toll applies' },
    { bump: 4,  line: 'via backstreets', detail: 'Avoids main traffic' },
  ],
  walk: [
    { bump: 6,  line: 'Park route',      detail: 'Greener · +0.4 km' },
    { bump: 2,  line: 'Main road route', detail: 'Step-free · well lit' },
  ],
};

function getAlternatives(dest, mode) {
  const base = dest.modes[mode];
  const opt = { line: base.line, detail: base.detail, eta: base.eta, optimal: true };
  const alts = (ALT_TEMPLATES[mode] || []).map((a) => ({
    line: a.line, detail: a.detail, eta: Math.max(3, base.eta + a.bump),
  }));
  return [opt, ...alts];
}

// ─── Backend integration ──────────────────────────────────────────────────────

// API base URL — change to your machine IP when testing across devices
const API_BASE = 'http://localhost:3000';

// Route payloads mirroring route_data.json; used for backend accessibility scoring.
// tube: two real alternatives (Central+Jubilee vs Circle/District)
// car:  one route (via Victoria Embankment, congestion + disruption)
const BACKEND_ROUTES = {
  tube: [
    {
      id: 'route_1', summary: 'Central & Jubilee line', mode: 'tube',
      etaMinutes: 19, walkingMinutes: 6, transfers: 1,
      stepFree: false, liftAvailable: true, liftStatus: 'working', rampAvailable: true,
      disruptionMinutes: 15, trafficDelayMinutes: 0, isClosed: false,
      crowdingLevel: 'high', usesTrain: true,
      baseFare: 2.80, peakFare: 3.40, offPeakFare: 2.80,
    },
    {
      id: 'route_2', summary: 'Circle / District line', mode: 'tube',
      etaMinutes: 24, walkingMinutes: 6, transfers: 0,
      stepFree: false, liftAvailable: true, liftStatus: 'working', rampAvailable: true,
      disruptionMinutes: 0, trafficDelayMinutes: 0, isClosed: false,
      crowdingLevel: 'medium', usesTrain: true,
      baseFare: 2.80, peakFare: 3.40, offPeakFare: 2.80,
    },
  ],
  car: [
    {
      id: 'route_4', summary: 'Car via Victoria Embankment', mode: 'car',
      etaMinutes: 32, walkingMinutes: 0, transfers: 0,
      stepFree: true, liftAvailable: false, liftStatus: 'unknown', rampAvailable: false,
      disruptionMinutes: 8, trafficDelayMinutes: 0, isClosed: false,
      crowdingLevel: 'high', usesTrain: false,
      baseFare: 22.50, peakFare: 22.50, offPeakFare: 22.50,
    },
  ],
};

// Build a scorable route payload from the frontend destination data for modes
// that don't have a dedicated BACKEND_ROUTES entry (bus, walk).
function synthRoute(dest, mode) {
  const m = dest.modes[mode] || {};
  return {
    id: `${dest.id}_${mode}`,
    summary: m.line || mode,
    mode,
    etaMinutes: m.eta || 30,
    walkingMinutes: mode === 'walk' ? Math.round((m.eta || 30) * 0.9) : 5,
    transfers: mode === 'bus' ? 1 : 0,
    stepFree: mode === 'walk' || mode === 'bus',
    liftAvailable: false,
    liftStatus: 'unknown',
    rampAvailable: mode === 'bus',
    disruptionMinutes: 0,
    trafficDelayMinutes: 0,
    isClosed: false,
    crowdingLevel: mode === 'bus' ? 'medium' : 'low',
    usesTrain: false,
    baseFare:    mode === 'walk' ? 0 : mode === 'bus' ? 1.75 : 25,
    peakFare:    mode === 'walk' ? 0 : mode === 'bus' ? 1.75 : 25,
    offPeakFare: mode === 'walk' ? 0 : mode === 'bus' ? 1.75 : 25,
  };
}

// POST to /api/recommend-route and return the parsed response, or null on error.
async function fetchRouteRecommendation(dest, mode, userProfile = {}) {
  const modeRoutes = BACKEND_ROUTES[mode];
  const routes = (modeRoutes && modeRoutes.length > 0) ? modeRoutes : [synthRoute(dest, mode)];
  const [currentRoute, ...alternativeRoutes] = routes;
  try {
    const res = await fetch(`${API_BASE}/api/recommend-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userProfile,
        currentRoute,
        alternativeRoutes,
        journeyTime: new Date().toISOString(),
        rerouteThreshold: 8,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[A2B] Backend unavailable:', err.message);
    return null;
  }
}

Object.assign(window, {
  MODES, DESTINATIONS, SAVED, MODE_TINT, ORIGIN_COORD, getAlternatives,
  API_BASE, BACKEND_ROUTES, synthRoute, fetchRouteRecommendation,
});
