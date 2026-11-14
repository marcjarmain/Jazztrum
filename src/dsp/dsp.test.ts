import {describe, it, expect} from 'vitest';
import {fft} from './fft';
import {chroma, settings} from './chroma';
import {rankChords, similarityTo, triadName, verifyChord} from './templates';
import {analyseSamples} from './segment';
import {strum, concat, addNoise, repeatedStrums} from './testSignals';
import {shapeFor, commonChords} from '../data/chordShapes';

const sr = 11025;
const frame = (samples: Float32Array, at = 0.3) => samples.subarray(Math.floor(at * sr), Math.floor(at * sr) + settings.frameSize);
const fingerings: Record<string, (number | null)[]> = Object.fromEntries(commonChords.filter(c => c !== 'A9').map(c => [c, shapeFor(c)!.frets]));
const isSeventh = (c: string) => /7$/.test(c);
const plain = Object.keys(fingerings).filter(c => !isSeventh(c));
const sevenths = Object.keys(fingerings).filter(isSeventh);

describe('fft and chroma', () => {
  it('puts a sine wave in the right bin', () => {
    const n = 1024, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin(2 * Math.PI * 50 * i / n);
    fft(re, im);
    const mags = Array.from(re, (r, i) => Math.hypot(r, im[i])).slice(0, n / 2);
    expect(mags.indexOf(Math.max(...mags))).toBe(50);
  });
  it('puts a single A (110 Hz) in pitch class A', () => {
    const s = new Float32Array(sr), f = 110;
    for (let i = 0; i < s.length; i++) s[i] = 0.3 * Math.sin(2 * Math.PI * f * i / sr);
    const c = chroma(s.subarray(0, settings.frameSize), sr);
    expect(Array.from(c).indexOf(Math.max(...c))).toBe(9);
  });
  it('is silent for silence', () => {
    expect(Array.from(chroma(new Float32Array(settings.frameSize), sr)).every(v => v === 0)).toBe(true);
  });
});

describe('chord templates', () => {
  it('reduces extended chord names to triads', () => {
    expect(['B7', 'Bmaj7', 'Bsus4', 'A9', 'Em7', 'Bb', 'Dm7'].map(triadName)).toEqual(['B', 'B', 'B', 'A', 'Em', 'A#', 'Dm']);
    expect(triadName('N')).toBeNull();
  });
  for (const name of plain) {
    it(`ranks ${name} first and verifies it`, () => {
      const c = chroma(frame(strum(fingerings[name], 1.5, sr)), sr);
      const top = rankChords(c).slice(0, 3).map(r => `${r.name}:${r.similarity.toFixed(2)}`);
      expect(rankChords(c)[0].name, top.join(' ')).toBe(name);
      expect(verifyChord(c, name).ok, top.join(' ')).toBe(true);
    });
  }
  for (const name of [...sevenths, 'A9']) {
    it(`verifies ${name} against its own name`, () => {
      const frets = name === 'A9' ? shapeFor('A9')!.frets : fingerings[name];
      const c = chroma(frame(strum(frets, 1.5, sr)), sr);
      const top = rankChords(c).slice(0, 3).map(r => `${r.name}:${r.similarity.toFixed(2)}`);
      expect(verifyChord(c, name).ok, top.join(' ')).toBe(true);
      if (name !== 'A9') expect(verifyChord(c, triadName(name)!).rank, top.join(' ')).toBeLessThanOrEqual(2);
    });
  }
  it('rejects near misses', () => {
    const cases: [string, string][] = [['Em', 'E'], ['Am', 'A'], ['A', 'Am'], ['D', 'Dm']];
    for (const [played, expected] of cases) {
      const c = chroma(frame(strum(fingerings[played], 1.5, sr)), sr);
      const sim = similarityTo(c, expected);
      const own = similarityTo(c, played);
      expect(own, `${played} should beat ${expected}`).toBeGreaterThan(sim);
      expect(verifyChord(c, expected).ok, `${played} must not verify as ${expected} (${sim.toFixed(2)})`).toBe(false);
    }
  });
  it('accepts every fingering with 10 dB of noise', () => {
    for (const [name, frets] of Object.entries(fingerings)) {
      const c = chroma(frame(addNoise(strum(frets, 1.5, sr), 10)), sr);
      const v = verifyChord(c, name);
      expect(v.ok, `${name} similarity ${v.similarity.toFixed(2)} rank ${v.rank}`).toBe(true);
    }
  });
});

describe('offline analysis', () => {
  const song = (cents = 0) => concat(['Em', 'C', 'G', 'D'].map(c => repeatedStrums(fingerings[c], 4, 1, sr, cents)));
  it('finds four chords with boundaries within 0.3 s', () => {
    const r = analyseSamples(song(), sr);
    expect(r.segments.map(s => s.chord)).toEqual(['Em', 'C', 'G', 'D']);
    r.segments.slice(0, 3).forEach((s, i) => expect(Math.abs(s.end - (i + 1) * 4)).toBeLessThan(0.3));
    expect(r.segments[0].start).toBe(0);
    expect(r.segments[3].end).toBeCloseTo(r.duration, 5);
  });
  it('copes with a recording 30 cents sharp', () => {
    const r = analyseSamples(song(30), sr);
    expect(r.tuningCents).toBeGreaterThanOrEqual(20);
    expect(r.tuningCents).toBeLessThanOrEqual(40);
    expect(r.segments.map(s => s.chord)).toEqual(['Em', 'C', 'G', 'D']);
  });
  it('covers the whole recording with no gaps', () => {
    const r = analyseSamples(song(), sr);
    r.segments.forEach((s, i) => { if (i) expect(s.start).toBeCloseTo(r.segments[i - 1].end, 6); });
  });
});
