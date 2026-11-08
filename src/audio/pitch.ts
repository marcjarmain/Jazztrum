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

export function tuningReading(frequency: number, selected: number | null) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const targetIndex = selected ?? guitarStrings.reduce((best, string, index) =>
    Math.abs(centsFrom(frequency, string.frequency)) < Math.abs(centsFrom(frequency, guitarStrings[best].frequency)) ? index : best, 0);
  const target = guitarStrings[targetIndex];
  const cents = centsFrom(frequency, target.frequency);
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return {targetIndex, target, cents, note: names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1),
    inTune: Math.abs(cents) <= 5, wrongString: Math.abs(cents) > 150};
}

// YIN's cumulative mean normalized difference detects periodicity, rather than
// mistaking a guitar's loudest overtone for the note. This is for ONE string.
export function detectPitch(samples: Float32Array, sampleRate: number): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < 1024) return null;
  const size = Math.floor(samples.length / 2);
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= samples.length;
  let power = 0;
  for (const value of samples) power += (value - mean) ** 2;
  if (Math.sqrt(power / samples.length) < 0.008) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / 420));
  const maxLag = Math.min(size - 1, Math.ceil(sampleRate / 60));
  const difference = new Float32Array(maxLag + 1);
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let value = 0;
    for (let i = 0; i < size; i++) value += (samples[i] - samples[i + lag]) ** 2;
    sum += value;
    difference[lag] = sum > 0 ? value * lag / sum : 1;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (difference[lag] >= 0.12) continue;
    while (lag + 1 <= maxLag && difference[lag + 1] < difference[lag]) lag++;
    if (lag === maxLag) return null;
    const left = difference[lag - 1], middle = difference[lag], right = difference[lag + 1];
    const curvature = left - 2 * middle + right;
    const refined = lag + (curvature ? (left - right) / (2 * curvature) : 0);
    const frequency = sampleRate / refined;
    return frequency >= 60 && frequency <= 420 ? frequency : null;
  }
  return null;
}
