import {describe, expect, it} from 'vitest';
import {centsFrom, detectPitch, guitarStrings, tuningReading} from './pitch';

function signal(frequency: number, sampleRate: number, harmonics = false, cents = 0) {
  const hz = frequency * 2 ** (cents / 1200);
  return Float32Array.from({length: 4096}, (_, i) => {
    const phase = 2 * Math.PI * hz * i / sampleRate;
    return harmonics ? 0.08 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase) : 0.3 * Math.sin(phase);
  });
}

describe('guitar pitch detection', () => {
  for (const sampleRate of [44100, 48000]) {
    it.each(guitarStrings)('recognizes $note at ' + sampleRate + ' Hz', string => {
      const detected = detectPitch(signal(string.frequency, sampleRate), sampleRate);
      expect(detected).not.toBeNull();
      expect(Math.abs(centsFrom(detected!, string.frequency))).toBeLessThan(2);
    });
    it.each(guitarStrings)('finds $note below a stronger second harmonic at ' + sampleRate + ' Hz', string => {
      const detected = detectPitch(signal(string.frequency, sampleRate, true), sampleRate);
      expect(detected).not.toBeNull();
      expect(Math.abs(centsFrom(detected!, string.frequency))).toBeLessThan(3);
    });
  }
  it.each([-35, -10, 10, 35])('measures detuning of %s cents', cents => {
    const detected = detectPitch(signal(110, 48000, true, cents), 48000);
    expect(centsFrom(detected!, 110)).toBeCloseTo(cents, 0);
  });
  it('rejects silence, DC offset, quiet input, and non-periodic noise', () => {
    let seed = 1234;
    const noise = Float32Array.from({length: 4096}, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 2 ** 32 - 0.5) * 0.5;
    });
    expect(detectPitch(new Float32Array(4096), 48000)).toBeNull();
    expect(detectPitch(new Float32Array(4096).fill(0.2), 48000)).toBeNull();
    expect(detectPitch(signal(110, 48000).map(value => value * 0.001), 48000)).toBeNull();
    expect(detectPitch(noise, 48000)).toBeNull();
  });
  it('distinguishes the two E strings and keeps a manually selected target', () => {
    expect(tuningReading(guitarStrings[0].frequency, null)?.targetIndex).toBe(0);
    expect(tuningReading(guitarStrings[5].frequency, null)?.targetIndex).toBe(5);
    const reading = tuningReading(guitarStrings[5].frequency, 0)!;
    expect(reading.targetIndex).toBe(0);
    expect(reading.note).toBe('E4');
    expect(reading.wrongString).toBe(true);
    expect(reading.inTune).toBe(false);
  });
  it('uses a five-cent tolerance and rejects invalid readings', () => {
    expect(tuningReading(110 * 2 ** (4 / 1200), 1)?.inTune).toBe(true);
    expect(tuningReading(110 * 2 ** (8 / 1200), 1)?.inTune).toBe(false);
    expect(tuningReading(NaN, null)).toBeNull();
    expect(tuningReading(0, null)).toBeNull();
  });
});
