// Synthesised guitar sounds for tests. Open string notes are MIDI 40 45 50 55 59 64.
const openStrings = [40, 45, 50, 55, 59, 64];

export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One strummed chord. Strings start 25 ms apart. Each string is a decaying stack of
// harmonics (a guitar like spectrum with exact pitch, unlike an integer length delay line).
export function strum(frets: (number | null)[], seconds: number, sampleRate: number, tuningCents = 0) {
  const out = new Float32Array(Math.floor(seconds * sampleRate));
  const shift = 2 ** (tuningCents / 1200);
  frets.forEach((fret, i) => {
    if (fret === null) return;
    const f0 = 440 * 2 ** ((openStrings[i] + fret - 69) / 12) * shift;
    const offset = Math.floor(i * 0.025 * sampleRate);
    for (let h = 1; h <= 8 && f0 * h < sampleRate / 2; h++) {
      const amp = 0.12 / h ** 1.1;
      const decay = 1.2 + 0.6 * h;
      for (let n = offset; n < out.length; n++) {
        const t = (n - offset) / sampleRate;
        out[n] += amp * Math.exp(-t * decay * 0.8) * Math.sin(2 * Math.PI * f0 * h * t);
      }
    }
  });
  return out;
}

export function concat(parts: Float32Array[]) {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {out.set(p, at); at += p.length;}
  return out;
}

export function addNoise(samples: Float32Array, snrDb: number, seed = 1) {
  const random = mulberry32(seed);
  let power = 0;
  for (const v of samples) power += v * v;
  const signalRms = Math.sqrt(power / samples.length);
  const noiseRms = signalRms / 10 ** (snrDb / 20);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < out.length; i++) {
    // sum of uniforms approximates a gaussian with unit variance
    const g = (random() + random() + random() + random() - 2) * Math.sqrt(3);
    out[i] = samples[i] + g * noiseRms;
  }
  return out;
}

// A strummed chord every `every` seconds, each one ringing and decaying until the next.
export function repeatedStrums(frets: (number | null)[], seconds: number, every: number, sampleRate: number, tuningCents = 0) {
  return concat(Array.from({length: Math.round(seconds / every)}, () => strum(frets, every, sampleRate, tuningCents)));
}
