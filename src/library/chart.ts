import type {Segment} from '../dsp/segment';
import {triadName} from '../dsp/templates';

export type {Segment};
export type SongChart = {
  version: 1;
  id: string;
  title: string;
  duration: number;
  tuningCents: number;
  segments: Segment[];
  beats?: number[];
};

const tolerance = 0.001;

// Returns a clean chart, or null if anything is wrong. Segments must run from 0 to
// `duration` in order, with no gaps or overlaps, and every chord must be known.
export function validateChart(value: unknown): SongChart | null {
  const c = value as Partial<SongChart> | null;
  if (!c || c.version !== 1 || typeof c.id !== 'string' || !c.id || typeof c.title !== 'string') return null;
  if (typeof c.duration !== 'number' || !(c.duration > 0) || !Number.isFinite(c.duration)) return null;
  if (typeof c.tuningCents !== 'number' || !Number.isFinite(c.tuningCents)) return null;
  if (!Array.isArray(c.segments) || !c.segments.length) return null;
  let at = 0;
  const segments: Segment[] = [];
  for (const s of c.segments) {
    if (!s || typeof s.start !== 'number' || typeof s.end !== 'number' || typeof s.chord !== 'string') return null;
    if (Math.abs(s.start - at) > tolerance || !(s.end > s.start)) return null;
    if (s.chord !== 'N' && triadName(s.chord) === null) return null;
    const confidence = typeof s.confidence === 'number' ? Math.min(1, Math.max(0, s.confidence)) : 0;
    segments.push({start: s.start, end: s.end, chord: s.chord, confidence, ...(s.edited ? {edited: true} : {})});
    at = s.end;
  }
  if (Math.abs(at - c.duration) > tolerance) return null;
  return {version: 1, id: c.id, title: c.title, duration: c.duration, tuningCents: c.tuningCents, segments,
    ...(Array.isArray(c.beats) ? {beats: c.beats.filter(b => typeof b === 'number')} : {})};
}

export const exportChart = (chart: SongChart) => JSON.stringify(chart, null, 2);

export function parseChart(text: string): SongChart | null {
  try {return validateChart(JSON.parse(text));} catch {return null;}
}

export function chordAt(segments: Segment[], time: number): Segment | null {
  return segments.find(s => time >= s.start && time < s.end) ?? (time >= (segments[segments.length - 1]?.end ?? 0) ? null : segments[0] ?? null);
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
