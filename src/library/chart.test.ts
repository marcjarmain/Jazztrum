import {describe, it, expect} from 'vitest';
import {validateChart, exportChart, parseChart, chordAt, type SongChart} from './chart';

const good = (): SongChart => ({version: 1, id: 'abc', title: 'Test', duration: 10, tuningCents: 10, segments: [
  {start: 0, end: 4, chord: 'Em', confidence: 0.8}, {start: 4, end: 7, chord: 'N', confidence: 1},
  {start: 7, end: 10, chord: 'B7', confidence: 0.2, edited: true}]});

describe('chart validation', () => {
  it('accepts a good chart', () => expect(validateChart(good())).toEqual(good()));
  it('rejects a gap, an overlap, a bad end, a bad chord and a bad version', () => {
    const gap = good(); gap.segments[1].start = 4.5;
    const overlap = good(); overlap.segments[0].end = 5;
    const short = good(); short.duration = 11;
    const chord = good(); chord.segments[0].chord = 'H';
    const version = {...good(), version: 2};
    for (const bad of [gap, overlap, short, chord, version, null, {}]) expect(validateChart(bad)).toBeNull();
  });
  it('round trips through export and import', () => {
    expect(parseChart(exportChart(good()))).toEqual(good());
    expect(parseChart('not json')).toBeNull();
  });
  it('finds the chord at a time', () => {
    const c = good();
    expect(chordAt(c.segments, 0)?.chord).toBe('Em');
    expect(chordAt(c.segments, 4)?.chord).toBe('N');
    expect(chordAt(c.segments, 9.9)?.chord).toBe('B7');
    expect(chordAt(c.segments, 10)).toBeNull();
  });
});
