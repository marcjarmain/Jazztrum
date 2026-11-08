import React, {useEffect, useRef, useState} from 'react';
import {detectPitch, guitarStrings, microphoneLevel, PitchTracker, tuningReading} from './audio/pitch';
import {BaselineCapture, baselinePitch, baselineSensitivity, baselineStorageKey, GuitarBaseline, parseBaseline, sameMicrophone} from './audio/baseline';
import {nextUntunedString, TuningLock} from './audio/tuning';
import './tuner.css';

type Status = 'off' | 'starting' | 'listening' | 'error';
type InputState = 'waiting' | 'quiet' | 'unclear' | 'clipped' | 'paused' | 'clear';
const emptyCapture = () => ({progress: 0, candidate: null, reason: 'waiting'} as ReturnType<BaselineCapture['add']>);

export function Tuner({onClose}: {onClose: () => void}) {
  const [status, setStatus] = useState<Status>('off');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(0);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const [input, setInput] = useState<InputState>('waiting');
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [baseline, setBaseline] = useState<GuitarBaseline | null>(() => {
    try {return parseBaseline(localStorage.getItem(baselineStorageKey));} catch {return null;}
  });
  const baselineRef = useRef(baseline);
  const selectionRef = useRef<number | null>(0);
  const deviceRef = useRef('');
  const [deviceId, setDeviceId] = useState('');
  const [setupStep, setSetupStep] = useState<number | 'intro' | null>(null);
  const [capture, setCapture] = useState(emptyCapture);
  const [baselineNotice, setBaselineNotice] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const autoAdvanceRef = useRef(true);
  const setupOpen = useRef(false);
  const setupPending = useRef<{step: number; due: number} | null>(null);
  const tuningPending = useRef<{index: number; due: number} | null>(null);
  const tuningLock = useRef(new TuningLock());
  const completed = useRef(new Set<number>());
  const [tunedStrings, setTunedStrings] = useState<number[]>([]);
  const [lockedString, setLockedString] = useState<number | null>(null);
  const [completionNotice, setCompletionNotice] = useState('');
  const setup = useRef({step: null as number | null, collector: new BaselineCapture(), draft: [] as GuitarBaseline['strings'], deviceId: ''});
  const controls = useRef({session: 0, ctx: null as AudioContext | null, stream: null as MediaStream | null,
    source: null as MediaStreamAudioSourceNode | null, sink: null as GainNode | null, timer: 0});
  const tracker = useRef(new PitchTracker());
  const previousFocus = useRef<HTMLElement | null>(null);
  const back = useRef<HTMLButtonElement>(null);

  function release() {
    const s = controls.current;
    s.session++;
    window.clearInterval(s.timer);
    s.source?.disconnect();
    s.source = null;
    s.sink?.disconnect();
    s.sink = null;
    tracker.current.reset();
    setup.current.collector.reset();
    setupPending.current = null;
    tuningPending.current = null;
    tuningLock.current.reset();
    s.stream?.getTracks().forEach(track => track.stop());
    s.stream = null;
    if (s.ctx) void s.ctx.close().catch(() => {});
    s.ctx = null;
  }

  function stop() {
    release();
    if (setup.current.step !== null) setCapture(emptyCapture());
    setStatus('off');
    setFrequency(null);
    setHeld(false);
    setInput('waiting');
    setLevel(0);
    setClipping(false);
    setLockedString(null);
  }

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    back.current?.focus();
    const hidden = () => {if (document.hidden) stop();};
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      release();
      previousFocus.current?.focus();
    };
  }, []);

  async function start() {
    release();
    if (!setupOpen.current && completed.current.size === 6) selectString(0, false);
    clearTuningProgress();
    if (setup.current.step !== null) setCapture(emptyCapture());
    setError('');
    setFrequency(null);
    setHeld(false);
    setInput('waiting');
    setStatus('starting');
    const s = controls.current, session = s.session;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Open Jazztrum using its HTTPS web address to use the microphone.');
      }
      // Resume in the button gesture for Safari.
      const ctx = new AudioContext();
      s.ctx = ctx;
      await ctx.resume();
      if (s.session !== session) return;
      const stream = await navigator.mediaDevices.getUserMedia({audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: true,
      }});
      if (s.session !== session) {stream.getTracks().forEach(track => track.stop()); return;}
      s.stream = stream;
      const microphoneId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? '';
      deviceRef.current = microphoneId;
      setDeviceId(microphoneId);
      if (setup.current.step !== null) {
        if (setup.current.draft.length && setup.current.deviceId && microphoneId && setup.current.deviceId !== microphoneId) {
          setup.current.step = 0;
          setup.current.draft = [];
          setSetupStep(0);
          selectString(0);
          setBaselineNotice('The microphone changed, so setup has restarted at string 6.');
        }
        setup.current.deviceId = microphoneId;
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      s.source = ctx.createMediaStreamSource(stream);
      s.source.connect(analyser);
      // Keep the graph active even on browsers that suspend disconnected
      // outputs. The microphone reaches only a SILENT output, never playback.
      s.sink = ctx.createGain();
      s.sink.gain.value = 0;
      analyser.connect(s.sink).connect(ctx.destination);
      const data = new Float32Array(analyser.fftSize);
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (s.session === session) {
          stop();
          setError('The microphone disconnected. Check it and start listening again.');
          setStatus('error');
        }
      }));
      setStatus('listening');
      s.timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let power = 0, peak = 0;
        for (const sample of data) {power += sample * sample; peak = Math.max(peak, Math.abs(sample));}
        const rms = Math.sqrt(power / data.length);
        setLevel(microphoneLevel(rms));
        setClipping(peak >= 0.98);
        const profile = sameMicrophone(baselineRef.current, deviceRef.current) ? baselineRef.current : null;
        const threshold = setup.current.step !== null ? 0.0001 : baselineSensitivity(profile, selectionRef.current);
        const pitch = peak < 0.98 && ctx.state === 'running' ? detectPitch(data, ctx.sampleRate, threshold) : null;
        setInput(ctx.state !== 'running' ? 'paused' : peak >= 0.98 ? 'clipped' : pitch !== null ? 'clear' : rms < threshold ? 'quiet' : 'unclear');
        if (peak >= 0.98 || ctx.state !== 'running') {
          tracker.current.reset();
          const interrupted = tuningPending.current?.index;
          if (interrupted !== undefined && completed.current.delete(interrupted)) setTunedStrings([...completed.current]);
          tuningPending.current = null;
          tuningLock.current.reset();
          setLockedString(null);
        }
        const now = performance.now();
        if (setup.current.step !== null) {
          if (peak >= 0.98 || ctx.state !== 'running') {setup.current.collector.reset(); setupPending.current = null;}
          const result = setup.current.collector.add(setup.current.step, pitch, rms, now);
          setCapture(result);
          if (autoAdvanceRef.current && result.candidate && ctx.state === 'running' && peak < 0.98) {
            if (setupPending.current?.step !== setup.current.step) setupPending.current = {step: setup.current.step, due: now + 700};
            if (now >= setupPending.current.due) {acceptString(result.candidate); return;}
          } else {setupPending.current = null;}
        }
        const adjustedPitch = setup.current.step !== null ? pitch : baselinePitch(pitch, profile, selectionRef.current);
        if (!setupOpen.current && ctx.state === 'running' && peak < 0.98 && processTuning(adjustedPitch, profile, now)) return;
        const tracked = tracker.current.update(adjustedPitch, now);
        setFrequency(tracked.frequency);
        setHeld(tracked.held);
      }, 90);
    } catch (cause) {
      if (s.session !== session) return;
      release();
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser’s site settings, then try again.'
        : name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.'
        : name === 'NotReadableError' ? 'The microphone is busy or unavailable. Close other apps using it and try again.'
        : cause instanceof Error ? cause.message : 'Could not start the microphone. Please try again.');
      setStatus('error');
    }
  }

  const microphoneMatches = sameMicrophone(baseline, deviceId);
  const activeBaseline = microphoneMatches && setupStep === null ? baseline : null;
  const reading = frequency === null ? null : tuningReading(frequency, selected, activeBaseline?.strings.map(string => string.frequency));
  const target = reading?.target ?? (selected === null ? null : guitarStrings[selected]);
  const feedback = status !== 'listening' ? 'Ready when you are'
    : input === 'paused' ? 'Audio paused — restart listening'
    : clipping ? 'A little too loud'
    : !reading ? input === 'quiet' ? 'Waiting for a string' : 'Let one string ring'
    : held ? 'Last reading — pluck again'
    : reading.wrongString ? 'Check the selected string'
    : reading.inTune ? 'In tune'
    : reading.cents < 0 ? 'Too low — tighten gently' : 'Too high — loosen gently';
  const cents = reading?.cents ?? null;
  const active = status === 'starting' || status === 'listening';
  function selectString(index: number | null, clearCheck = true) {
    tracker.current.reset();
    setSelected(index);
    selectionRef.current = index;
    setFrequency(null);
    setHeld(false);
    tuningPending.current = null;
    tuningLock.current.reset();
    setLockedString(null);
    setCompletionNotice('');
    if (clearCheck && index !== null && completed.current.delete(index)) setTunedStrings([...completed.current]);
  }

  function clearTuningProgress() {
    tuningPending.current = null;
    tuningLock.current.reset();
    completed.current = new Set();
    setTunedStrings([]);
    setLockedString(null);
    setCompletionNotice('');
  }

  // Return true after an automatic transition so the old string's sample is
  // not shown against the next string. Everything runs in the audio loop;
  // stop, cancel, hiding the page, and unmount all cancel pending transitions.
  function processTuning(pitch: number | null, profile: GuitarBaseline | null, now: number) {
    const selection = selectionRef.current;
    const measured = pitch === null ? null : tuningReading(pitch, selection, profile?.strings.map(entry => entry.frequency));
    if (measured && !measured.inTune && completed.current.delete(measured.targetIndex)) {
      setTunedStrings([...completed.current]);
      setLockedString(null);
      tuningPending.current = null;
    }
    const pending = tuningPending.current;
    if (pending && autoAdvanceRef.current && selection === pending.index && now >= pending.due) {
      tuningPending.current = null;
      const next = nextUntunedString(pending.index, completed.current);
      if (next === null) {
        stop();
        setCompletionNotice('✓ All six strings are in tune. Ready to play!');
      } else {selectString(next);}
      return true;
    }
    const index = measured?.targetIndex ?? selection ?? -1;
    if (tuningLock.current.add(index, measured?.cents ?? null, now) && !completed.current.has(index)) {
      completed.current.add(index);
      setTunedStrings([...completed.current]);
      setLockedString(index);
      if (autoAdvanceRef.current && selection !== null) tuningPending.current = {index, due: now + 700};
    }
    return false;
  }

  function changeAutoAdvance(checked: boolean) {
    autoAdvanceRef.current = checked;
    setAutoAdvance(checked);
    setupPending.current = null;
    tuningPending.current = null;
    if (checked && !setupOpen.current) selectString(selectionRef.current ?? nextUntunedString(5, completed.current) ?? 0);
  }

  function showSetup() {
    setupOpen.current = true;
    tuningPending.current = null;
    tuningLock.current.reset();
    setLockedString(null);
    setSetupStep('intro');
    setBaselineNotice('');
  }

  function beginSetup() {
    setupOpen.current = true;
    clearTuningProgress();
    setup.current = {step: 0, collector: new BaselineCapture(), draft: [], deviceId: deviceRef.current};
    setSetupStep(0);
    setCapture(emptyCapture());
    setBaselineNotice('');
    selectString(0);
    if (status !== 'listening' || input === 'paused') void start();
  }

  function cancelSetup() {
    setupOpen.current = false;
    setupPending.current = null;
    setup.current.step = null;
    setup.current.draft = [];
    setSetupStep(null);
    setCapture(emptyCapture());
    stop();
  }

  function acceptString(candidate = capture.candidate) {
    if (setup.current.step === null || !candidate || !controls.current.stream || controls.current.ctx?.state !== 'running') return;
    setupPending.current = null;
    const index = setup.current.step;
    setup.current.draft[index] = candidate;
    if (index < 5) {
      setup.current.step = index + 1;
      setup.current.collector.reset();
      setSetupStep(index + 1);
      setCapture(emptyCapture());
      selectString(index + 1);
      return;
    }
    const profile: GuitarBaseline = {version: 1, createdAt: new Date().toISOString(), deviceId: deviceRef.current, strings: [...setup.current.draft]};
    if (!parseBaseline(JSON.stringify(profile))) return;
    baselineRef.current = profile;
    setBaseline(profile);
    try {
      localStorage.setItem(baselineStorageKey, JSON.stringify(profile));
      setBaselineNotice('All six strings learned. Baseline saved on this device.');
    } catch {setBaselineNotice('All six strings learned. Baseline is active for this session; this browser could not save it.');}
    setup.current.step = null;
    setupOpen.current = false;
    setSetupStep(null);
    setCapture(emptyCapture());
    selectString(0, false);
    completed.current = new Set([0, 1, 2, 3, 4, 5]);
    setTunedStrings([...completed.current]);
    stop();
  }

  function resetBaseline() {
    baselineRef.current = null;
    setBaseline(null);
    try {localStorage.removeItem(baselineStorageKey); setBaselineNotice('Baseline cleared. Standard tuning references are active.');}
    catch {setBaselineNotice('Baseline is off for this session; this browser could not update saved storage.');}
    tracker.current.reset();
    clearTuningProgress();
    setFrequency(null);
  }

  return <main className="tuner-page">
    <header className="tuner-header">
      <div><p className="eyebrow">JAZZTRUM · GET READY TO PLAY</p><h1>Guitar tuner</h1><p>Six strings. One at a time. Let each note ring.</p></div>
      <button ref={back} onClick={onClose}>← Back to practice</button>
    </header>
    <section className="tuner-card" aria-label="Guitar tuner">
      <div className="tuner-topline"><span>{activeBaseline ? 'YOUR SAVED GUITAR BASELINE' : 'STANDARD TUNING · A4 = 440 Hz'}</span><span className={'tuner-mic ' + (status === 'listening' ? 'is-live' : '')}>{status === 'listening' ? '● Listening' : status === 'starting' ? 'Connecting microphone…' : 'Microphone off'}</span></div>
      <label className="tuner-auto"><input type="checkbox" checked={autoAdvance} onChange={event => changeAutoAdvance(event.target.checked)}/> Automatically tick and move to the next string</label>
      {setupStep === null ? <section className="baseline-banner" aria-label="Guitar baseline setup">
        <div><strong>{baseline ? 'Your six-string baseline' : 'Already tuned with another tuner?'}</strong><p>{baseline ? microphoneMatches ? 'Tuning is compared with the six strings you taught Jazztrum on this device.' : 'The microphone changed. Standard references are active; set up again for this input.' : 'Teach Jazztrum your tuned strings, from the thickest to the thinnest.'}</p></div>
        <div className="baseline-buttons"><button onClick={showSetup}>{baseline ? 'Redo six-string setup' : 'Set up my guitar'}</button>{baseline && <button onClick={resetBaseline}>Clear baseline</button>}</div>
      </section> : <section className="baseline-setup" aria-label="Six-string baseline setup">
        {setupStep === 'intro' ? <>
          <h2>First tune with your trusted tuner</h2>
          <p>Use standard tuning: <b>E · A · D · G · B · high E</b>. Then come back here with the same guitar, device, and microphone.</p>
          <p>We’ll ask for one open string at a time, starting with <b>string 6 — the thickest, lowest-sounding string</b>. Don’t turn the tuning pegs during this setup.</p>
          <p>Jazztrum will learn each string’s steady pitch and input level. {autoAdvance ? 'A green tick confirms each stable sample, then setup moves on automatically.' : 'Confirm each sample to move on. Turn on automatic advancement above for hands-free setup.'}</p>
          <div className="baseline-buttons"><button className="primary" disabled={status === 'starting'} onClick={beginSetup}>My guitar is tuned — begin</button><button onClick={cancelSetup}>Cancel setup</button></div>
        </> : <>
          <div className="baseline-step-top"><span>STEP {setupStep + 1} OF 6</span><button onClick={cancelSetup}>Cancel setup</button></div>
          <h2>Pluck string {guitarStrings[setupStep].number}: {guitarStrings[setupStep].label}</h2>
          <p>{setupStep === 0 ? 'The thickest string, with the lowest sound.' : setupStep === 5 ? 'The thinnest string, with the highest sound.' : `The next thinner string after ${guitarStrings[setupStep - 1].label}.`} Leave it open — no fingers on any fret. Mute the other strings and let it ring for a second.</p>
          <ol className="baseline-steps" aria-label="Six strings, thickest to thinnest">{guitarStrings.map((string, index) => <li key={string.note} aria-current={index === setupStep ? 'step' : undefined} className={index < setupStep || index === setupStep && capture.candidate ? 'complete' : ''}>{index < setupStep || index === setupStep && capture.candidate ? '✓ ' : ''}{string.number} · {string.label}</li>)}</ol>
          <progress aria-label="Steady sample progress" max="1" value={capture.progress}/>
          {capture.candidate && <div className="baseline-lock" role="status"><b aria-hidden="true">✓</b><strong>{guitarStrings[setupStep].label} locked in</strong><span>{autoAdvance ? setupStep === 5 ? 'Saving all six strings…' : `Next: string ${guitarStrings[setupStep + 1].number}, ${guitarStrings[setupStep + 1].label}` : 'Sample ready to confirm'}</span></div>}
          <p className="baseline-capture" role="status">{capture.candidate ? capture.candidate.harmonic === 2 ? autoAdvance ? `${guitarStrings[setupStep].label} learned through its upper overtone. Moving on automatically.` : `${guitarStrings[setupStep].label} learned through its upper overtone. Confirm you are plucking only string ${guitarStrings[setupStep].number} before continuing.` : `${guitarStrings[setupStep].label} learned — ${capture.candidate.frequency.toFixed(1)} Hz. ${autoAdvance ? 'Moving on automatically.' : 'Ready to confirm.'}` : capture.reason === 'wrong-note' ? 'That pitch does not match this string. Check the string and your trusted tuner, then pluck again.' : status !== 'listening' ? 'Tap Start listening below to continue.' : 'Listening for a steady note… Pluck again if it fades.'}</p>
          <button className="primary" disabled={!capture.candidate || status !== 'listening' || input === 'paused' || clipping} onClick={() => acceptString()}>{autoAdvance ? setupStep === 5 ? 'Save now' : 'Next string now' : setupStep === 5 ? 'Confirm high E & save baseline' : `Confirm ${guitarStrings[setupStep].label} & next string`}</button>
          <p className="baseline-note">Your previous baseline is kept unless you finish all six strings. Samples are learned locally; no audio is saved or uploaded.</p>
        </>}
      </section>}
      {baselineNotice && <p className="baseline-notice" role="status">{baselineNotice}</p>}
      {completionNotice && <p className="baseline-notice tuner-complete" role="status">{completionNotice}</p>}
      {setupStep === null && <>
      <div className="tuner-strings" aria-label="Choose a string, thickest to thinnest">
        {guitarStrings.map((string, index) => <button disabled={typeof setupStep === 'number'} key={string.note} aria-pressed={selected === index} onClick={() => selectString(index)} className={(selected === index ? 'selected ' : '') + (reading?.targetIndex === index && selected === null ? 'detected' : '')}>
          <small>STRING {string.number}{tunedStrings.includes(index) ? ' ✓' : ''}</small><b>{string.label}</b><span>{string.note} · {string.frequency.toFixed(1)} Hz</span>
        </button>)}
      </div>
      <div className="tuner-selection"><span>Thickest string → thinnest string</span><button disabled={typeof setupStep === 'number'} aria-pressed={selected === null} className={selected === null ? 'selected' : ''} onClick={() => {changeAutoAdvance(false); selectString(null);}}>Auto-detect string</button></div>
      <div className={'tuner-result ' + (reading?.inTune && !held ? 'in-tune' : '') + (held ? ' held-reading' : '')}>
        {lockedString !== null && <div className="tuner-lock" role="status"><b aria-hidden="true">✓</b><span>{guitarStrings[lockedString].label} locked in</span>{autoAdvance && selected !== null && <small>{nextUntunedString(lockedString, new Set(tunedStrings)) === null ? 'Finishing…' : `Next: ${guitarStrings[nextUntunedString(lockedString, new Set(tunedStrings))!].label}`}</small>}</div>}
        <p className="tuner-target">{target ? `Tuning ${target.label} · ${target.note}` : 'Listening for a string'}</p>
        {activeBaseline && target && <p className="baseline-reference">Your learned reference: {(reading?.reference ?? activeBaseline.strings[selected ?? 0].frequency).toFixed(1)} Hz{activeBaseline.strings[reading?.targetIndex ?? selected ?? 0].harmonic === 2 ? ' · learned overtone support' : ''}</p>}
        <div className="tuner-note">{reading?.note ?? '—'}</div>
        <strong className="tuner-feedback" role="status" aria-live="polite">{feedback}</strong>
        <p className="tuner-frequency">{frequency === null ? 'No steady pitch yet' : `${frequency.toFixed(1)} Hz${cents !== null ? ` · ${Math.round(cents) > 0 ? '+' : ''}${Math.round(cents)} cents` : ''}${held ? ' · last reading' : ''}`}</p>
      </div>
      <div className="tuner-gauge" aria-hidden="true">
        <div className="tuner-scale"><span>−50</span><span>−25</span><span>IN TUNE</span><span>+25</span><span>+50</span></div>
        <div className="tuner-track"><span className="tuner-sweetspot"/><span className={'tuner-needle ' + (cents === null ? 'is-waiting' : held ? 'is-held' : 'is-measured')} style={{left: `${50 + Math.max(-50, Math.min(50, cents ?? 0))}%`}}/></div>
        <div className="tuner-scale"><span>FLAT / TOO LOW</span><span>SHARP / TOO HIGH</span></div>
      </div>
      </>}
      <div className="tuner-actions"><button className="primary" onClick={active && input !== 'paused' ? stop : () => void start()}>{status === 'starting' ? 'Cancel' : input === 'paused' ? 'Restart listening' : status === 'listening' ? 'Stop listening' : 'Start listening'}</button><label>MIC LEVEL <meter min="0" max="100" value={level}/></label></div>
      <p className="tuner-input-status">{status !== 'listening' ? 'Tap Start listening, then pluck a string.' : input === 'quiet' ? 'Very little sound is reaching the microphone. Move the guitar closer and pluck again.' : input === 'unclear' ? 'Sound is reaching the microphone. Mute the other strings and let one note ring.' : input === 'paused' ? 'The browser paused audio. Tap Restart listening to continue.' : input === 'clipped' ? 'The microphone signal is too loud.' : input === 'clear' ? 'Microphone is hearing a clear note.' : 'Listening for your guitar…'}</p>
      {error && <p className="tuner-error" role="alert">{error}</p>}
      <p className="tuner-hint">{clipping ? 'Pluck more gently or move a little farther from the microphone.' : setupStep !== null ? 'Keep the tuning pegs unchanged during setup. Pluck only the highlighted string; wait for the tick before playing the next one.' : reading?.wrongString ? `Hearing ${reading.note}. Check the string before turning a tuning peg; the two E strings are different octaves.` : autoAdvance && selected !== null ? 'Hold each open string steady in the green range. Wait for its tick, then pluck the next highlighted string.' : 'Select a string and pluck it without holding a fret. Mute the other strings and make small adjustments.'}</p>
    </section>
    <footer className="tuner-footer"><p>The tuner listens on this device. Audio is not recorded or uploaded.</p><p>Background music pauses while tuning. This checks string tuning; practice scores still measure rhythm.</p></footer>
  </main>;
}
