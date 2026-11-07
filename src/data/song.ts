// Change the speed or the chords to make this song your own!
export const bpm = 70;
export const chords = ['Em','Em','A9','A9','Em','A9','Em','Em'] as const;
// Beat 0 is the first beat. 1.5 is the “and” after beat 2.
export const strums = chords.flatMap((chord, bar) => (bar === 3 || bar === 7 ? [0,2] : [0,1.5,3]).map(beat => ({beat: bar * 4 + beat, chord})));
export const beatSeconds = 60 / bpm;
export const loopSeconds = 32 * beatSeconds;

// A gentle tune, one note on each beat. Frequencies are in hertz.
const emTune = [329.63, 392, 493.88, 392]; // E, G, B, G
const a9Tune = [440, 493.88, 554.37, 392]; // A, B, C-sharp, G
export const melody = chords.flatMap((chord, bar) =>
  (chord === 'Em' ? emTune : a9Tune).map((frequency, beat) => ({beat: bar * 4 + beat, frequency}))
);
