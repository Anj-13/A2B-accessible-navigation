// screens.jsx — A2B screen components. Relies on window globals from
// icons.jsx, data.jsx, map.jsx.
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
function HomeScreen({ phase, transcript, onMic, onSaved, onSearch }) {
  const listening = phase === 'listening';
  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body">
        <div className="shortcuts">
          <div className="tile shortcut" onClick={() => onSaved('home')}>
            <IconHome size={54} />
          </div>
          <div className="tile shortcut" onClick={() => onSaved('work')}>
            <IconWork size={56} />
          </div>
          <div className="tile shortcut" onClick={onSearch}>
            <IconSearch size={50} />
          </div>
        </div>

        <div className="micwrap">
          <div className={'mic' + (listening ? ' is-listening' : '')} onClick={onMic}>
            {listening && <span className="mic__halo" />}
            {listening && <span className="mic__halo h2" />}
            <span className={'mic__core' + (listening ? '' : ' off')}>
              {listening ? <IconMic size={74} /> : <IconMicOff size={100} />}
            </span>
          </div>

          {listening ?
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, minHeight: 60 }}>
              <div className="eq"><span /><span /><span /><span /><span /></div>
              <div style={{ fontSize: 15, fontWeight: 700, maxWidth: 250, textAlign: 'center', minHeight: 20 }}>
                {transcript}<span style={{ opacity: .4 }}>{transcript ? '' : 'Listening…'}</span>
              </div>
            </div> :

          <div className="mic__hint">Tap &amp; speak your destination</div>
          }
        </div>
      </div>
    </div>);

}

/* ---------- destination picker ---------- */
function PickerScreen({ onPick, onBack }) {
  const [q, setQ] = uS('');
  const norm = q.trim().toLowerCase();
  const list = DESTINATIONS.filter((d) => (d.name + ' ' + d.area).toLowerCase().includes(norm));
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
          {list.length === 0 &&
          <div className="picker__empty">No matches for “{q}”.</div>}
        </div>
      </div>
    </div>);

}

/* ---------- CONVERSATION + transport choice ---------- */
function ConvoScreen({ dest, spd, onPick, onBack, userProfile, onProfileChange }) {
  const [showOptions, setShowOptions] = uS(false);
  const [aiReady, setAiReady] = uS(false);
  uE(() => {
    setShowOptions(false);setAiReady(false);
    const t1 = setTimeout(() => setAiReady(true), 1200 / spd);
    const t2 = setTimeout(() => setShowOptions(true), 1700 / spd);
    return () => {clearTimeout(t1);clearTimeout(t2);};
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

/* ---------- ACCESSIBILITY PANEL (shows live backend data) ---------- */
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
  const stepFree    = rec.stepFree;
  const liftOk      = rec.liftAvailable && rec.liftStatus !== 'out_of_service';
  const hasLift     = rec.liftAvailable;
  const crowding    = rec.crowdingLevel || 'low';
  const disrupted   = (rec.disruptionMinutes || 0) > 0;
  const confidence  = result.confidence != null ? Math.round(result.confidence * 100) : null;
  const explanation = result.explanation || '';

  const crowdLabel = crowding === 'high' ? '● Busy' : crowding === 'medium' ? '● Moderate' : '● Quiet';

  return (
    <div className="acc-panel enter">
      <div className="acc-title">AI Accessibility Check</div>
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
          ⚠ {rec.disruptionMinutes} min delays reported on this route
        </div>
      )}
      {explanation && (
        <div className="acc-explain">
          {explanation.length > 110 ? explanation.slice(0, 110) + '…' : explanation}
        </div>
      )}
      {confidence != null && (
        <div className="acc-confidence">
          <div className="acc-conf-bar">
            <div className="acc-conf-fill" style={{ width: confidence + '%' }} />
          </div>
          <span className="acc-conf-label">AI confidence {confidence}%</span>
        </div>
      )}
    </div>
  );
}

