import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getAudio, getSong, saveSong, type SongRecord} from '../library/store';
import {chordAt, formatTime} from '../library/chart';
import {ChordListener} from '../live/chordListener';
import {LoudnessGate} from '../game/chordCheck';
import {SongScorer, type TargetStatus} from '../game/scorer';
import {makeTargets} from '../game/targets';
import {ChordDiagram} from './ChordDiagram';
import {ChartEditor} from './ChartEditor';
import type {Segment} from '../library/chart';

type Props = {id: string; onBack: () => void; onOpenTuner: () => void; onOpenLab: () => void};
type Phase = 'idle' | 'getready' | 'playing' | 'paused';

const secondsAhead = 8;
const quietSeconds = 1;   // listening to the room before the music starts
const leakSeconds = 1;    // listening to the first moment of the music, to catch the speaker leaking into the mic
const leakWarningLevel = 0.01;
const colours: Record<TargetStatus, string> = {pending: '#6ee5c1', hit: '#5be07d', miss: '#e8665f', skipped: '#8a8f93'};

function storedOffset() {
  try {return Number(localStorage.getItem('offset')) || 0;} catch {return 0;}
}

export function SongScreen({id, onBack, onOpenTuner, onOpenLab}: Props) {
  const [song, setSong] = useState<SongRecord | null | undefined>(undefined);
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [hits, setHits] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [warning, setWarning] = useState('');
  const [listenerOn, setListenerOn] = useState(true);
  const [editing, setEditing] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const pauseRef = useRef<(finished?: boolean) => void>(() => undefined);
  const audio = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const messageTimer = useRef(0);
  const live = useRef({
    ctx: null as AudioContext | null, stream: null as MediaStream | null, listener: null as ChordListener | null,
    timer: 0, gate: new LoudnessGate(), gated: false, stage: 'off' as 'off' | 'quiet' | 'leak' | 'live', stageStart: 0,
    previous: [] as TargetStatus[], run: 0, clock: {media: 0, wall: 0}, best: 0,
  });

  const targets = useMemo(() => (song ? makeTargets(song.chart.segments) : []), [song]);
  const scorer = useMemo(() => new SongScorer(targets), [targets]);
  useEffect(() => setTotal(scorer.total), [scorer]);

  const say = useCallback((text: string, ms = 3000) => {
    setMessage(text);
    window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(''), ms);
  }, []);

  useEffect(() => {
    let made = '';
    (async () => {
      const [record, blob] = await Promise.all([getSong(id), getAudio(id)]);
      if (record) live.current.best = record.best;
      setSong(record ?? null);
      if (blob) {made = URL.createObjectURL(blob); setUrl(made);}
    })().catch(() => setSong(null));
    return () => { if (made) URL.revokeObjectURL(made); };
  }, [id]);

  function releaseMic() {
    const l = live.current;
    window.clearInterval(l.timer);
    l.listener?.close();
    l.stream?.getTracks().forEach(t => t.stop());
    void l.ctx?.close();
    l.listener = null; l.stream = null; l.ctx = null; l.stage = 'off';
  }

  async function keepBest() {
    if (!song) return;
    const l = live.current;
    if (scorer.hits > l.best) {
      l.best = scorer.hits;
      await saveSong({...song, best: scorer.hits}).catch(() => undefined);
    }
  }

  function pause(finished = false) {
    const a = audio.current;
    a?.pause();
    releaseMic();
    if (finished) {
      scorer.finish();
      setHits(scorer.hits); setTotal(scorer.total);
      say(`Finished: ${scorer.hits} of ${scorer.total} chords`, 8000);
    }
    void keepBest();
    setPhase('paused');
  }

  // Runs every 50 ms while playing: learn how loud the room is, then score what the guitar plays.
  function tick() {
    const l = live.current, a = audio.current;
    if (!l.listener || !a) return;
    const elapsed = (performance.now() - l.stageStart) / 1000;
    if (l.stage === 'quiet') {
      l.gate.learn(l.listener.read(0).level);
      if (elapsed >= quietSeconds) {
        l.stage = 'leak'; l.stageStart = performance.now();
        void a.play();
        setPhase('playing');
      }
      return;
    }
    if (l.stage === 'leak') {
      const level = l.listener.read(0).level;
      if (level > leakWarningLevel) setWarning('I can hear the recording through the microphone. Use headphones, or turn the volume down, or the score will not be fair.');
      l.gate.learn(level);
      if (elapsed >= leakSeconds) {
        l.stage = 'live'; l.gated = true;
        scorer.skipBefore(a.currentTime);
      }
      return;
    }
    const frame = l.listener.read(l.gate.value);
    scorer.feed(a.currentTime, frame);
    setHits(scorer.hits); setTotal(scorer.total);
    scorer.states.forEach((s, i) => {
      if (s.status === 'miss' && l.previous[i] !== 'miss') say(s.heard ? `Missed ${targets[i].chord}: I heard ${s.heard}` : `Missed ${targets[i].chord}: I did not hear it`, 2000);
    });
    l.previous = scorer.states.map(s => s.status);
  }

  pauseRef.current = pause;

  async function play() {
    const a = audio.current, l = live.current;
    if (!a || phase === 'getready' || phase === 'playing') return;
    setWarning('');
    if (a.ended || a.currentTime >= a.duration - 0.05) {a.currentTime = 0; scorer.seek(0);}
    scorer.setShift(storedOffset() / 1000 * speed);
    l.previous = scorer.states.map(s => s.status);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('no microphone');
      const ctx = new AudioContext();
      await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
      l.ctx = ctx; l.stream = stream;
      l.listener = new ChordListener(ctx, ctx.createMediaStreamSource(stream));
      setListenerOn(true);
    } catch {
      setListenerOn(false);
      say('The microphone is not available, so this will play without scoring.', 5000);
      void a.play();
      setPhase('playing');
      return;
    }
    l.stageStart = performance.now();
    l.stage = l.gated ? 'live' : 'quiet';
    if (l.gated) {void a.play(); setPhase('playing');} else setPhase('getready');
    l.timer = window.setInterval(tick, 50);
  }

  useEffect(() => {
    const a = audio.current;
    if (a) {
      a.playbackRate = speed;
      a.preservesPitch = true;
      (a as HTMLAudioElement & {webkitPreservesPitch?: boolean}).webkitPreservesPitch = true;
    }
    scorer.setShift(storedOffset() / 1000 * speed);
  }, [speed, url, scorer]);

  // Leaving the screen, or the page being hidden, stops the music and releases the microphone.
  useEffect(() => {
    const hidden = () => { if (document.hidden && (live.current.stage !== 'off' || audio.current?.paused === false)) pauseRef.current(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      audio.current?.pause();
      releaseMic();
      window.clearTimeout(messageTimer.current);
    };
  }, [song?.id]);

  // The scrolling timeline.
  useEffect(() => {
    if (!song) return;
    let frame = 0;
    function smoothTime() {
      const a = audio.current;
      if (!a) return 0;
      const clock = live.current.clock, now = performance.now();
      if (a.paused || a.seeking) {live.current.clock = {media: a.currentTime, wall: now}; return a.currentTime;}
      if (a.currentTime !== clock.media) live.current.clock = {media: a.currentTime, wall: now};
      return live.current.clock.media + Math.min(0.25, (now - live.current.clock.wall) / 1000 * a.playbackRate);
    }
    function draw() {
      const c = canvas.current;
      if (c) {
        const t = smoothTime(), d = c.getContext('2d')!, w = c.width, h = c.height, pps = (w - 150) / secondsAhead;
        d.clearRect(0, 0, w, h);
        d.fillStyle = '#563c30'; d.fillRect(0, 0, w, h);
        targets.forEach((target, i) => {
          const x0 = Math.max(70, 120 + (target.start - t) * pps), x1 = Math.min(w, 120 + (target.end - t) * pps);
          if (x1 < 70 || x0 > w || x1 - x0 < 2) return;
          const status = scorer.states[i]?.status ?? 'pending';
          d.fillStyle = target.low && status === 'pending' ? '#d9c98a' : colours[status];
          d.fillRect(x0, 18, x1 - x0 - 3, h - 36);
          if (target.low && status === 'pending') {
            d.save(); d.beginPath(); d.rect(x0, 18, x1 - x0 - 3, h - 36); d.clip();
            d.strokeStyle = '#563c30'; d.lineWidth = 3;
            for (let k = -h; k < x1 - x0; k += 14) {d.beginPath(); d.moveTo(x0 + k, h - 18); d.lineTo(x0 + k + h, 18); d.stroke();}
            d.restore();
          }
          d.fillStyle = '#102a35'; d.font = 'bold 26px sans-serif';
          d.fillText(target.chord, Math.max(x0 + 8, 76), h / 2 + 9, Math.max(20, x1 - x0 - 12));
        });
        d.strokeStyle = '#fff5a5'; d.lineWidth = 5; d.shadowColor = '#ffdc76'; d.shadowBlur = 18;
        d.beginPath(); d.moveTo(120, 0); d.lineTo(120, h); d.stroke(); d.shadowBlur = 0;
        setTime(Math.floor(t * 4) / 4);
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [song, targets, scorer]);

  // A corrected chart is saved at once and the score starts again from nothing.
  function changeSegments(segments: Segment[], tuningCents?: number) {
    if (!song) return;
    const record = {...song, chart: {...song.chart, segments, tuningCents: tuningCents ?? song.chart.tuningCents}};
    setSong(record);
    setHits(0);
    void saveSong(record).catch(() => say('Could not save this change on this device.', 4000));
  }
  function seekTo(t: number) {
    const a = audio.current;
    if (!a) return;
    a.currentTime = t;
    scorer.seek(t);
  }

  if (song === undefined) return <main><p>Loading…</p></main>;
  if (!song) return <main><p>This song could not be found.</p><button onClick={onBack}>Back to songs</button></main>;

  const segments = song.chart.segments;
  const now = chordAt(segments, time);
  const next = now ? segments.find(s => s.start >= now.end - 1e-6 && s.chord !== 'N') : undefined;
  const busy = phase === 'getready' || phase === 'playing';
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">JAZZTRUM · {formatTime(time)} / {formatTime(song.chart.duration)}</p>
          <h1>{song.title}</h1>
        </div>
        <div className="scores"><b>{hits}</b><span>OF {total}<br />Best {Math.max(song.best, live.current.best)}</span></div>
      </header>
      <section className="top">
        <div className="chords">
          <div><small>PLAY THIS</small>{now && <ChordDiagram name={now.chord} />}</div>
          <div className="next"><small>NEXT</small>{next && <ChordDiagram name={next.chord} />}</div>
        </div>
        <div className="status">
          <strong>{phase === 'getready' ? 'Hold still, listening to the room…' : message || (phase === 'playing' ? 'Play along!' : 'Ready when you are')}</strong>
          <p>{listenerOn ? 'Use headphones so the microphone only hears your guitar.' : 'Scoring is off: the microphone is not available.'}</p>
        </div>
      </section>
      {warning && <p role="alert" className="warning">{warning}</p>}
      <canvas ref={canvas} width="1200" height="215" aria-label="Chord timeline" />
      <audio ref={audio} src={url} preload="auto" playsInline onPlay={() => setAudioPlaying(true)} onPause={() => setAudioPlaying(false)} onEnded={() => (editing ? setAudioPlaying(false) : pause(true))} />
      <nav>
        <button onClick={onBack}>Songs</button>
        <button onClick={onOpenTuner}>Tune guitar</button>
        <button onClick={onOpenLab}>Chord lab</button>
        <label className="speed">Speed{' '}
          <select aria-label="Speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
            <option value={1}>Normal</option><option value={0.75}>3/4 speed</option><option value={0.5}>1/2 speed</option>
          </select>
        </label>
        {editing
          ? <button className="primary" onClick={() => (audioPlaying ? audio.current?.pause() : void audio.current?.play())}>{audioPlaying ? '❚❚ Stop' : '▶ Listen'}</button>
          : busy ? <button className="primary" onClick={() => pause()}>❚❚ Pause</button> : <button className="primary" onClick={play}>♪ Play</button>}
        <button disabled={busy} onClick={() => {audio.current?.pause(); setEditing(!editing);}}>{editing ? '✔ Done editing' : '✎ Edit chords'}</button>
        <button onClick={() => {const a = audio.current; if (a) {a.currentTime = 0; scorer.seek(0); setHits(0); setTotal(scorer.total);}}}>⏮ Start</button>
      </nav>
      {editing && <ChartEditor song={song} time={time} getTime={() => audio.current?.currentTime ?? 0} seek={seekTo} onSegments={changeSegments} />}
      <input className="seek" type="range" min={0} max={song.chart.duration} step={0.1} value={time} aria-label="Position in song"
        onChange={e => {const a = audio.current, v = Number(e.target.value); if (a) {a.currentTime = v; scorer.seek(v); setHits(scorer.hits); setTotal(scorer.total);}}} />
    </main>
  );
}
