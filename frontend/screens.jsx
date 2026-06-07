// screens.jsx — A2B screen components
const { useState: uS, useEffect: uE, useRef: uR } = React;

/* ---------- shared header ---------- */
function Header({ onBack }) {
  return (
    <div className="a2b__header">
      <span className="a2b__logo"><LogoA2B style={{ height: 34 }} /></span>
      <span className="a2b__net"><span className="dot" />Live</span>
    </div>);
}

/* ---------- HOME ---------- */
function HomeScreen({ phase, transcript, countdown, onMic, onSearch }) {
  const active = phase === 'recording' || phase === 'requesting' || phase === 'processing';
  const isRecording  = phase === 'recording';
  const isProcessing = phase === 'processing';
  const isRequesting = phase === 'requesting';

  let statusText;
  if (isRequesting)  statusText = 'Starting microphone…';
  else if (isRecording)  statusText = `Recording — ${countdown}s remaining`;
  else if (isProcessing) statusText = transcript || 'Transcribing…';
  else statusText = null;

  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body">
        <div className="shortcuts">
          <div className="tile shortcut" onClick={onSearch}>
            <IconSearch size={50} />
          </div>
        </div>

        <div className="micwrap">
          <div className={'mic' + (active ? ' is-listening' : '')} onClick={onMic}>
            {active && <span className="mic__halo" />}
            {active && <span className="mic__halo h2" />}
            <span className={'mic__core' + (active ? '' : ' off')}>
              {active ? <IconMic size={74} /> : <IconMicOff size={100} />}
            </span>
          </div>

          {active ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, minHeight: 60 }}>
              {isRecording && <div className="eq"><span /><span /><span /><span /><span /></div>}
              <div style={{ fontSize: 15, fontWeight: 700, maxWidth: 250, textAlign: 'center', minHeight: 20 }}>
                {statusText}
              </div>
              {isRecording && (
                <div style={{ fontSize: 12, opacity: 0.5 }}>Tap again to cancel</div>
              )}
            </div>
          ) : (
            <div className="mic__hint">Tap &amp; speak your destination</div>
          )}
        </div>
      </div>
    </div>);
}

/* ---------- destination picker ---------- */
function PickerScreen({ destinations, onPick, onBack }) {
  const [q, setQ] = uS('');
  const norm = q.trim().toLowerCase();
  const list = destinations.filter((d) => (d.name + ' ' + d.area).toLowerCase().includes(norm));
  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body" style={{ position: 'relative' }}>
        <div className="backchip" onClick={onBack}><IconBack /></div>
        <div className="picker enter">
          <h2 style={{ marginTop: 40 }}>Where to?</h2>
          <div className="searchbar">
            <span className="searchbar__ic"><IconSearch size={18} /></span>
            <input
              className="searchbar__input"
              type="text"
              placeholder="Search destinations…"
              value={q}
              onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.map((d) =>
          <div key={d.id} className="dest" onClick={() => onPick(d)}>
              <span className="pin"><IconPin /></span>
              <div className="meta">
                <div className="nm">{d.name}</div>
                <div className="ds">{d.area}</div>
              </div>
              <IconBack size={20} style={{ transform: 'rotate(180deg)', opacity: .4 }} />
            </div>
          )}
          {list.length === 0 && destinations.length > 0 &&
          <div className="picker__empty">No matches for "{q}".</div>}
          {destinations.length === 0 &&
          <div className="picker__empty">Loading destinations…</div>}
        </div>
      </div>
    </div>);
}

