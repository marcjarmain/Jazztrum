import {magnitudeSpectrum} from './fft';

// Tunable numbers live here so they can be adjusted in one place.
export const settings = {
  frameSize: 4096,
  hopSize: 1024,
  minFrequency: 65,
  maxFrequency: 2100,
  silenceRms: 0.002,
  smoothFrames: 4,
  changePenalty: 0.6,
  minSegmentSeconds: 0.5,
  maxFileSeconds: 15 * 60,
  verifyThreshold: 0.7,
  verifyMargin: 0.08,
  verifyFrames: 3,
};

export function rms(frame: Float32Array) {
  let sum = 0;
  for (const v of frame) sum += v * v;
  return Math.sqrt(sum / frame.length);
}

// Fold a magnitude spectrum into twelve pitch classes (0 = C), unnormalised.
// The median log magnitude is the noise floor; only energy above it counts, which
// keeps broadband noise from flattening the result.
export function foldSpectrum(spectrum: Float32Array, binHz: number, tuningCents = 0) {
  const out = new Float32Array(12);
  const a4 = 440 * 2 ** (tuningCents / 1200);
  const first = Math.max(1, Math.ceil(settings.minFrequency / binHz));
  const last = Math.min(spectrum.length - 1, Math.floor(settings.maxFrequency / binHz));
  if (last <= first) return out;
  const logs = new Float32Array(last - first + 1);
  for (let bin = first; bin <= last; bin++) logs[bin - first] = Math.log(1 + 10 * spectrum[bin]);
  const floor = [...logs].sort((a, b) => a - b)[Math.floor(logs.length / 2)];
  for (let bin = first; bin <= last; bin++) {
    const pitch = 69 + 12 * Math.log2(bin * binHz / a4);
    const nearest = Math.round(pitch);
    const weight = Math.exp(-0.5 * ((pitch - nearest) / 0.25) ** 2);
    out[((nearest % 12) + 12) % 12] += weight * Math.max(0, logs[bin - first] - floor);
  }
  return out;
}

// Twelve pitch class energies (0 = C), scaled to length 1, or all zeros when quiet.
export function chroma(frame: Float32Array, sampleRate: number, tuningCents = 0, silenceRms = settings.silenceRms): Float32Array {
  if (rms(frame) < silenceRms) return new Float32Array(12);
  return normalise(foldSpectrum(magnitudeSpectrum(frame), sampleRate / frame.length, tuningCents));
}

export function normalise(v: Float32Array) {
  let sum = 0;
  for (const x of v) sum += x * x;
  const length = Math.sqrt(sum);
  if (length > 0) for (let i = 0; i < v.length; i++) v[i] /= length;
  return v;
}

// Average adjacent samples before dropping to a lower rate (same idea as pitch.ts).
export function downsample(samples: Float32Array, sampleRate: number, targetRate: number) {
  const stride = Math.max(1, Math.floor(sampleRate / targetRate));
  const out = new Float32Array(Math.floor(samples.length / stride));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < stride; j++) sum += samples[i * stride + j];
    out[i] = sum / stride;
  }
  return {samples: out, sampleRate: sampleRate / stride};
}

// Estimate how far the recording sits from A = 440, in cents (-50 to +50).
export function estimateTuning(samples: Float32Array, sampleRate: number) {
  const size = settings.frameSize;
  const frames: Float32Array[] = [];
  const total = Math.floor((samples.length - size) / settings.hopSize);
  if (total < 1) return 0;
  const scored: {start: number; level: number}[] = [];
  for (let f = 0; f < total; f++) {
    const start = f * settings.hopSize;
    scored.push({start, level: rms(samples.subarray(start, start + size))});
  }
  const loud = scored.filter(s => s.level >= settings.silenceRms);
  const step = Math.max(1, Math.floor(loud.length / 200));
  for (let i = 0; i < loud.length; i += step) frames.push(samples.subarray(loud[i].start, loud[i].start + size));
  if (!frames.length) return 0;
  const spectra = frames.map(frame => magnitudeSpectrum(frame));
  const binHz = sampleRate / size;
  let bestCents = 0, bestScore = -Infinity;
  for (let cents = -50; cents <= 50; cents += 10) {
    let score = 0;
    for (const spectrum of spectra) {
      const out = foldSpectrum(spectrum, binHz, cents);
      score += Math.max(...out);
    }
    if (score > bestScore) {bestScore = score; bestCents = cents;}
  }
  return bestCents;
}
