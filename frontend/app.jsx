// app.jsx — A2B prototype: state machine + tweaks + Android frame.
(function () {
const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "speed": 1,
  "reduceMotion": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const spd = (t.reduceMotion ? 100 : t.speed) || 1;

  // optional deep-link: ?screen=route&dest=baker&mode=car
  const qp = new URLSearchParams(location.search);
  const qpDest = DESTINATIONS.find(d => d.id === qp.get('dest')) || SAVED[qp.get('dest')];
  const qpScreen = qp.get('screen');

  const [screen, setScreen] = useState(['picker','convo','route','routes','onroute'].includes(qpScreen) ? qpScreen : 'home');
  const [phase, setPhase] = useState('idle');     // idle|listening (home only)
  const [dest, setDest] = useState(qpDest || DESTINATIONS[0]);
  const [mode, setMode] = useState(['car','bus','tube','walk'].includes(qp.get('mode')) ? qp.get('mode') : 'tube');
  const [altIdx, setAltIdx] = useState(0);
  const [transcript, setTranscript] = useState('');
  // User accessibility profile — drives backend scoring
  const [userProfile, setUserProfile] = useState({
    accessibilityRequired: false,
    prefersFewerTransfers: false,
    costSensitive: false,
    preferredModes: [],
    avoidModes: [],
  });
  const idxRef = useRef(0);
  const pendingRef = useRef(DESTINATIONS[0]);
  const timersRef = useRef([]);

  const clearTimers = () => { timersRef.current.forEach((id) => { clearTimeout(id); clearInterval(id); }); timersRef.current = []; };

  // live voice "transcription" while listening
  useEffect(() => {
    if (phase !== 'listening') return;
    const d = pendingRef.current;
    const words = d.phrase.split(' ');
    let i = 0; setTranscript('');
    const startDelay = setTimeout(() => {
      const iv = setInterval(() => {
        i++;
        setTranscript(words.slice(0, i).join(' '));
        if (i >= words.length) {
          clearInterval(iv);
          const done = setTimeout(() => {
            setDest(d); setScreen('convo'); setPhase('idle');
          }, 650 / spd);
          timersRef.current.push(done);
        }
      }, 200 / spd);
      timersRef.current.push(iv);
    }, 700 / spd);
    timersRef.current.push(startDelay);
    return () => clearTimers();
  }, [phase, spd]);

  // arrival auto-closes back to the main page after 2s
  useEffect(() => {
    if (screen !== 'arrived') return;
    const id = setTimeout(() => { setScreen('home'); setPhase('idle'); setTranscript(''); }, 2000);
    return () => clearTimeout(id);
  }, [screen]);

  const startListening = () => {
    if (phase === 'listening') return;
    const d = DESTINATIONS[idxRef.current % DESTINATIONS.length];
    idxRef.current += 1;
    pendingRef.current = d;
    setPhase('listening');
  };
  // tapping the mic while listening turns it off and interrupts the speech
  const toggleMic = () => {
    if (phase === 'listening') { clearTimers(); setPhase('idle'); setTranscript(''); }
    else startListening();
  };

  const pickSaved = (key) => { setAltIdx(0); setDest(SAVED[key]); setScreen('convo'); };
  const openSearch = () => setScreen('picker');
  const pickDest = (d) => { setAltIdx(0); setDest(d); setScreen('convo'); };
  const pickMode = (m) => { setAltIdx(0); setMode(m); setScreen('route'); };

  const goHome = () => { clearTimers(); setScreen('home'); setPhase('idle'); setTranscript(''); };

  // accent theming
  const accentStyle = {
    '--spd': spd,
  };

  const route = getAlternatives(dest, mode)[altIdx] || getAlternatives(dest, mode)[0];

  let content;
  if (screen === 'home') content = (
    <HomeScreen phase={phase} transcript={transcript}
      onMic={toggleMic} onSaved={pickSaved} onSearch={openSearch} />
  );
  else if (screen === 'picker') content = (
    <PickerScreen onPick={pickDest} onBack={goHome} />
  );
  else if (screen === 'convo') content = (
    <ConvoScreen dest={dest} spd={spd} onPick={pickMode} onBack={goHome}
      userProfile={userProfile} onProfileChange={setUserProfile} />
  );
  else if (screen === 'route') content = (
    <RouteScreen dest={dest} mode={mode} route={route} spd={spd}
      onStart={() => setScreen('onroute')} onBack={() => setScreen('convo')}
      onSetMode={(m) => { setAltIdx(0); setMode(m); }} onSeeMore={() => setScreen('routes')}
      userProfile={userProfile} />
  );
  else if (screen === 'routes') content = (
    <RoutesScreen dest={dest} mode={mode} current={altIdx}
      onPick={(i) => { setAltIdx(i); setScreen('route'); }} onBack={() => setScreen('route')} />
  );
  else if (screen === 'onroute') content = (
    <OnRouteScreen dest={dest} mode={mode} route={route} spd={spd}
      onArrive={() => setScreen('arrived')} onBack={() => setScreen('route')} />
  );
  else if (screen === 'arrived') content = (
    <ArrivalSheet dest={dest} />
  );

  return (
    <div className="stage">
      <DeviceFit>
        <div style={accentStyle}>
          <AndroidDevice width={412} height={880} bg="#FFF5DD" statusDark={false} navDark={false}
            border="#0F110C">
            <div style={{ ...accentStyle, height: '100%' }}>{content}</div>
          </AndroidDevice>
        </div>
      </DeviceFit>

      <TweaksPanel>
        <TweakSection label="Motion" />
        <TweakSlider label="Animation speed" value={t.speed} min={0.5} max={2} step={0.1} unit="×"
          onChange={(v) => setTweak('speed', v)} />
        <TweakToggle label="Reduce motion" value={t.reduceMotion}
          onChange={(v) => setTweak('reduceMotion', v)} />
      </TweaksPanel>
    </div>
  );
}

// Scales the fixed-size phone to fit the viewport.
function DeviceFit({ children }) {
  const ref = useRef(null);
  const inner = useRef(null);
  useEffect(() => {
    const fit = () => {
      const el = ref.current; if (!el) return;
      const pad = 36;
      const sw = (window.innerWidth - pad) / 412;
      const sh = (window.innerHeight - pad) / 880;
      const s = Math.min(1, sw, sh);
      if (inner.current) {
        inner.current.style.transform = `scale(${s})`;
        inner.current.style.width = '412px';
        inner.current.style.height = '880px';
      }
      el.style.width = (412 * s) + 'px';
      el.style.height = (880 * s) + 'px';
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div ref={inner} style={{ transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
