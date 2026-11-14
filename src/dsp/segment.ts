import {chroma as frameChroma, estimateTuning, settings, normalise} from './chroma';
import {triads} from './templates';

export type Segment = {start: number; end: number; chord: string; confidence: number; edited?: boolean};

// Chroma for every frame of the recording. Silent frames are all zeros.
export function chromaFrames(samples: Float32Array, sampleRate: number, tuningCents: number, onProgress?: (fraction: number) => void) {
  const size = settings.frameSize, hop = settings.hopSize;
  const count = Math.max(0, Math.floor((samples.length - size) / hop) + 1);
  const frames: Float32Array[] = [];
  for (let f = 0; f < count; f++) {
    frames.push(frameChroma(samples.subarray(f * hop, f * hop + size), sampleRate, tuningCents));
    if (onProgress && f % 200 === 0) onProgress(f / count);
  }
  return frames;
}

function smooth(frames: Float32Array[], radius: number) {
  return frames.map((_, i) => {
    const sum = new Float32Array(12);
    let any = false;
    for (let j = Math.max(0, i - radius); j <= Math.min(frames.length - 1, i + radius); j++) {
      for (let k = 0; k < 12; k++) sum[k] += frames[j][k];
      any = any || frames[j].some(x => x > 0);
    }
    return any ? normalise(sum) : sum;
  });
}

// Turn per frame chroma into chord segments that cover 0 to `duration` with no gaps.
export function segmentChords(frames: Float32Array[], sampleRate: number, duration: number, penalty = settings.changePenalty): Segment[] {
  const secondsPerFrame = settings.hopSize / sampleRate;
  if (!frames.length) return [{start: 0, end: duration, chord: 'N', confidence: 0}];
  const smoothed = smooth(frames, settings.smoothFrames);
  const states = triads.length + 1; // last state is "no chord"
  const silent = (f: Float32Array) => !f.some(x => x > 0);
  const sim = smoothed.map(f => {
    const s = new Float32Array(states);
    if (silent(f)) { s[states - 1] = 1; return s; }
    for (let k = 0; k < triads.length; k++) {
      let dot = 0;
      for (let i = 0; i < 12; i++) dot += f[i] * triads[k].template[i];
      s[k] = dot;
    }
    return s;
  });
  // Viterbi: best path with a penalty for every chord change.
  const n = sim.length;
  const back = new Uint8Array(n * states);
  let score = Float32Array.from(sim[0]);
  for (let t = 1; t < n; t++) {
    let bestPrev = 0;
    for (let s = 1; s < states; s++) if (score[s] > score[bestPrev]) bestPrev = s;
    const next = new Float32Array(states);
    for (let s = 0; s < states; s++) {
      const stay = score[s], move = score[bestPrev] - penalty;
      if (stay >= move) {next[s] = stay + sim[t][s]; back[t * states + s] = s;}
      else {next[s] = move + sim[t][s]; back[t * states + s] = bestPrev;}
    }
    score = next;
  }
  const path = new Uint8Array(n);
  let s = 0;
  for (let k = 1; k < states; k++) if (score[k] > score[s]) s = k;
  for (let t = n - 1; t >= 0; t--) {path[t] = s; s = back[t * states + s];}

  const name = (k: number) => (k === states - 1 ? 'N' : triads[k].name);
  type Run = {first: number; last: number; k: number};
  let runs: Run[] = [];
  for (let t = 0; t < n; t++) {
    const prev = runs[runs.length - 1];
    if (prev && prev.k === path[t]) prev.last = t;
    else runs.push({first: t, last: t, k: path[t]});
  }
  const meanSim = (r: Run, k: number) => {
    let sum = 0;
    for (let t = r.first; t <= r.last; t++) sum += sim[t][k];
    return sum / (r.last - r.first + 1);
  };
  // Merge runs shorter than the minimum into the more similar neighbour.
  const minFrames = Math.ceil(settings.minSegmentSeconds / secondsPerFrame);
  for (let changed = true; changed && runs.length > 1;) {
    changed = false;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.last - r.first + 1 >= minFrames) continue;
      const left = runs[i - 1], right = runs[i + 1];
      const target = !left ? right : !right ? left : meanSim(r, left.k) >= meanSim(r, right.k) ? left : right;
      if (target === left) left.last = r.last; else right.first = r.first;
      runs.splice(i, 1);
      changed = true;
      break;
    }
  }
  // Join neighbours that ended up with the same chord.
  runs = runs.reduce<Run[]>((acc, r) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.k === r.k) prev.last = r.last; else acc.push({...r});
    return acc;
  }, []);

  return runs.map((r, i) => {
    const second = Math.max(...Array.from(sim[0], (_, k) => (k === r.k ? -1 : meanSim(r, k))));
    const confidence = r.k === states - 1 ? 1 : Math.max(0, Math.min(1, (meanSim(r, r.k) - second) * 5));
    return {
      start: i === 0 ? 0 : r.first * secondsPerFrame,
      end: i === runs.length - 1 ? duration : (r.last + 1) * secondsPerFrame,
      chord: name(r.k),
      confidence,
    };
  });
}

// Full offline pipeline for already downsampled mono audio.
export function analyseSamples(samples: Float32Array, sampleRate: number, onProgress?: (fraction: number) => void) {
  const duration = samples.length / sampleRate;
  const tuningCents = estimateTuning(samples, sampleRate);
  const frames = chromaFrames(samples, sampleRate, tuningCents, onProgress);
  return {duration, tuningCents, segments: segmentChords(frames, sampleRate, duration)};
}
