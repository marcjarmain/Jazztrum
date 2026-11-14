import {describe, it, expect} from 'vitest';
import {makeTargets} from './targets';
import {SongScorer} from './scorer';
import {liveFrame} from '../live/chordListener';
import {strum, concat} from '../dsp/testSignals';
import {shapeFor} from '../data/chordShapes';

const sr = 44100;
const sound = (chord: string) => concat([new Float32Array(sr / 2), strum(shapeFor(chord)!.frets, 1.5, sr)]);
const frameOf = (chord: string) => liveFrame(sound(chord).subarray(0, Math.floor(0.95 * sr)), sr, 0.002);
const feedChord = (scorer: SongScorer, chord: string, from: number, to: number) => {
  const f = frameOf(chord);
  for (let t = from; t <= to; t += 0.05) scorer.feed(t, f);
};
const segs = [
  {start: 0, end: 4, chord: 'Em', confidence: 0.9}, {start: 4, end: 6, chord: 'N', confidence: 1},
  {start: 6, end: 15, chord: 'C', confidence: 0.1}, ];

describe('targets', () => {
  it('skips rests and splits long chords into pieces of at most 4 seconds', () => {
    const t = makeTargets(segs);
    expect(t.map(x => [x.chord, +x.start.toFixed(2), +x.end.toFixed(2)])).toEqual([['Em', 0, 4], ['C', 6, 9], ['C', 9, 12], ['C', 12, 15]]);
    expect(t[0].low).toBe(false);
    expect(t[1].low).toBe(true);
  });
});

describe('song scorer', () => {
  const make = () => new SongScorer(makeTargets(segs));
  it('scores right chords as hits and wrong ones as misses with a hint', () => {
    const s = make();
    feedChord(s, 'Em', 0.5, 3.5);
    feedChord(s, 'Am', 6.2, 8.8);
    feedChord(s, 'Am', 9.0, 9.2);
    expect(s.states[0].status).toBe('hit');
    expect(s.states[1]).toEqual({status: 'miss', heard: 'Am'});
    expect(s.hits).toBe(1);
  });
  it('stays silent: nothing heard is never a hit', () => {
    const s = make();
    for (let t = 0; t < 16; t += 0.05) s.feed(t, {chroma: new Float32Array(12), level: 0, active: false});
    s.finish();
    expect(s.hits).toBe(0);
    expect(s.total).toBe(4);
  });
  it('skips targets before the gate is learned, and does not count them', () => {
    const s = make();
    s.skipBefore(3.5);
    expect(s.states[0].status).toBe('skipped');
    expect(s.total).toBe(3);
  });
  it('keeps a target that still has plenty of time left after the gate is learned', () => {
    const s = make();
    s.skipBefore(1);
    expect(s.states[0].status).toBe('pending');
    expect(s.total).toBe(4);
  });
  it('forgets results after a seek and keeps earlier ones', () => {
    const s = make();
    feedChord(s, 'Em', 0.5, 3.5);
    feedChord(s, 'C', 6.2, 8.8);
    expect(s.hits).toBe(2);
    s.seek(6);
    expect(s.states[0].status).toBe('hit');
    expect(s.states[1].status).toBe('pending');
    s.seek(0);
    expect(s.hits).toBe(0);
  });
  it('applies the timing shift to the window', () => {
    const s = new SongScorer(makeTargets(segs), 0.15, 0.2);
    // The C target at 6 s opens at 6 - 0.15 + 0.2 = 6.05 s once shifted by 0.2 s.
    feedChord(s, 'C', 5.5, 6.0);
    expect(s.states[1].status).toBe('pending');
    feedChord(s, 'C', 6.3, 7);
    expect(s.states[1].status).toBe('hit');
  });
});
