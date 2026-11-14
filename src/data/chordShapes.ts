import {noteNames, triadName} from '../dsp/templates';

// Frets from the thick low E to the thin high e. null means do not play the string.
export type ChordShape = {frets: (number | null)[]; fingers: number[]};
const x = null;

// Hand written open and common shapes. Finger 0 means an open or unplayed string.
const shapes: Record<string, ChordShape> = {
  Em: {frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0]},
  E: {frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0]},
  Am: {frets: [x, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0]},
  A: {frets: [x, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0]},
  Dm: {frets: [x, x, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1]},
  D: {frets: [x, x, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2]},
  C: {frets: [x, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0]},
  G: {frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3]},
  F: {frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1]},
  B7: {frets: [x, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4]},
  A7: {frets: [x, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0]},
  D7: {frets: [x, x, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3]},
  E7: {frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0]},
  G7: {frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1]},
  C7: {frets: [x, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0]},
  Bm: {frets: [x, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1]},
  'F#m': {frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1]},
  B: {frets: [x, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1]},
  A9: {frets: [x, 0, 2, 4, 2, 3], fingers: [0, 0, 1, 3, 2, 4]},
};

export const commonChords = Object.keys(shapes);

// Number the pressed frets from the lowest fret up; the lowest gets finger 1.
function autoFingers(frets: (number | null)[]) {
  const pressed = [...new Set(frets.filter((f): f is number => f !== null && f > 0))].sort((a, b) => a - b);
  return frets.map(f => (f === null || f === 0 ? 0 : Math.min(4, pressed.indexOf(f) + 1)));
}

// Movable barre shapes for any chord that has no hand written fingering.
function barre(root: number, minor: boolean): ChordShape {
  const lowE = (root - 4 + 12) % 12; // fret of the root on the low E string
  const n = lowE === 0 ? 12 : lowE;
  const frets = n <= 7
    ? [n, n + 2, n + 2, minor ? n : n + 1, n, n]
    : (() => {
        const a = (root - 9 + 12) % 12 || 12;
        return [x, a, a + 2, a + 2, minor ? a + 1 : a + 2, a];
      })();
  return {frets, fingers: autoFingers(frets)};
}

// A chord name such as "Bm", "G7", "C#" or "N". Returns null for "N" or names we do not know.
export function shapeFor(chord: string): ChordShape | null {
  if (shapes[chord]) return shapes[chord];
  const triad = triadName(chord);
  if (!triad) return null;
  if (shapes[triad]) return shapes[triad];
  const minor = triad.endsWith('m');
  const root = noteNames.indexOf((minor ? triad.slice(0, -1) : triad) as (typeof noteNames)[number]);
  return barre(root, minor);
}
