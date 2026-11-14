import {describe, it, expect} from 'vitest';
import {setChord, moveBoundary, splitAt, mergeNext, mergeAnalysis} from './edit';
import {validateChart, exportChart, parseChart, type Segment, type SongChart} from './chart';

const base = (): Segment[] => [
  {start: 0, end: 4, chord: 'Em', confidence: 0.9}, {start: 4, end: 8, chord: 'C', confidence: 0.5}, {start: 8, end: 12, chord: 'G', confidence: 0.2}];
const chart = (segments: Segment[]): SongChart => ({version: 1, id: 'x', title: 'T', duration: 12, tuningCents: 0, segments});

describe('chart editing', () => {
  it('changes a chord and marks it edited', () => {
    const r = setChord(base(), 1, 'Am')!;
    expect(r[1]).toMatchObject({chord: 'Am', edited: true, confidence: 1});
    expect(r[0].edited).toBeUndefined();
    expect(validateChart(chart(r))).not.toBeNull();
  });
  it('moves a boundary, snapped to 0.1 s, and keeps the chart valid', () => {
    const r = moveBoundary(base(), 0, 4.62)!;
    expect(r[0].end).toBe(4.6);
    expect(r[1].start).toBe(4.6);
    expect(validateChart(chart(r))).not.toBeNull();
  });
  it('never lets a segment get shorter than 0.2 s', () => {
    expect(moveBoundary(base(), 0, 99)![1].end - moveBoundary(base(), 0, 99)![1].start).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(moveBoundary(base(), 0, -5)![0].end).toBeCloseTo(0.2, 6);
    expect(moveBoundary(base(), 2, 9)).toBeNull();
  });
  it('splits at a time and refuses to split near an edge', () => {
    const r = splitAt(base(), 6.04)!;
    expect(r.map(s => [s.start, s.end, s.chord])).toEqual([[0, 4, 'Em'], [4, 6, 'C'], [6, 8, 'C'], [8, 12, 'G']]);
    expect(splitAt(base(), 4.1)).toBeNull();
    expect(validateChart(chart(r))).not.toBeNull();
  });
  it('merges with the next segment', () => {
    const r = mergeNext(base(), 0)!;
    expect(r.map(s => [s.start, s.end, s.chord])).toEqual([[0, 8, 'Em'], [8, 12, 'G']]);
    expect(mergeNext(base(), 2)).toBeNull();
    expect(validateChart(chart(r))).not.toBeNull();
  });
});

describe('analyse again', () => {
  it('keeps edited segments and replaces the rest', () => {
    const old = setChord(base(), 0, 'Bm')!; // first segment is now an edited Bm
    const fresh: Segment[] = [{start: 0, end: 5, chord: 'Dm', confidence: 0.8}, {start: 5, end: 12, chord: 'F', confidence: 0.6}];
    const r = mergeAnalysis(old, fresh, 12);
    expect(r.map(s => [s.start, s.end, s.chord, !!s.edited])).toEqual([[0, 4, 'Bm', true], [4, 5, 'Dm', false], [5, 12, 'F', false]]);
    expect(validateChart(chart(r))).not.toBeNull();
  });
  it('keeps an edit in the middle and fills both sides', () => {
    const old = setChord(base(), 1, 'Am')!;
    const fresh: Segment[] = [{start: 0, end: 12, chord: 'Em', confidence: 0.7}];
    const r = mergeAnalysis(old, fresh, 12);
    expect(r.map(s => [s.start, s.end, s.chord])).toEqual([[0, 4, 'Em'], [4, 8, 'Am'], [8, 12, 'Em']]);
  });
  it('absorbs slivers and still covers the whole recording', () => {
    const old = setChord(base(), 1, 'Am')!;
    const fresh: Segment[] = [{start: 0, end: 3.9, chord: 'Em', confidence: 0.7}, {start: 3.9, end: 8.1, chord: 'C', confidence: 0.7}, {start: 8.1, end: 12, chord: 'G', confidence: 0.7}];
    const r = mergeAnalysis(old, fresh, 12);
    expect(validateChart(chart(r))).not.toBeNull();
    expect(r.every(s => s.end - s.start >= 0.2 - 1e-9)).toBe(true);
  });
  it('without edits is simply the new analysis', () => {
    const fresh: Segment[] = [{start: 0, end: 6, chord: 'A', confidence: 0.7}, {start: 6, end: 12, chord: 'E', confidence: 0.7}];
    expect(mergeAnalysis(base(), fresh, 12)).toEqual(fresh);
  });
});

describe('export and import', () => {
  it('round trips an edited chart exactly', () => {
    let segs = setChord(base(), 0, 'Bm')!;
    segs = splitAt(segs, 6)!;
    segs = mergeNext(segs, 1)!;
    const c = chart(segs);
    expect(parseChart(exportChart(c))).toEqual(c);
  });
});