/* ---------- CONVERSATION + transport choice ---------- */
function ConvoScreen({ dest, spd, onPick, onBack, userProfile, onProfileChange }) {
  const [showOptions, setShowOptions] = uS(false);
  const [aiReady, setAiReady] = uS(false);
  uE(() => {
    setShowOptions(false); setAiReady(false);
    const t1 = setTimeout(() => setAiReady(true), 1200 / spd);
    const t2 = setTimeout(() => setShowOptions(true), 1700 / spd);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [dest, spd]);

  const accessibilityRequired = (userProfile || {}).accessibilityRequired || false;
  const toggleAccessibility = () => {
    if (onProfileChange) {
      onProfileChange({ ...(userProfile || {}), accessibilityRequired: !accessibilityRequired });
    }
  };

  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body" style={{ position: 'relative' }}>
        <div className="backchip" onClick={onBack}><IconBack /></div>
        <div className="chat" style={{ paddingTop: 64 }}>
          <div className="bubble user enter">{dest.phrase || 'Take me to ' + dest.name}</div>
          <div className="bubble ai">
            {!aiReady ?
            <span className="typing"><i /><i /><i /></span> :
            <span className="enter">
                <span className="line">Sure thing — routing to <b>{dest.name}</b>.</span>
                <span className="line">How do you want to get there?</span>
              </span>
            }
          </div>
        </div>

        {showOptions &&
        <>
          <div className="transport enter">
            {MODES.map((m) => {
              const I = MODE_ICON[m.id];
              return (
                <div key={m.id} className="tile opt" onClick={() => onPick(m.id)}>
                  <I size={34} />
                </div>);
            })}
          </div>
          <div className="acc-pref enter">
            <div
              className={'acc-pref-btn' + (accessibilityRequired ? ' acc-pref-on' : '')}
              onClick={toggleAccessibility}
            >
              <span className="acc-pref-icon">♿</span>
              <span>Accessibility needs {accessibilityRequired ? 'ON' : 'OFF'}</span>
            </div>
          </div>
        </>
        }
      </div>
    </div>);
}

/* ---------- ACCESSIBILITY PANEL (live backend data) ---------- */
function AccessibilityPanel({ result, loading }) {
  if (loading) {
    return (
      <div className="acc-panel acc-loading">
        <span className="acc-spinner" />
        <span>Checking accessibility…</span>
      </div>
    );
  }
  if (!result || !result.recommendedRoute) return null;

  const rec = result.recommendedRoute;
  const stepFree  = rec.stepFree ?? rec.step_free;
  const liftOk    = (rec.liftAvailable ?? rec.lift_available) && (rec.liftStatus ?? rec.lift_status) !== 'out_of_service';
  const hasLift   = rec.liftAvailable ?? rec.lift_available;
  const crowding  = rec.crowdingLevel ?? rec.crowding_level ?? 'low';
  const disrupted = ((rec.disruptionMinutes ?? rec.disruption_minutes) || 0) > 0;
  const explanation = result.explanation || '';

  const crowdLabel = crowding === 'high' ? '● Busy' : crowding === 'medium' ? '● Moderate' : '● Quiet';

  return (
    <div className="acc-panel enter">
      <div className="acc-title">Accessibility Check</div>
      <div className="acc-badges">
        <span className={'acc-badge ' + (stepFree ? 'acc-ok' : 'acc-warn')}>
          {stepFree ? '♿ Step-free' : '⚠ Not step-free'}
        </span>
        {hasLift && (
          <span className={'acc-badge ' + (liftOk ? 'acc-ok' : 'acc-warn')}>
            {liftOk ? '🛗 Lift OK' : '⚠ Lift issues'}
          </span>
        )}
        <span className={'acc-badge acc-crowd acc-crowd-' + crowding}>
          {crowdLabel}
        </span>
      </div>
      {disrupted && (
        <div className="acc-disruption">
          ⚠ {rec.disruptionMinutes ?? rec.disruption_minutes} min delays reported on this route
        </div>
      )}
      {explanation && (
        <div className="acc-explain">
          {explanation.length > 110 ? explanation.slice(0, 110) + '…' : explanation}
        </div>
      )}
    </div>
  );
}

