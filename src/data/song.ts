// Change the speed or the chords to make this song your own!
export const bpm = 96;
export const chords = ['Em','Em','A9','A9','Em','A9','Em','Em'] as const;
// Beat 0 is the first beat. 1.5 is the “and” after beat 2.
export const strums = chords.flatMap((chord, bar) => (bar === 3 || bar === 7 ? [0,2] : [0,1.5,3]).map(beat => ({beat: bar * 4 + beat, chord})));
export const beatSeconds = 60 / bpm;
export const loopSeconds = 32 * beatSeconds;

// An original tune: each pair is [note frequency, length in beats].
// A zero is a rest. The two-bar phrases repeat, so they are easy to remember.
const tunes = {
  Em: [[329.63, .5], [0, .5], [392, .75], [440, .25], [493.88, 1], [392, .5], [329.63, .5]],
  A9: [[277.18, .5], [329.63, .5], [0, .5], [392, .5], [493.88, 1], [440, .5], [329.63, .5]],
};
export const backing = chords.flatMap((chord, bar) => {
  let beat = bar * 4;
  return tunes[chord].map(([melody, duration]) => {
    const note = {beat, melody, duration};
    beat += duration;
    return note;
  });
});
// One bass and drum step per beat.
export const groove = chords.flatMap((chord, bar) =>
  [0,1,2,3].map(beat => ({beat: bar*4+beat, beatInBar: beat,
    bass: chord === 'Em' ? [82.41,123.47,164.81,123.47][beat] : [110,164.81,220,164.81][beat]}))
);
