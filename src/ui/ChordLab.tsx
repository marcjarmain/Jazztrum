import {useEffect, useRef, useState} from 'react';
import {ChordListener, type LiveFrame} from '../live/chordListener';
import {rankChords, triads, verifyChord} from '../dsp/templates';
import {microphoneLevel} from '../audio/pitch';

const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// A diagnostic screen: shows exactly what the chord listener hears, so thresholds can be judged on a real guitar.
export function ChordLab({onClose}: {onClose: () => void}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [expected, setExpected] = useState('Em');
  const [gate, setGate] = useState(0.002);
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const run = useRef<{ctx: AudioContext; stream: MediaStream; listener: ChordListener; timer: number} | null>(null);

  function stop() {
    const r = run.current;
    if (!r) return;
    window.clearInterval(r.timer);
    r.listener.close();
    r.stream.getTracks().forEach(t => t.stop());
    void r.ctx.close();
    run.current = null;
    setListening(false);
    setFrame(null);
  }

  async function start() {
    setError('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open Jazztrum using its HTTPS web address to use the microphone.');
      const ctx = new AudioContext();
      await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
      const listener = new ChordListener(ctx, ctx.createMediaStreamSource(stream));
      const timer = window.setInterval(() => setFrame(listener.read(gateRef.current)), 50);
      run.current = {ctx, stream, listener, timer};
      setListening(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the microphone.');
    }
  }

  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      stop();
    };
  }, []);

  const top = frame?.active ? rankChords(frame.chroma).slice(0, 3) : [];
  const check = frame?.active ? verifyChord(frame.chroma, expected) : null;
  return (
    <main className="lab">
      <header>
        <div>
          <p className="eyebrow">JAZZTRUM · CHORD LAB</p>
          <h1>What I hear</h1>
          <p>Strum a chord and let it ring. This shows what the chord listener sees.</p>
        </div>
        <button onClick={() => { stop(); onClose(); }}>Back</button>
      </header>
      <nav>
        {listening ? <button onClick={stop}>■ Stop listening</button> : <button className="primary" onClick={start}>🎤 Start listening</button>}
        <label className="speed">Check against{' '}
          <select value={expected} onChange={e => setExpected(e.target.value)}>
            {triads.map(t => <option key={t.name}>{t.name}</option>)}
          </select>
        </label>
        <label className="speed">Quiet cut-off{' '}
          <select value={gate} onChange={e => setGate(Number(e.target.value))}>
            {[0.001, 0.002, 0.005, 0.01, 0.02].map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </nav>
      {error && <p role="alert">{error}</p>}
      <section className="lab-panel">
        <label>Loudness <meter min="0" max="100" value={frame ? microphoneLevel(frame.level) : 0} /> {frame ? frame.level.toFixed(4) : ''}</label>
        <div className="chroma-bars" aria-label="Note energy">
          {notes.map((n, i) => (
            <div key={n}><i style={{height: `${Math.round((frame?.active ? frame.chroma[i] : 0) * 100)}%`}} /><span>{n}</span></div>
          ))}
        </div>
        <h2>{!listening ? 'Not listening' : !frame?.active ? 'Waiting for a chord' : top[0].name}</h2>
        <ol>{top.map(t => <li key={t.name}>{t.name} <small>{t.similarity.toFixed(2)}</small></li>)}</ol>
        {check && <p>Against {expected}: <strong>{check.ok ? '✓ matches' : '✗ no'}</strong> <small>(similarity {check.similarity.toFixed(2)}, place {check.rank})</small></p>}
      </section>
    </main>
  );
}
