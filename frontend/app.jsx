// app.jsx — A2B prototype: state machine + tweaks + Android frame
(function () {
const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "speed": 1,
  "reduceMotion": false
}/*EDITMODE-END*/;

const RECORD_MS = 15000; // recording duration in ms

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const spd = (t.reduceMotion ? 100 : t.speed) || 1;

  const [destinations, setDestinations] = useState([]);
  const [originCoord, setOriginCoord] = useState(null);
  const [screen, setScreen] = useState('home');

  // phase: 'idle' | 'requesting' | 'recording' | 'processing'
  const [phase, setPhase] = useState('idle');
  const [countdown, setCountdown] = useState(15);
  const [transcript, setTranscript] = useState('');

  const [dest, setDest] = useState(null);
  const [mode, setMode] = useState('tube');
  const [apiResult, setApiResult] = useState(null);
  const [userProfile, setUserProfile] = useState({
    accessibilityRequired: false,
    prefersFewerTransfers: false,
    costSensitive: false,
    preferredModes: [],
    avoidModes: [],
  });

  // Recording refs — not state because changes must not re-render mid-recording
  const recorderRef    = useRef(null);
  const streamRef      = useRef(null);
  const chunksRef      = useRef([]);
  const recordTimerRef = useRef(null);  // 15-second setTimeout id
  const countdownRef   = useRef(null);  // 1-second setInterval id
  // Guard: true while finishRecording is running so a stale timer doesn't fire twice
  const finishingRef   = useRef(false);

  // Load GPS and destinations on mount
  useEffect(() => {
    getUserLocation().then(setOriginCoord);
    fetchDestinations().then((list) => {
      setDestinations(list);
      if (list.length > 0) setDest(list[0]);
    });
  }, []);

  // Deep-link support (runs once destinations are loaded)
  useEffect(() => {
    if (destinations.length === 0) return;
    const qp = new URLSearchParams(location.search);
    const qpDest = destinations.find((d) => d.id === qp.get('dest'));
    const qpScreen = qp.get('screen');
    const qpMode = qp.get('mode');
    if (qpDest) setDest(qpDest);
    if (['picker','convo','route','routes','onroute'].includes(qpScreen)) setScreen(qpScreen);
    if (['car','bus','tube','walk'].includes(qpMode)) setMode(qpMode);
  }, [destinations]);

  // Arrival auto-closes after 2 s
  useEffect(() => {
    if (screen !== 'arrived') return;
    const id = setTimeout(() => { setScreen('home'); setPhase('idle'); setTranscript(''); }, 2000);
    return () => clearTimeout(id);
  }, [screen]);

  // ── Recording helpers ────────────────────────────────────────────────────

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function clearCountdown() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  function clearRecordTimer() {
    if (recordTimerRef.current) { clearTimeout(recordTimerRef.current); recordTimerRef.current = null; }
  }

  // Called automatically after 15 s — never by a user tap
  async function finishRecording() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearRecordTimer();
    clearCountdown();

    const recorder = recorderRef.current;
    if (!recorder) { finishingRef.current = false; return; }

    // Collect final data and wait for recorder.onstop
    const blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' }));
      };
      if (recorder.state !== 'inactive') recorder.stop();
      else resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
    });

    stopStream();
    recorderRef.current = null;
    chunksRef.current = [];

    setPhase('processing');
    setTranscript('Transcribing…');

    const text = await transcribeSpeech(blob);
    const matched = matchTranscriptToDest(text, destinations);

    setTranscript(text || '');
    setPhase('idle');
    finishingRef.current = false;

    if (matched) {
      setDest(matched);
      setApiResult(null);
      setScreen('convo');
    } else if (dest && text) {
      // Follow-up question — destination already known, get a spoken AI response
      const audioUrl = await askVoiceQuestion(text, dest.id);
      if (audioUrl) new Audio(audioUrl).play();
    } else {
      // No destination matched and none previously set — open picker
      setScreen('picker');
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Microphone access is not supported in this browser.');
      return;
    }

    setPhase('requesting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase('idle');
      return; // User denied — stay silent
    }

    streamRef.current = stream;
    chunksRef.current = [];
    finishingRef.current = false;

    // Pick the best supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start(250); // collect chunks every 250 ms

    setCountdown(15);
    setPhase('recording');

    // Countdown display
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(countdownRef.current); countdownRef.current = null; return 0; }
        return c - 1;
      });
    }, 1000);

    // Auto-finish after 15 seconds
    recordTimerRef.current = setTimeout(finishRecording, RECORD_MS);
  }

  function cancelRecording() {
    clearRecordTimer();
    clearCountdown();
    finishingRef.current = false;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorderRef.current = null;
    chunksRef.current = []; // discard audio — no STT call
    stopStream();

    setPhase('idle');
    setTranscript('');
    setCountdown(15);
  }

  function toggleMic() {
    if (phase === 'idle') startRecording();
    else if (phase === 'recording') cancelRecording();
    // 'requesting' and 'processing': ignore taps
  }

  // ── Navigation helpers ───────────────────────────────────────────────────

  const openSearch = () => setScreen('picker');
  const pickDest  = (d) => { setApiResult(null); setDest(d); setScreen('convo'); };
  const pickMode  = (m) => { setApiResult(null); setMode(m); setScreen('route'); };
  const goHome    = () => { setScreen('home'); setPhase('idle'); setTranscript(''); };

  const accentStyle = { '--spd': spd };

  // ── Render ───────────────────────────────────────────────────────────────

  let content;
  if (screen === 'home') content = (
    <HomeScreen phase={phase} transcript={transcript} countdown={countdown}
      onMic={toggleMic} onSearch={openSearch} />
  );
  else if (screen === 'picker') content = (
    <PickerScreen destinations={destinations} onPick={pickDest} onBack={goHome} />
  );
  else if (screen === 'convo') content = dest ? (
    <ConvoScreen dest={dest} spd={spd} onPick={pickMode} onBack={goHome}
      userProfile={userProfile} onProfileChange={setUserProfile} />
  ) : null;
  else if (screen === 'route') content = dest ? (
    <RouteScreen dest={dest} mode={mode} spd={spd} originCoord={originCoord}
      onStart={(result) => { setApiResult(result); setScreen('onroute'); }}
      onBack={() => setScreen('convo')}
      onSetMode={(m) => { setApiResult(null); setMode(m); }}
      onSeeMore={() => setScreen('routes')}
      onApiResult={setApiResult}
      userProfile={userProfile} />
  ) : null;
  else if (screen === 'routes') content = dest ? (
    <RoutesScreen dest={dest} mode={mode} apiResult={apiResult}
      onPick={() => setScreen('route')} onBack={() => setScreen('route')} />
  ) : null;
  else if (screen === 'onroute') content = dest ? (
    <OnRouteScreen dest={dest} mode={mode} activeRoute={apiResult && apiResult.recommendedRoute}
      spd={spd} originCoord={originCoord}
      onArrive={() => setScreen('arrived')} onBack={() => setScreen('route')} />
  ) : null;
  else if (screen === 'arrived') content = dest ? (
    <ArrivalSheet dest={dest} />
  ) : null;

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