/* ---------- ROUTE PREVIEW ---------- */
function RouteScreen({ dest, mode, spd, onStart, onBack, onSetMode, onSeeMore, onApiResult, userProfile, originCoord }) {
  const [drawn, setDrawn] = uS(false);
  const [modeMenu, setModeMenu] = uS(false);
  const [apiResult, setApiResult] = uS(null);
  const [apiLoading, setApiLoading] = uS(false);

  uE(() => {
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), 250 / spd);
    return () => clearTimeout(t);
  }, [dest, mode, spd]);

  uE(() => {
    setApiResult(null);
    setApiLoading(true);
    fetchRouteRecommendation(dest.id, mode, userProfile || {})
      .then((r) => { setApiResult(r); setApiLoading(false); if (onApiResult) onApiResult(r); });
  }, [dest, mode]);

  const rec = apiResult && apiResult.recommendedRoute;
  const eta  = rec ? (rec.etaMinutes ?? rec.eta_minutes ?? '—') : '…';
  const line = rec ? (rec.summary || mode) : mode;
  const detail = apiResult && apiResult.explanation
    ? (apiResult.explanation.length > 60 ? apiResult.explanation.slice(0, 60) + '…' : apiResult.explanation)
    : '';

  const ModeI = MODE_ICON[mode];

  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body" style={{ position: 'relative' }}>
        <div className="backchip" onClick={onBack}><IconBack /></div>
        <div className="maparea">
          <div className="mapframe enter">
            <LeafletMap dest={dest} mode={mode} drawn={drawn} spd={spd} originCoord={originCoord} />
          </div>
        </div>
        <div className="routecard">
          <div className="routecard__label">
            <span>Recommended route</span>
            <span className="more" onClick={() => setModeMenu(true)}>change mode ↻</span>
          </div>
          <div className="card">
            <div className="card__row">
              <div className="card__line">
                <span className="modepill"><ModeI size={20} /></span>
                <div>
                  <div className="nm-line">{line}</div>
                  {detail && <div className="card__sub">{detail}</div>}
                </div>
              </div>
              <div className="card__big">{eta}<small>min</small></div>
            </div>
          </div>
          <AccessibilityPanel result={apiResult} loading={apiLoading} />
          <div className="routebtns">
            <button className="cta" onClick={() => onStart(apiResult)}>Start journey ›</button>
            <button className="cta ghost seemore" onClick={onSeeMore}>See more ↪</button>
          </div>
        </div>

        {modeMenu &&
        <ModeMenu current={mode} onClose={() => setModeMenu(false)}
          onPick={(m) => { setModeMenu(false); if (m !== mode) onSetMode(m); }} />
        }
      </div>
    </div>);
}

/* ---------- CHANGE-MODE POPUP ---------- */
function ModeMenu({ current, onPick, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal enter" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">How do you want to get there?</div>
        <div className="modal__grid">
          {MODES.map((m) => {
            const I = MODE_ICON[m.id];
            return (
              <div key={m.id} className={'tile opt' + (m.id === current ? ' is-sel' : '')} onClick={() => onPick(m.id)} style={{ borderRadius: "1px", backgroundColor: "rgb(255, 191, 0)", textAlign: "justify" }}>
                <I size={40} />
                <span className="opt__label" style={{ color: "rgb(15, 17, 12)", fontSize: "14px", padding: "0px", height: "1px" }}>{m.label}</span>
              </div>);
          })}
        </div>
      </div>
    </div>);
}