/* ---------- ROUTE PREVIEW ---------- */
function RouteScreen({ dest, mode, route, spd, onStart, onBack, onSetMode, onSeeMore, userProfile }) {
  const [drawn, setDrawn] = uS(false);
  const [modeMenu, setModeMenu] = uS(false);
  const [apiResult, setApiResult] = uS(null);
  const [apiLoading, setApiLoading] = uS(false);

  uE(() => {
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), 250 / spd);
    return () => clearTimeout(t);
  }, [dest, mode, route, spd]);

  // Fetch real accessibility recommendation whenever destination or mode changes
  uE(() => {
    let cancelled = false;
    setApiResult(null);
    setApiLoading(true);
    fetchRouteRecommendation(dest, mode, userProfile || {})
      .then((r) => {
        if (cancelled) return;
        setApiResult(r);
        setApiLoading(false);
      });
    return () => { cancelled = true; };
  }, [dest, mode, userProfile]);

  // Prefer API ETA (from the scored route) when available, fall back to hardcoded
  const rec = apiResult && apiResult.recommendedRoute;
  const info = {
    ...route,
    eta: rec ? rec.etaMinutes : route.eta,
  };

  const ModeI = MODE_ICON[mode];

  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body" style={{ position: 'relative' }}>
        <div className="backchip" onClick={onBack}><IconBack /></div>
        <div className="maparea">
          <div className="mapframe enter">
            <LeafletMap dest={dest} mode={mode} drawn={drawn} spd={spd} />
          </div>
        </div>
        <div className="routecard">
          <div className="routecard__label">
            <span>{info.optimal ? 'Optimal route' : 'Selected route'}</span>
            <span className="more" onClick={() => setModeMenu(true)}>change mode ↻</span>
          </div>
          <div className="card">
            <div className="card__row">
              <div className="card__line">
                <span className="modepill"><ModeI size={20} /></span>
                <div>
                  <div className="nm-line">{info.line}</div>
                  <div className="card__sub">{info.detail}</div>
                </div>
              </div>
              <div className="card__big">{info.eta}<small>min</small></div>
            </div>
          </div>
          <AccessibilityPanel result={apiResult} loading={apiLoading} />
          <div className="routebtns">
            <button className="cta" onClick={onStart}>Start journey ›</button>
            <button className="cta ghost seemore" onClick={onSeeMore}>See more ↪</button>
          </div>
        </div>

        {modeMenu &&
        <ModeMenu current={mode} onClose={() => setModeMenu(false)}
        onPick={(m) => {setModeMenu(false);if (m !== mode) onSetMode(m);}} />
        }
      </div>
    </div>);

}

/* ---------- CHANGE-MODE POPUP (2×2) ---------- */
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
function RoutesScreen({ dest, mode, current, onPick, onBack }) {
  const alts = getAlternatives(dest, mode);
  const ModeI = MODE_ICON[mode];
  return (
    <div className="a2b">
      <Header />
      <div className="a2b__body" style={{ position: 'relative' }}>
        <div className="backchip" onClick={onBack}><IconBack /></div>
        <div className="picker enter">
          <h2 style={{ marginTop: 40 }}>{MODES.find((m) => m.id === mode).label} · routes to {dest.name}</h2>
          {alts.map((a, i) =>
          <div key={i} className={'dest route-alt' + (i === current ? ' is-sel' : '')} onClick={() => onPick(i)}>
              <span className="pin"><ModeI size={20} /></span>
              <div className="meta">
                <div className="nm">{a.line}{a.optimal ? ' · optimal' : ''}</div>
                <div className="ds">{a.detail}</div>
              </div>
              <div className="alt-eta">{a.eta}<small>min</small></div>
            </div>
          )}
        </div>
      </div>
    </div>);

}

/* ---------- ON ROUTE (live) ---------- */
function OnRouteScreen({ dest, mode, route, spd, onArrive, onBack }) {
  const info = route;
  const ModeI = MODE_ICON[mode];
  const [remaining, setRemaining] = uS(info.eta);
  const lastMin = uR(info.eta);
  const arrivedGuard = uR(false);

  uE(() => {setRemaining(info.eta);lastMin.current = info.eta;arrivedGuard.current = false;}, [dest, mode, route]);

  const handleProgress = (frac) => {
    const rem = Math.max(0, Math.ceil(info.eta * (1 - frac)));
    if (rem !== lastMin.current) {lastMin.current = rem;setRemaining(rem);}
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
            <LeafletMap dest={dest} mode={mode} drawn live spd={spd} onProgress={handleProgress} />
          </div>
        </div>
        <div className="routecard">
          <div className="routecard__label">
            <span className="ticker"><span className="live" />On route · {MODES.find((m) => m.id === mode).verb}</span>
          </div>
          <div className="card">
            <div className="card__row">
              <div className="card__line">
                <span className="modepill"><ModeI size={20} /></span>
                <div>
                  <div className="nm-line">{info.line}</div>
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
