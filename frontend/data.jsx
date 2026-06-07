// data.jsx — API helpers and constants for A2B

const MODES = [
  { id: 'car',  label: 'Car',         verb: 'Driving' },
  { id: 'bus',  label: 'Bus',         verb: 'On the bus' },
  { id: 'tube', label: 'Underground', verb: 'On the Underground' },
  { id: 'walk', label: 'Walking',     verb: 'Walking' },
];

const MODE_TINT = {
  car:  '#FFBF00',
  bus:  '#FFBF00',
  tube: '#FFBF00',
  walk: '#FFBF00',
};

// Fallback origin if GPS is unavailable — central London (Piccadilly Circus)
const FALLBACK_COORD = [51.5101, -0.1340];

// London bounding box for GPS validation
const LONDON_BOUNDS = { latMin: 51.28, latMax: 51.72, lngMin: -0.55, lngMax: 0.30 };

// API base URL — change to your machine IP when testing across devices
const API_BASE = 'http://localhost:3000';

// Voice service base URL (Python FastAPI, port 5001)
const VOICE_BASE = 'http://localhost:5001';

// Request the user's real GPS location. Resolves to [lat, lng].
// Falls back to Piccadilly Circus if denied or outside London.
function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(FALLBACK_COORD); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const inLondon =
          lat >= LONDON_BOUNDS.latMin && lat <= LONDON_BOUNDS.latMax &&
          lng >= LONDON_BOUNDS.lngMin && lng <= LONDON_BOUNDS.lngMax;
        resolve(inLondon ? [lat, lng] : FALLBACK_COORD);
      },
      () => resolve(FALLBACK_COORD),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

// Fetch the list of destinations from the backend.
async function fetchDestinations() {
  try {
    const res = await fetch(`${API_BASE}/api/destinations`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[A2B] Could not load destinations:', err.message);
    return [];
  }
}

// POST audio blob to the voice service and return the transcript string, or null on error.
async function transcribeSpeech(audioBlob) {
  try {
    const form = new FormData();
    form.append('file', audioBlob, 'recording.webm');
    const res = await fetch(`${VOICE_BASE}/stt`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.transcript || null;
  } catch (err) {
    console.warn('[A2B] Voice service unavailable:', err.message);
    return null;
  }
}

// Match a free-text transcript against the destination list.
// Returns the first destination whose name keywords appear in the transcript, or null.
function matchTranscriptToDest(transcript, destinations) {
  if (!transcript) return null;
  const lower = transcript.toLowerCase();
  for (const dest of destinations) {
    const words = dest.name.toLowerCase().split(/[\s,()]+/).filter((w) => w.length > 3);
    if (words.some((w) => lower.includes(w))) return dest;
  }
  return null;
}

// POST to /api/recommend-from-data and return the parsed response, or null on error.
async function fetchRouteRecommendation(destId, mode, userProfile = {}) {
  try {
    const res = await fetch(`${API_BASE}/api/recommend-from-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userProfile,
        destinationId: destId,
        mode,
        journeyTime: new Date().toISOString(),
        rerouteThreshold: 8,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Attach the mode filter so callers know which mode was scored
    data._requestedMode = mode;
    return data;
  } catch (err) {
    console.warn('[A2B] Backend unavailable:', err.message);
    return null;
  }
}

// POST a transcript + destination to the voice service and return an audio object URL, or null.
async function askVoiceQuestion(transcript, destId) {
  try {
    const res = await fetch(`${VOICE_BASE}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, destinationId: destId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn('[A2B] Voice respond failed:', err.message);
    return null;
  }
}

// POST to /api/analyze-route — used by both RouteScreen (initial) and Guide Agent (reroute poll).
// options may include { currentRouteId, currentLegId, activeRouteLegs } for reroute checks.
async function fetchAnalyzedRoute(fromCoord, destId, transportGroup, userProfile = {}, options = {}) {
  try {
    const res = await fetch(`${API_BASE}/api/analyze-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromCoord,
        destinationId: destId,
        transportGroup,
        userProfile,
        journeyTime: new Date().toISOString(),
        rerouteThreshold: 8,
        ...options,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    data._requestedMode = transportGroup === 'tfl' ? 'tube' : transportGroup;
    return data;
  } catch (err) {
    console.warn('[A2B] Analyze route failed:', err.message);
    return null;
  }
}

Object.assign(window, {
  MODES, MODE_TINT, FALLBACK_COORD, LONDON_BOUNDS, API_BASE, VOICE_BASE,
  getUserLocation, fetchDestinations, transcribeSpeech, matchTranscriptToDest,
  fetchRouteRecommendation, askVoiceQuestion, fetchAnalyzedRoute,
});
