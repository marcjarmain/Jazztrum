import {describe, expect, it} from 'vitest';
import {centsFrom, detectPitch, guitarStrings, microphoneLevel, PitchTracker, tuningReading} from './pitch';

function signal(frequency: number, sampleRate: number, harmonics = false, cents = 0) {
  const hz = frequency * 2 ** (cents / 1200);
  return Float32Array.from({length: 4096}, (_, i) => {
    const phase = 2 * Math.PI * hz * i / sampleRate;
    return harmonics ? 0.08 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase) : 0.3 * Math.sin(phase);
  });
}

describe('guitar pitch detection', () => {
  it('recognizes a quiet low E instead of discarding it at the volume gate', () => {
    const quiet = signal(guitarStrings[0].frequency, 48000).map(value => value / 100);
    const detected = detectPitch(quiet, 48000);
    expect(detected).not.toBeNull();
    expect(Math.abs(centsFrom(detected!, guitarStrings[0].frequency))).toBeLessThan(3);
  });
  it('recognizes a decaying low E with a strong second harmonic and room noise', () => {
    let seed = 41;
    const frequency = guitarStrings[0].frequency * 2 ** (-18 / 1200);
    const pluck = Float32Array.from({length: 8192}, (_, i) => {
      const t = i / 48000, phase = 2 * Math.PI * frequency * t;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return Math.exp(-t / 0.3) * (0.003 * Math.sin(phase) + 0.018 * Math.sin(2 * phase) + 0.002 * Math.sin(3 * phase))
        + (seed / 2 ** 32 - 0.5) * 0.002;
    });
    const detected = detectPitch(pluck, 48000);
    expect(detected).not.toBeNull();
    expect(Math.abs(centsFrom(detected!, frequency))).toBeLessThan(5);
  });
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

describe('readable tuner feedback', () => {
  it('shows the first reliable pitch immediately, holds through a short dropout, then expires', () => {
    const tracker = new PitchTracker();
    expect(tracker.update(82.4, 100)).toEqual({frequency:82.4, held:false});
    expect(tracker.update(null, 500)).toEqual({frequency:82.4, held:true});
    expect(tracker.update(null, 1501)).toEqual({frequency:null, held:false});
  });
  it('clears a held pitch on string changes and accepts the new string without an old median', () => {
    const tracker = new PitchTracker();
    tracker.update(82.4, 0);
    tracker.reset();
    expect(tracker.update(null, 10).frequency).toBeNull();
    expect(tracker.update(329.6, 20)).toEqual({frequency:329.6, held:false});
  });
  it('makes a quiet guitar visible on the microphone meter without showing silence as sound', () => {
    expect(microphoneLevel(0)).toBe(0);
    expect(microphoneLevel(0.002)).toBeGreaterThan(25);
    expect(microphoneLevel(0.02)).toBeGreaterThan(microphoneLevel(0.002));
  });
});
