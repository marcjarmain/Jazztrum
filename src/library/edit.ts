import type {Segment} from './chart';

// Pure editing of a chord chart. Every function returns a new list, or null when the edit is not allowed.
// A chart always keeps covering the whole recording with no gaps and no overlaps.
const grid = 0.1;
export const minLength = 0.2;
const snap = (t: number) => Math.round(t / grid) * grid;
const round = (t: number) => Math.round(t * 1000) / 1000;

export function setChord(segments: Segment[], index: number, chord: string): Segment[] | null {
  if (!segments[index]) return null;
  return segments.map((s, i) => (i === index ? {...s, chord, confidence: 1, edited: true} : s));
}

// Moves the boundary between segment `index` and the next one to `time` (snapped to 0.1 s).
export function moveBoundary(segments: Segment[], index: number, time: number): Segment[] | null {
  const a = segments[index], b = segments[index + 1];
  if (!a || !b) return null;
  const t = round(Math.min(b.end - minLength, Math.max(a.start + minLength, snap(time))));
  if (t - a.start < minLength - 1e-9 || b.end - t < minLength - 1e-9) return null;
  return segments.map((s, i) => (i === index ? {...s, end: t, edited: true} : i === index + 1 ? {...s, start: t, edited: true} : s));
}

// Cuts the segment that contains `time` in two. Both halves keep the chord.
export function splitAt(segments: Segment[], time: number): Segment[] | null {
  const t = round(snap(time));
  const index = segments.findIndex(s => t >= s.start + minLength - 1e-9 && t <= s.end - minLength + 1e-9);
  if (index < 0) return null;
  const s = segments[index];
  return [...segments.slice(0, index), {...s, end: t, edited: true}, {...s, start: t, edited: true}, ...segments.slice(index + 1)];
}

export function mergeNext(segments: Segment[], index: number): Segment[] | null {
  const a = segments[index], b = segments[index + 1];
  if (!a || !b) return null;
  return [...segments.slice(0, index), {...a, end: b.end, confidence: Math.min(a.confidence, b.confidence), edited: true}, ...segments.slice(index + 2)];
}

// "Analyse again": corrected segments stay exactly as they are; everything between them is replaced by the new analysis.
export function mergeAnalysis(old: Segment[], fresh: Segment[], duration: number): Segment[] {
  const kept = old.filter(s => s.edited).sort((a, b) => a.start - b.start);
  const gaps: [number, number][] = [];
  let at = 0;
  for (const k of kept) {
    if (k.start > at + 1e-6) gaps.push([at, k.start]);
    at = k.end;
  }
  if (duration - at > 1e-6) gaps.push([at, duration]);
  const pieces: Segment[] = [...kept];
  for (const [from, to] of gaps) {
    for (const f of fresh) {
      const start = Math.max(from, f.start), end = Math.min(to, f.end);
      if (end - start > 1e-6) pieces.push({start, end, chord: f.chord, confidence: f.confidence});
    }
  }
  pieces.sort((a, b) => a.start - b.start);
  // Absorb slivers into an unedited neighbour so no segment is shorter than the minimum.
  for (let i = 0; i < pieces.length && pieces.length > 1;) {
    const p = pieces[i];
    if (p.edited || p.end - p.start >= minLength - 1e-9) {i++; continue;}
    const prev = pieces[i - 1], next = pieces[i + 1];
    if (prev && !prev.edited) prev.end = p.end;
    else if (next && !next.edited) next.start = p.start;
    else if (prev) prev.end = p.end;
    else next.start = p.start;
    pieces.splice(i, 1);
    i = Math.max(0, i - 1);
  }
  return pieces.reduce<Segment[]>((out, p) => {
    const last = out[out.length - 1];
    if (last && !last.edited && !p.edited && last.chord === p.chord) last.end = p.end;
    else out.push({...p});
    return out;
  }, []);
}