/* ---------- ALTERNATIVE ROUTES ---------- */
function RoutesScreen({ dest, mode, apiResult, onPick, onBack }) {
  const ModeI = MODE_ICON[mode];
  const modeName = MODES.find((m) => m.id === mode)?.label || mode;

  // Build alternatives list from backend response
  const alternatives = [];
  if (apiResult) {
    if (apiResult.recommendedRoute) {
      alternatives.push({ ...apiResult.recommendedRoute, label: 'Recommended' });
    }
    (apiResult.alternativeRoutes || []).forEach((r) => {
      alternatives.push(r);
    });
  }

  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body" style={{ position: 'relative' }}>
        <div className="backchip" onClick={onBack}><IconBack /></div>
        <div className="picker enter">
          <h2 style={{ marginTop: 40 }}>{modeName} · routes to {dest.name}</h2>
          {alternatives.length === 0 && (
            <div className="picker__empty">No alternative routes available.</div>
          )}
          {alternatives.map((a, i) => {
            const eta = a.etaMinutes ?? a.eta_minutes ?? '—';
            const summary = a.summary || modeName;
            return (
              <div key={i} className={'dest route-alt' + (i === 0 ? ' is-sel' : '')} onClick={() => onPick(i)}>
                <span className="pin"><ModeI size={20} /></span>
                <div className="meta">
                  <div className="nm">{summary}{a.label ? ` · ${a.label}` : ''}</div>
                  <div className="ds">{a.isClosed || a.is_closed ? '⚠ Closed' : (a.crowdingLevel || a.crowding_level || '')}</div>
                </div>
                <div className="alt-eta">{eta}<small>min</small></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>);
}

/* ---------- ON ROUTE (live) ---------- */
function OnRouteScreen({ dest, mode, activeRoute, spd, onArrive, onBack, originCoord }) {
  const ModeI = MODE_ICON[mode];
  const eta = activeRoute ? (activeRoute.etaMinutes ?? activeRoute.eta_minutes ?? 0) : 0;
  const line = activeRoute ? (activeRoute.summary || mode) : mode;

  const [remaining, setRemaining] = uS(eta);
  const lastMin = uR(eta);
  const arrivedGuard = uR(false);

  uE(() => {
    setRemaining(eta);
    lastMin.current = eta;
    arrivedGuard.current = false;
  }, [dest, mode, activeRoute]);

  const handleProgress = (frac) => {
    const rem = Math.max(0, Math.ceil(eta * (1 - frac)));
    if (rem !== lastMin.current) { lastMin.current = rem; setRemaining(rem); }
    if (frac > 0.985 && !arrivedGuard.current) {
      arrivedGuard.current = true;
      setTimeout(onArrive, 400);
    }
  };

  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body" style={{ position: 'relative' }}>
        <div className="backchip" onClick={onBack}><IconBack /></div>
        <div className="maparea">
          <div className="mapframe enter">
            <LeafletMap dest={dest} mode={mode} drawn live spd={spd} originCoord={originCoord} onProgress={handleProgress} />
          </div>
        </div>
        <div className="routecard">
          <div className="routecard__label">
            <span className="ticker"><span className="live" />On route · {MODES.find((m) => m.id === mode)?.verb || mode}</span>
          </div>
          <div className="card">
            <div className="card__row">
              <div className="card__line">
                <span className="modepill"><ModeI size={20} /></span>
                <div>
                  <div className="nm-line">{line}</div>
                  <div className="card__sub">to {dest.name}</div>
                </div>
              </div>
              <div className="card__big" style={{ textAlign: 'right' }}>
                {remaining}<small>min</small>
                <div className="card__sub" style={{ fontWeight: 700 }}>ETA</div>
              </div>
            </div>
          </div>
          <button className="cta ghost" onClick={onArrive}>End &amp; I've arrived</button>
        </div>
      </div>
    </div>);
}

/* ---------- ARRIVAL ---------- */
function ArrivalSheet({ dest }) {
  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body">
        <div className="arrival">
          <div className="check"><IconCheck size={56} /></div>
          <div className="big">You've arrived</div>
          <div className="sub">Welcome to {dest.name}. Thanks for travelling with A2B.</div>
        </div>
      </div>
    </div>);
}

Object.assign(window, {
  Header, HomeScreen, PickerScreen, ConvoScreen, RouteScreen, RoutesScreen, OnRouteScreen, ArrivalSheet
});
