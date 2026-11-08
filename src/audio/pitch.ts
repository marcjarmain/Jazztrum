export const guitarStrings = [
  {number: 6, note: 'E2', label: 'Low E', frequency: 82.406889},
  {number: 5, note: 'A2', label: 'A', frequency: 110},
  {number: 4, note: 'D3', label: 'D', frequency: 146.832384},
  {number: 3, note: 'G3', label: 'G', frequency: 195.997718},
  {number: 2, note: 'B3', label: 'B', frequency: 246.941651},
  {number: 1, note: 'E4', label: 'High E', frequency: 329.627557},
] as const;

export function centsFrom(frequency: number, target: number) {
  return 1200 * Math.log2(frequency / target);
}

export function tuningReading(frequency: number, selected: number | null, references?: readonly number[]) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const targetIndex = selected ?? guitarStrings.reduce((best, string, index) =>
    Math.abs(centsFrom(frequency, references?.[index] ?? string.frequency)) < Math.abs(centsFrom(frequency, references?.[best] ?? guitarStrings[best].frequency)) ? index : best, 0);
  const target = guitarStrings[targetIndex];
  const reference = references?.[targetIndex] ?? target.frequency;
  const cents = centsFrom(frequency, reference);
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return {targetIndex, target, reference, cents, note: names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1),
    inTune: Math.abs(cents) <= 5, wrongString: Math.abs(cents) > 150};
}

export const minimumPitchRms = 0.0008;

// Use a logarithmic level display: a quiet acoustic guitar still needs to be
// visibly distinguishable from an unplugged or muted microphone.
export function microphoneLevel(rms: number) {
  return rms > 0 ? Math.max(0, Math.min(100, (20 * Math.log10(rms) + 75) / 65 * 100)) : 0;
}

// Keep a measured pitch through short dropouts as a pluck decays. A held value
// is explicitly labelled in the UI, expires, and is cleared on string changes.
export class PitchTracker {
  private history: number[] = [];
  private frequency: number | null = null;
  private lastGood = -Infinity;
  reset() {this.history = []; this.frequency = null; this.lastGood = -Infinity;}
  update(pitch: number | null, now: number) {
    if (pitch !== null && Number.isFinite(pitch) && pitch > 0) {
      if (this.history.length && Math.abs(centsFrom(pitch, this.history[this.history.length - 1])) > 45) this.history = [];
      this.history.push(pitch);
      if (this.history.length > 3) this.history.shift();
      this.frequency = [...this.history].sort((a, b) => a - b)[Math.floor(this.history.length / 2)];
      this.lastGood = now;
      return {frequency: this.frequency, held: false};
    }
    this.history = [];
    if (now - this.lastGood <= 1400) return {frequency: this.frequency, held: true};
    this.reset();
    return {frequency: null, held: false};
  }
}

// YIN cumulative mean normalized difference, with octave-error correction.
// Compare local minima before accepting an overtone; never blindly divide a
// detected frequency to force it to match the selected string.
export function detectPitch(samples: Float32Array, sampleRate: number, minimumRms = minimumPitchRms): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < 1024) return null;
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= samples.length;
  let power = 0;
  for (const value of samples) power += (value - mean) ** 2;
  if (Math.sqrt(power / samples.length) < minimumRms) return null;

  // Average adjacent samples before downsampling. A longer input window helps
  // low E, while analysing near 12 kHz keeps this inexpensive on phones.
  const stride = Math.max(1, Math.floor(sampleRate / 12000));
  const data = new Float32Array(Math.floor(samples.length / stride));
  for (let i = 0; i < data.length; i++) {
    let value = 0;
    for (let j = 0; j < stride; j++) value += samples[i * stride + j];
    data[i] = value / stride;
  }
  const rate = sampleRate / stride;
  const size = Math.floor(data.length / 2);

  const minLag = Math.max(2, Math.floor(rate / 420));
  const maxLag = Math.min(size - 1, Math.ceil(rate / 60));
  const difference = new Float32Array(maxLag + 1);
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let value = 0;
    for (let i = 0; i < size; i++) value += (data[i] - data[i + lag]) ** 2;
    sum += value;
    difference[lag] = sum > 0 ? value * lag / sum : 1;
  }
  const candidates: {lag: number; quality: number}[] = [];
  for (let lag = minLag; lag < maxLag; lag++) {
    if (difference[lag] < 0.2 && difference[lag] <= difference[lag - 1] && difference[lag] < difference[lag + 1]) {
      const curvature = difference[lag - 1] - 2 * difference[lag] + difference[lag + 1];
      // Compare interpolated minima, not integer sample positions: otherwise
      // a period halfway between samples can lose to an octave below it.
      const quality = Math.max(0, difference[lag] - (curvature ? (difference[lag - 1] - difference[lag + 1]) ** 2 / (8 * curvature) : 0));
      candidates.push({lag, quality});
    }
  }
  if (candidates.length) {
    const best = Math.min(...candidates.map(candidate => candidate.quality));
    // Prefer the earliest equally good period to avoid subharmonic readings,
    // but require an octave candidate to explain the signal nearly as well.
    const {lag} = candidates.find(candidate => candidate.quality <= best * 1.6 + 0.01)!;
    const left = difference[lag - 1], middle = difference[lag], right = difference[lag + 1];
    const curvature = left - 2 * middle + right;
    const refined = lag + (curvature ? (left - right) / (2 * curvature) : 0);
    const frequency = rate / refined;
    return frequency >= 60 && frequency <= 420 ? frequency : null;
  }
  return null;
}
