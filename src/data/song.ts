// Change the speed or the chords to make this song your own!
export const bpm = 70;
export const chords = ['Em','Em','A9','A9','Em','A9','Em','Em'] as const;
// Beat 0 is the first beat. 1.5 is the “and” after beat 2.
export const strums = chords.flatMap((chord, bar) => (bar === 3 || bar === 7 ? [0,2] : [0,1.5,3]).map(beat => ({beat: bar * 4 + beat, chord})));
export const beatSeconds = 60 / bpm;
export const loopSeconds = 32 * beatSeconds;

// The backing band plays one step per beat. Change these notes to write a new tune.
// Each number is a note's frequency in hertz; 0 means a rest.
const tunes = {
  Em: [329.63, 392, 493.88, 392, 440, 392, 329.63, 293.66],
  A9: [277.18, 329.63, 392, 493.88, 440, 392, 329.63, 277.18],
};
export const backing = chords.flatMap((chord, bar) => {
  const notes = tunes[chord];
  return [0, 1, 2, 3].map(beat => ({
    beat: bar * 4 + beat,
    melody: notes[(bar % 2) * 4 + beat],
    bass: chord === 'Em' ? (beat === 2 ? 123.47 : 82.41) : (beat === 2 ? 164.81 : 110),
    chord,
    beatInBar: beat,
  }));
});
