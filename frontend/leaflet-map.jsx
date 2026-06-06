// leaflet-map.jsx — real slippy map (CARTO tiles) with a real OSRM route
// drawn on top. Falls back to a straight line if routing is unavailable.
(function () {
const { useRef, useEffect } = React;

const MODE_STYLE = {
  car:  { color: '#FFBF00', weight: 7,   dash: null },
  bus:  { color: '#FFBF00', weight: 6,   dash: '14 11' },
  tube: { color: '#FFBF00', weight: 6.5, dash: null, stations: true },
  walk: { color: '#0F110C', weight: 5,   dash: '1 11' },
};

function makeMarkers(L, o, b) {
  const aIcon = L.divIcon({ className: 'mk-wrap', html: '<div class="mk mk-a">A</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
  const bIcon = L.divIcon({ className: 'mk-wrap', html: '<div class="mk mk-b"><span>B</span></div>', iconSize: [30, 30], iconAnchor: [15, 30] });
  return [L.marker(o, { icon: aIcon, interactive: false }), L.marker(b, { icon: bIcon, interactive: false })];
}

// cumulative-distance interpolation for the travelling vehicle
function buildPath(latlngs) {
  const cum = [0];
  for (let i = 1; i < latlngs.length; i++) {
    const dx = latlngs[i][0] - latlngs[i - 1][0];
    const dy = latlngs[i][1] - latlngs[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1] || 1;
  return (f) => {
    const target = f * total;
    let i = 1;
    while (i < cum.length && cum[i] < target) i++;
    if (i >= cum.length) return latlngs[latlngs.length - 1];
    const seg = (target - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [
      latlngs[i - 1][0] + (latlngs[i][0] - latlngs[i - 1][0]) * seg,
      latlngs[i - 1][1] + (latlngs[i][1] - latlngs[i - 1][1]) * seg,
    ];
  };
}

function LeafletMap({ dest, mode = 'tube', drawn = false, live = false, spd = 1, onProgress }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const atRef = useRef(null);     // interpolation fn for live
  const vehRef = useRef(null);

  // init map once
  useEffect(() => {
    if (!window.L || !elRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: false, attributionControl: true,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, tap: false,
    });
    map.attributionControl.setPrefix('');
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '© OpenStreetMap, © CARTO',
    }).addTo(map);
    map.setView(ORIGIN_COORD, 13);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 60);
    setTimeout(() => map.invalidateSize(), 350);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // draw route whenever dest / mode / drawn changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    let cancelled = false;

    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];

    const o = ORIGIN_COORD, b = dest.coord;
    const st = MODE_STYLE[mode] || MODE_STYLE.car;

    const render = (latlngs) => {
      if (cancelled || !mapRef.current) return;
      atRef.current = buildPath(latlngs);

      const casing = L.polyline(latlngs, { color: '#FFF5DD', weight: st.weight + 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      const line = L.polyline(latlngs, { color: st.color, weight: st.weight, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      const [am, bm] = makeMarkers(L, o, b);
      am.addTo(map); bm.addTo(map);
      layersRef.current = [casing, line, am, bm];

      // tube station dots
      if (st.stations) {
        const at = atRef.current;
        for (let k = 1; k <= 4; k++) {
          const p = at(k / 5);
          const dot = L.circleMarker(p, { radius: 4.5, color: '#0F110C', weight: 3, fillColor: '#FFF5DD', fillOpacity: 1, interactive: false }).addTo(map);
          layersRef.current.push(dot);
        }
      }

      const refit = () => {
        if (!mapRef.current) return;
        mapRef.current.invalidateSize();
        mapRef.current.fitBounds(L.latLngBounds(latlngs).pad(0.22), { animate: false });
      };
      refit();
      setTimeout(refit, 60);
      setTimeout(refit, 320);

      // draw-in wipe on the line path, then apply mode dash texture
      const path = line.getElement && line.getElement();
      const applyDash = () => { if (path && st.dash) path.style.strokeDasharray = st.dash; };
      if (path) {
        const L0 = path.getTotalLength();
        path.style.strokeDasharray = L0;
        path.style.strokeDashoffset = drawn ? 0 : L0;
        if (drawn) {
          const dur = Math.min(2.0, 0.8 + L0 / 700) / (spd || 1);
          path.style.setProperty('--len', L0);
          path.style.animation = 'none';
          path.getBoundingClientRect();
          path.style.animation = `drawline ${dur}s ease-in-out 0.02s`;
          setTimeout(applyDash, dur * 1000 + 80);
        } else {
          applyDash();
        }
      }
    };

    // real route via OSRM, straight-line fallback
    const url = `https://router.project-osrm.org/route/v1/driving/${o[1]},${o[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const coords = d && d.routes && d.routes[0] && d.routes[0].geometry.coordinates;
        if (coords && coords.length) render(coords.map((c) => [c[1], c[0]]));
        else render([o, b]);
      })
      .catch(() => render([o, b]));

    return () => { cancelled = true; };
  }, [dest, mode, drawn, spd]);

  // travelling vehicle for the live screen
  useEffect(() => {
    const map = mapRef.current;
    if (!live || !map || !window.L) return;
    let veh = null;
    const dur = 9000 / (spd || 1);
    const start = performance.now();
    const iv = setInterval(() => {
      if (!atRef.current || !mapRef.current) return; // wait for route
      const raw = (performance.now() - start) / dur;
      const frac = Math.min(1, raw);            // clamp — never wrap back to start
      const pos = atRef.current(frac);
      if (!veh) {
        const icon = L.divIcon({ className: 'mk-wrap', html: '<div class="mk mk-veh"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        veh = L.marker(pos, { icon, interactive: false }).addTo(map);
        vehRef.current = veh;
      } else {
        veh.setLatLng(pos);
      }
      if (onProgress) onProgress(frac);
      if (raw >= 1) clearInterval(iv);          // park at destination, hold ETA
    }, 33);
    return () => { clearInterval(iv); if (veh && mapRef.current) mapRef.current.removeLayer(veh); };
  }, [live, dest, mode, spd]);

  return <div ref={elRef} className="leaflet-host" />;
}

Object.assign(window, { LeafletMap });
})();
