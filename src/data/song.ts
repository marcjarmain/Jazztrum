// Change the speed or the chords to make this song your own!
export const bpm = 70;
export const chords = ['Em','Em','G','G','Em','G','Em','Em'] as const;
// Beat 0 is the first beat. 1.5 is the “and” after beat 2.
export const strums = chords.flatMap((chord, bar) => (bar === 3 || bar === 7 ? [0,2] : [0,1.5,3]).map(beat => ({beat: bar * 4 + beat, chord})));
export const beatSeconds = 60 / bpm;
export const loopSeconds = 32 * beatSeconds;
