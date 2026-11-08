import React, {useEffect, useRef, useState} from 'react';
import {detectPitch, guitarStrings, microphoneLevel, minimumPitchRms, PitchTracker, tuningReading} from './audio/pitch';
import './tuner.css';

type Status = 'off' | 'starting' | 'listening' | 'error';
type InputState = 'waiting' | 'quiet' | 'unclear' | 'clipped' | 'paused' | 'clear';

export function Tuner({onClose}: {onClose: () => void}) {
  const [status, setStatus] = useState<Status>('off');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(0);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const [input, setInput] = useState<InputState>('waiting');
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
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
    s.stream?.getTracks().forEach(track => track.stop());
    s.stream = null;
    if (s.ctx) void s.ctx.close().catch(() => {});
    s.ctx = null;
  }

  function stop() {
    release();
    setStatus('off');
    setFrequency(null);
    setHeld(false);
    setInput('waiting');
    setLevel(0);
    setClipping(false);
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
        const pitch = peak < 0.98 && ctx.state === 'running' ? detectPitch(data, ctx.sampleRate) : null;
        setInput(ctx.state !== 'running' ? 'paused' : peak >= 0.98 ? 'clipped' : pitch !== null ? 'clear' : rms < minimumPitchRms ? 'quiet' : 'unclear');
        if (peak >= 0.98 || ctx.state !== 'running') tracker.current.reset();
        const tracked = tracker.current.update(pitch, performance.now());
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

  const reading = frequency === null ? null : tuningReading(frequency, selected);
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
  function selectString(index: number | null) {
    tracker.current.reset();
    setSelected(index);
    setFrequency(null);
    setHeld(false);
  }

  return <main className="tuner-page">
    <header className="tuner-header">
      <div><p className="eyebrow">JAZZTRUM · GET READY TO PLAY</p><h1>Guitar tuner</h1><p>Six strings. One at a time. Let each note ring.</p></div>
      <button ref={back} onClick={onClose}>← Back to practice</button>
    </header>
    <section className="tuner-card" aria-label="Guitar tuner">
      <div className="tuner-topline"><span>STANDARD TUNING · A4 = 440 Hz</span><span className={'tuner-mic ' + (status === 'listening' ? 'is-live' : '')}>{status === 'listening' ? '● Listening' : status === 'starting' ? 'Connecting microphone…' : 'Microphone off'}</span></div>
      <div className="tuner-strings" aria-label="Choose a string, thickest to thinnest">
        {guitarStrings.map((string, index) => <button key={string.note} aria-pressed={selected === index} onClick={() => selectString(index)} className={(selected === index ? 'selected ' : '') + (reading?.targetIndex === index && selected === null ? 'detected' : '')}>
          <small>STRING {string.number}</small><b>{string.label}</b><span>{string.note} · {string.frequency.toFixed(1)} Hz</span>
        </button>)}
      </div>
      <div className="tuner-selection"><span>Thickest string → thinnest string</span><button aria-pressed={selected === null} className={selected === null ? 'selected' : ''} onClick={() => selectString(null)}>Auto-detect string</button></div>
      <div className={'tuner-result ' + (reading?.inTune && !held ? 'in-tune' : '') + (held ? ' held-reading' : '')}>
        <p className="tuner-target">{target ? `Tuning ${target.label} · ${target.note}` : 'Listening for a string'}</p>
        <div className="tuner-note">{reading?.note ?? '—'}</div>
        <strong className="tuner-feedback" role="status" aria-live="polite">{feedback}</strong>
        <p className="tuner-frequency">{frequency === null ? 'No steady pitch yet' : `${frequency.toFixed(1)} Hz${cents !== null ? ` · ${Math.round(cents) > 0 ? '+' : ''}${Math.round(cents)} cents` : ''}${held ? ' · last reading' : ''}`}</p>
      </div>
      <div className="tuner-gauge" aria-hidden="true">
        <div className="tuner-scale"><span>−50</span><span>−25</span><span>IN TUNE</span><span>+25</span><span>+50</span></div>
        <div className="tuner-track"><span className="tuner-sweetspot"/><span className={'tuner-needle ' + (cents === null ? 'is-waiting' : held ? 'is-held' : 'is-measured')} style={{left: `${50 + Math.max(-50, Math.min(50, cents ?? 0))}%`}}/></div>
        <div className="tuner-scale"><span>FLAT / TOO LOW</span><span>SHARP / TOO HIGH</span></div>
      </div>
      <div className="tuner-actions"><button className="primary" onClick={active && input !== 'paused' ? stop : () => void start()}>{status === 'starting' ? 'Cancel' : input === 'paused' ? 'Restart listening' : status === 'listening' ? 'Stop listening' : 'Start listening'}</button><label>MIC LEVEL <meter min="0" max="100" value={level}/></label></div>
      <p className="tuner-input-status">{status !== 'listening' ? 'Tap Start listening, then pluck a string.' : input === 'quiet' ? 'Very little sound is reaching the microphone. Move the guitar closer and pluck again.' : input === 'unclear' ? 'Sound is reaching the microphone. Mute the other strings and let one note ring.' : input === 'paused' ? 'The browser paused audio. Tap Restart listening to continue.' : input === 'clipped' ? 'The microphone signal is too loud.' : input === 'clear' ? 'Microphone is hearing a clear note.' : 'Listening for your guitar…'}</p>
      {error && <p className="tuner-error" role="alert">{error}</p>}
      <p className="tuner-hint">{clipping ? 'Pluck more gently or move a little farther from the microphone.' : reading?.wrongString ? `Hearing ${reading.note}. Check the string before turning a tuning peg; the two E strings are different octaves.` : 'Select a string and pluck it without holding a fret. Mute the other strings and make small adjustments.'}</p>
    </section>
    <footer className="tuner-footer"><p>The tuner listens on this device. Audio is not recorded or uploaded.</p><p>Background music pauses while tuning. This checks string tuning; practice scores still measure rhythm.</p></footer>
  </main>;
}
