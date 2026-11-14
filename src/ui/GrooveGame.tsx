import {useEffect, useRef, useState, type ReactNode} from 'react';
import {bpm, chords, strums, backing, groove} from '../data/song';
import {judge} from '../game/judge';
import {tone, pluck, drum, keys} from '../audio/synth';
import {beatLength, eventTime, audibleTime} from '../audio/clock';
import {ChordDiagram} from './ChordDiagram';
import {ChordListener} from '../live/chordListener';
import {ChordCheck, LoudnessGate} from '../game/chordCheck';

type Mode = 'stop' | 'play' | 'watch' | 'calibrate';

function stored(key: string) {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function save(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage may be unavailable */
  }
}

const beatsPerLoop = 32;
const chordWindowSeconds = 0.4;

// The built in song: a looping eight bar groove with a scrolling strum timeline.
export function GrooveGame({songChoice, onOpenTuner, onOpenLab}: {songChoice: ReactNode; onOpenTuner: () => void; onOpenLab: () => void}) {
  const [mode, setMode] = useState<Mode>('stop');
  const [speed, setSpeed] = useState(1);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => stored('best'));
  const [feedback, setFeedback] = useState('');
  const [current, setCurrent] = useState(0);
  const [level, setLevel] = useState(0);
  const [help, setHelp] = useState(false);
  const [offset, setOffset] = useState(() => stored('offset'));
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    ctx: null as AudioContext | null,
    stream: null as MediaStream | null,
    analyser: null as AnalyserNode | null,
    mode: 'stop' as Mode,
    start: 0,
    used: new Set<string>(),
    last: -100,
    quietUntil: 0,
    average: 0,
    scheduled: 0,
    melodyIndex: 0,
    grooveIndex: 0,
    session: 0,
    timer: 0,
    guide: true,
    speed: 1,
    bus: null as GainNode | null,
    cal: [] as number[],
    score: 0,
    offset: stored('offset'),
    listener: null as ChordListener | null,
    gate: new LoudnessGate(),
    pending: null as ChordCheck | null,
    lastRead: 0,
  });

  function stop() {
    const s = state.current;
    s.session++;
    window.clearInterval(s.timer);
    s.bus?.disconnect();
    s.bus = null;
    s.stream?.getTracks().forEach(t => t.stop());
    s.stream = null;
    s.analyser = null;
    s.listener?.close();
    s.listener = null;
    s.pending = null;
    s.mode = 'stop';
    setMode('stop');
    setLevel(0);
  }

  async function start(next: Mode) {
    stop();
    const s = state.current;
    const beatSeconds = beatLength(bpm, s.speed);
    const session = ++s.session;
    const ctx = s.ctx || new AudioContext();
    s.ctx = ctx;
    await ctx.resume();
    if (s.session !== session) return;
    s.mode = next;
    setMode(next);
    s.used = new Set();
    s.last = -100;
    s.average = 0;
    s.cal = [];
    s.score = 0;
    setScore(0);
    setFeedback('');
    if (next !== 'watch') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false},
        });
        if (s.session !== session) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        s.stream = stream;
        const source = ctx.createMediaStreamSource(stream);
        s.analyser = ctx.createAnalyser();
        s.analyser.fftSize = 512;
        source.connect(s.analyser);
        s.listener = new ChordListener(ctx, source);
        s.gate = new LoudnessGate();
        s.pending = null;
      } catch {
        setFeedback('Mic unavailable — tap the neck!');
      }
    }
    if (s.session !== session) return;
    const now = ctx.currentTime;
    s.start = now + (next === 'watch' ? 0.3 : 4 * beatSeconds);
    s.scheduled = 0;
    s.melodyIndex = 0;
    s.grooveIndex = 0;
    s.bus = ctx.createGain();
    s.bus.connect(ctx.destination);
    if (next === 'play') {
      for (let i = 0; i < 4; i++) tone(ctx, now + i * beatSeconds, i === 3 ? 880 : 660, 0.07, 0.1, s.bus);
    }
    if (next === 'calibrate') {
      s.start = now + 0.5;
      for (let i = 0; i < 8; i++) tone(ctx, s.start + i * beatSeconds, 660, 0.07, 0.1, s.bus);
      s.quietUntil = now + 0.1;
    }
    if (next === 'play' || next === 'watch') {
      schedule();
      s.timer = window.setInterval(schedule, 25);
    }
  }

  // Called when a strum (or a tap on the neck) is detected at audio time `time`.
  function hit(time: number, fromMic = false) {
    const s = state.current;
    const beatSeconds = beatLength(bpm, s.speed);
    const loopSeconds = beatsPerLoop * beatSeconds;
    if (!s.ctx || s.mode === 'stop' || s.mode === 'watch' || time - s.last < 0.15 || time < s.quietUntil || s.pending) return;
    s.last = time;

    if (s.mode === 'calibrate') {
      const i = Math.round((time - s.start) / beatSeconds);
      if (i >= 0 && i < 8 && !s.used.has(String(i)) && Math.abs(time - (s.start + i * beatSeconds)) < 0.35) {
        s.used.add(String(i));
        s.cal.push((time - (s.start + i * beatSeconds)) * 1000);
        setFeedback(`${s.cal.length} of 8`);
        if (s.cal.length === 8) {
          const n = Math.round(s.cal.reduce((a, b) => a + b, 0) / 8);
          s.offset = n;
          setOffset(n);
          save('offset', n);
          stop();
          setFeedback('Calibration saved!');
        }
      }
      return;
    }

    const loop = Math.floor((time - s.start) / loopSeconds);
    const targets = [loop - 1, loop, loop + 1]
      .filter(n => n >= 0)
      .flatMap(n => strums.map((x, i) => ({id: `${n}-${i}`, time: eventTime(s.start, n * beatsPerLoop + x.beat, bpm, s.speed)})));
    const result = judge(time, targets, s.used, s.offset);
    if (!result) return;
    s.used.add(result.id);
    if (result.result === 'Nailed!' && fromMic && s.listener) {
      // Good timing from a real strum: now listen for the right chord to ring out.
      const chord = strums[Number(result.id.split('-')[1])].chord;
      s.pending = new ChordCheck(result.id, chord, time + chordWindowSeconds);
      setFeedback('Listening for the chord…');
      return;
    }
    setFeedback(result.result);
    if (result.result === 'Nailed!') scoreNailed(time);
  }

  function scoreNailed(time: number) {
    const s = state.current;
    s.score++;
    setScore(s.score);
    setBest(old => {
      const next = Math.max(old, s.score);
      save('best', next);
      return next;
    });
    tone(s.ctx!, time + 0.01, 880, 0.22, 0.08, s.bus!);
    s.quietUntil = time + 0.25;
  }

  // Reads the chord listener about 20 times a second and settles any strum waiting for a chord.
  function listenForChord(audioNow: number, elapsed: number) {
    const s = state.current;
    if (!s.listener || performance.now() - s.lastRead < 50) return;
    s.lastRead = performance.now();
    if (elapsed < 0) {
      // Count-in: learn how loud the room is, so the gate sits clearly above it.
      s.gate.learn(s.listener.read(0).level);
      return;
    }
    const frame = s.listener.read(s.gate.value);
    if (!s.pending) return;
    const outcome = s.pending.update(frame, audioNow);
    if (outcome.state === 'waiting') return;
    s.pending = null;
    if (outcome.state === 'hit') {
      setFeedback('Nailed!');
      scoreNailed(audioNow);
    } else {
      setFeedback(outcome.heard ? `Right time, wrong chord (I heard ${outcome.heard})` : 'Right time, but I could not hear a chord');
    }
  }

  // Queues the backing track and guide strums slightly ahead of the audio clock.
  function schedule() {
    const s = state.current;
    const ctx = s.ctx;
    if (!ctx) return;
    const beatSeconds = beatLength(bpm, s.speed);
    const now = ctx.currentTime;
    if (!((s.mode === 'watch' || s.mode === 'play') && s.bus)) return;

    while (true) {
      const n = s.melodyIndex;
      const note = backing[n % backing.length];
      const t = eventTime(s.start, Math.floor(n / backing.length) * beatsPerLoop + note.beat, bpm, s.speed);
      if (t > now + 0.15) break;
      s.melodyIndex++;
      if (t >= now && note.melody) keys(ctx, t, note.melody, Math.max(0.08, note.duration * beatSeconds * 0.8), s.bus);
    }
    while (true) {
      const n = s.grooveIndex;
      const step = groove[n % groove.length];
      const t = eventTime(s.start, Math.floor(n / groove.length) * beatsPerLoop + step.beat, bpm, s.speed);
      if (t > now + 0.15) break;
      s.grooveIndex++;
      if (t >= now) {
        tone(ctx, t, step.bass, beatSeconds * 0.4, 0.1, s.bus);
        drum(ctx, t, 'kick', s.bus);
        if (step.beatInBar % 2 === 1) drum(ctx, t, 'snare', s.bus);
      }
    }
    if (s.mode === 'watch' || s.guide) {
      while (true) {
        const n = s.scheduled;
        const note = strums[n % strums.length];
        const t = eventTime(s.start, Math.floor(n / strums.length) * beatsPerLoop + note.beat, bpm, s.speed);
        if (t > now + 0.15) break;
        s.scheduled++;
        if (t >= now) {
          const notes = note.chord === 'Em' ? [82.4, 123.5, 164.8, 196, 246.9, 329.6] : [110, 164.8, 246.9, 277.18, 392];
          notes.forEach((f, i) => pluck(ctx, t + i * 0.025, f, s.bus!));
        }
      }
    }
  }

  useEffect(() => {
    let frame = 0;
    function draw() {
      const s = state.current;
      const ctx = s.ctx;
      const c = canvas.current;
      const beatSeconds = beatLength(bpm, s.speed);
      const loopSeconds = beatsPerLoop * beatSeconds;
      if (ctx && c && s.mode !== 'stop') {
        const now = ctx.currentTime;
        const elapsed = audibleTime(ctx) - s.start;
        if (s.analyser) {
          const data = new Float32Array(s.analyser.fftSize);
          s.analyser.getFloatTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);
          setLevel(Math.min(100, rms * 600));
          if (rms > Math.max(0.018, s.average * 2.8) && rms - s.average > 0.012) hit(now, true);
          s.average = s.average * 0.96 + rms * 0.04;
        }
        listenForChord(now, elapsed);
        if (elapsed >= 0) setCurrent(Math.floor((elapsed / beatSeconds % beatsPerLoop) / 4));

        const d = c.getContext('2d')!;
        const w = c.width;
        const h = c.height;
        d.clearRect(0, 0, w, h);
        d.fillStyle = '#563c30';
        d.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) {
          d.strokeStyle = '#e9cda3';
          d.lineWidth = 1 + i * 0.35;
          d.beginPath();
          d.moveTo(0, 35 + i * 29);
          d.lineTo(w, 35 + i * 29);
          d.stroke();
        }
        for (let beat = Math.max(0, Math.floor(elapsed / beatSeconds)); beat * beatSeconds < elapsed + 4; beat++) {
          const x = 120 + (beat * beatSeconds - elapsed) * (w - 150) / 4;
          d.strokeStyle = beat % 4 === 0 ? '#e3d199' : '#8d7869';
          d.lineWidth = beat % 4 === 0 ? 3 : 1;
          d.beginPath();
          d.moveTo(x, 0);
          d.lineTo(x, h);
          d.stroke();
          d.fillStyle = '#fff';
          d.font = '14px sans-serif';
          d.fillText(String(beat % 4 + 1), x + 4, h - 5);
        }
        d.strokeStyle = '#fff5a5';
        d.lineWidth = 5;
        d.shadowColor = '#ffdc76';
        d.shadowBlur = 18;
        d.beginPath();
        d.moveTo(120, 0);
        d.lineTo(120, h);
        d.stroke();
        d.shadowBlur = 0;
        const loop = Math.max(0, Math.floor(elapsed / loopSeconds) - 1);
        for (let l = loop; l <= loop + 2; l++) {
          for (const target of strums) {
            const delta = l * loopSeconds + target.beat * beatSeconds - elapsed;
            const x = 120 + delta * (w - 150) / 4;
            if (x < 70 || x > w) continue;
            d.fillStyle = target.chord === 'Em' ? '#6ee5c1' : '#ffc36e';
            d.fillRect(x - 4, 15, 8, h - 30);
            d.font = 'bold 20px sans-serif';
            d.fillText(target.chord, x - 14, 24);
          }
        }
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', hidden);
      stop();
    };
  }, []);

  const status = feedback || (mode === 'stop' ? 'Ready to rock?' : mode === 'watch' ? 'Listen and watch' : mode === 'calibrate' ? 'Strum with each click' : 'Your turn!');
  const hint = mode === 'play' ? 'Tap the neck or strum your guitar.' : mode === 'watch' ? 'Listen to the rhythm.' : 'Pick Watch or Play to begin.';

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">JAZZTRUM · {Math.round(bpm * speed)} BPM</p>
          <h1>Jasper’s Disco Groove</h1>
          <p>Strum when the colour reaches the glowing line!</p>
        </div>
        <div className="scores">
          <b>{score}</b>
          <span>NAILED<br />Best {best}</span>
        </div>
      </header>
      <section className="top">
        <div className="chords">
          <div>
            <small>PLAY THIS</small>
            <ChordDiagram name={chords[current]} />
          </div>
          <div className="next">
            <small>NEXT BAR</small>
            <ChordDiagram name={chords[(current + 1) % 8]} />
          </div>
        </div>
        <div className="status">
          <strong>{status}</strong>
          <p>{hint}</p>
          <label>MIC <meter min="0" max="100" value={level} /></label>
        </div>
      </section>
      <canvas
        ref={canvas}
        width="1200"
        height="215"
        onPointerDown={() => {
          const c = state.current.ctx;
          if (c) hit(c.currentTime);
        }}
        aria-label="Guitar neck. Tap to strum."
      />
      <nav>
        <button onClick={() => { stop(); onOpenTuner(); }}>Tune guitar</button>
        <button onClick={() => { stop(); onOpenLab(); }}>Chord lab</button>
        {songChoice}
        <label className="speed">
          Speed{' '}
          <select
            aria-label="Speed"
            value={speed}
            disabled={mode !== 'stop'}
            onChange={e => {
              const next = Number(e.target.value);
              state.current.speed = next;
              setSpeed(next);
            }}
          >
            <option value={1}>Normal</option>
            <option value={0.5}>1/2 speed</option>
            <option value={0.25}>1/4 speed</option>
          </select>
        </label>
        <button onClick={() => start('watch')}>▶ Watch</button>
        <button className="primary" onClick={() => start('play')}>♪ Play</button>
        <button onClick={() => { state.current.guide = !state.current.guide; setFeedback(state.current.guide ? 'Guide on' : 'Guide off'); }}>Guide on/off</button>
        <button onClick={stop}>■ Stop</button>
        <button onClick={() => start('calibrate')}>Timing calibration</button>
        <button onClick={() => setHelp(!help)}>Help</button>
      </nav>
      {help && (
        <aside>
          <button onClick={() => setHelp(false)}>Close</button>
          <h2>Let's play!</h2>
          <p>Watch first to hear the song. Then tap Play and strum when a coloured mark reaches the glowing line. You can also tap the neck.</p>
          <p>Em uses two fingers. For A9, start on the A string and avoid the thick low E string. Jazztrum listens for your strum and then checks that the right chord rings out. Use headphones, or keep the volume low, so it does not hear itself.</p>
          <p>Tune guitar checks each open string’s pitch. A strum scores when it is on the beat and the chord is right. Chord lab shows what the microphone hears. If the microphone is off, tapping the neck scores timing only.</p>
          <p>Timing calibration: strum along with all eight clicks. Offset: {offset} ms. Use the iPad speaker or wired headphones.</p>
        </aside>
      )}
    </main>
  );
}
