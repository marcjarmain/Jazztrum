export const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type Triad = {name: string; root: number; minor: boolean; template: Float32Array};

// `seventh` is 0 for a plain triad, or the semitones above the root of an added seventh.
// An added seventh counts for less than a chord tone: it should help a seventh chord
// verify without making a plain triad worse.
function makeTemplate(root: number, minor: boolean, seventh = 0, ninth = false) {
  const t = new Float32Array(12);
  const tones: [number, number][] = [[root, 1], [root + (minor ? 3 : 4), 1], [root + 7, 1]];
  if (seventh) tones.push([root + seventh, 0.6]);
  if (ninth) tones.push([root + 2, 0.6]);
  for (const [tone, level] of tones) {
    t[tone % 12] += level;
    t[(tone + 7) % 12] += 0.3 * level;
    t[(tone + 4) % 12] += 0.1 * level;
  }
  let sum = 0;
  for (const x of t) sum += x * x;
  const length = Math.sqrt(sum);
  return t.map(x => x / length);
}

export const triads: Triad[] = [false, true].flatMap(minor =>
  noteNames.map((note, root) => ({name: note + (minor ? 'm' : ''), root, minor, template: makeTemplate(root, minor)})));

const flats: Record<string, string> = {Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#'};

// Reduce any chord name (B7, Bmaj7, Bsus4, A9, Em7, Bb) to its major or minor triad.
export function triadName(chord: string): string | null {
  const m = /^([A-G])([#b]?)(.*)$/.exec(chord);
  if (!m) return null;
  let root = m[1] + m[2];
  if (m[2] === 'b') root = flats[root] ?? root;
  const rest = m[3];
  const minor = /^m(?!aj)/.test(rest) || /^min/.test(rest);
  const name = root + (minor ? 'm' : '');
  return triads.some(t => t.name === name) ? name : null;
}

// Seventh and ninth chords also look for their seventh: A7 is A C# E G.
function templateFor(chord: string) {
  const name = triadName(chord);
  const triad = triads.find(x => x.name === name);
  if (!triad) return null;
  const m = /^[A-G][#b]?(m(?!aj)|min)?(maj7|M7|7|9|11|13)$/.exec(chord);
  if (!m) return triad.template;
  const seventh = m[2] === 'maj7' || m[2] === 'M7' ? 11 : 10;
  return makeTemplate(triad.root, triad.minor, seventh, m[2] === '9');
}

export function similarityTo(chroma: ArrayLike<number>, chord: string) {
  const template = templateFor(chord);
  if (!template) return 0;
  let dot = 0;
  for (let i = 0; i < 12; i++) dot += chroma[i] * template[i];
  return dot;
}

export function triadSimilarity(chroma: ArrayLike<number>, chord: string) {
  const t = triads.find(x => x.name === triadName(chord));
  if (!t) return 0;
  let dot = 0;
  for (let i = 0; i < 12; i++) dot += chroma[i] * t.template[i];
  return dot;
}

const verifyThreshold = 0.7;

// Does this sound contain the expected chord? Used while playing, when we already
// know what should be sounding. Three conditions, all required:
//  1. similarity to the expected chord is high enough,
//  2. its triad is first or second of all 24 (Em and G share two notes),
//  3. it beats the same root in the other quality (E against Em share root and fifth,
//     so a high score alone cannot tell them apart).
export function verifyChord(chroma: ArrayLike<number>, expected: string, threshold = verifyThreshold) {
  const name = triadName(expected);
  if (!name) return {ok: false, similarity: 0, rank: 24};
  const similarity = similarityTo(chroma, expected);
  const ranked = rankChords(chroma);
  // Rank among the triads. An extended chord is compared by its own full template.
  const rank = 1 + ranked.filter(r => r.name !== name && r.similarity > similarity).length;
  const parallel = name.endsWith('m') ? name.slice(0, -1) : name + 'm';
  const beatsParallel = triadSimilarity(chroma, name) > triadSimilarity(chroma, parallel);
  return {ok: similarity >= threshold && rank <= 2 && beatsParallel, similarity, rank};
}

export function rankChords(chroma: ArrayLike<number>) {
  return triads.map(t => ({name: t.name, similarity: similarityTo(chroma, t.name)})).sort((a, b) => b.similarity - a.similarity);
}
