# Handoff: song import, chord timeline and chord recognition

## STATUS (14 November 2026): phases 0 to 5 are built and live

Built by Claude Sonnet 5.5 in one session, each phase tested and pushed. 114 tests pass.
Phase 6 (beat grid, loop section, seventh chords) is NOT started and needs the owner's sign-off.
**Nothing has been tested with a real guitar or on the iPad.** Section 10 is still the owner's to do.

Changes from this document, and why (all found by tests, not guessed):

1. **Chroma subtracts a noise floor** (median log magnitude of the spectrum) before folding to
   twelve notes. The chroma exactly as written in section 6.2 failed the 10 dB noise test.
2. **Verification rule changed** (`verifyChord` in `src/dsp/templates.ts`). Section 6.6 said
   "similarity at least 0.70 and first or second place". That accepted Em for E and Am for C.
   Now: similarity at least 0.70, within `verifyMargin` (0.08) of the best triad, and it must beat the
   same root in the other quality. Measured on synthetic chords: right chords have margin 0 or less,
   wrong relative chords 0.14 or more. **Real guitars are noisier: if correct chords are rejected,
   raise `verifyMargin` (settings in `src/dsp/chroma.ts`) after checking Chord lab.**
3. **Seventh and ninth chords have their own templates** (A7 = A C# E G, A9 adds B). The A9 voicing in
   the built in song contains E G B, which on its own is an Em chord.
4. **Test chords use additive harmonics, not Karplus-Strong**, in `src/dsp/testSignals.ts`: an
   integer length delay line is up to 20 cents out of tune at 11 kHz.
5. The built in song and its Chord lab check use the same `ChordListener`; the groove scores a strum
   only after the right chord rings for 3 frames in the 400 ms after it.
6. Chart editor nudges block edges with buttons (0.1 s steps) instead of dragging.
7. Importing a chart requires the same recording (same file hash); a re-encoded file will be refused.
8. Targets that began before the loudness gate was learned are skipped only when under 1 s of them is left.

---

Written 14 November 2026 against commit `389fc18` on `main`.
Read `AGENTS.md` first. It governs setup, testing and publishing.
This file tells you what to build, in what order, and how to prove each step works.

## 1. What the owner wants

Jazztrum should work like the commercial guitar learning apps:

1. The owner picks any audio file (for example his own MP3 of Nothing Else Matters).
2. The app analyses the recording and works out which chord is being played at each moment.
3. The app plays the recording and shows a scrolling timeline of the chords to play, with the fingering diagram for the current and next chord.
4. The app listens to the guitar through the microphone and counts every chord the player got right.

The player is a child learning guitar on an iPad. Keep the screens simple, the words plain and the buttons large.

## 2. Where the code stands today (verified, not assumed)

Baseline: `npm ci`, `npm test` (57 tests pass) and `npm run build` all succeed.

| File | What it does |
| --- | --- |
| `src/main.tsx` | The whole app in about 25 very long lines. Hard to edit safely. |
| `src/Tuner.tsx` | Guitar tuner. Readable. Good pattern for microphone handling. |
| `src/audio/pitch.ts` | Single note pitch detection (YIN). Works for one string, not chords. |
| `src/audio/baseline.ts`, `tuning.ts` | Tuner support. Leave alone. |
| `src/audio/clock.ts`, `synth.ts` | Beat clock and synthesised backing sounds. |
| `src/data/song.ts`, `chords.ts` | One hard coded 8 bar song using only Em and A9. |
| `src/game/judge.ts` | Timing judgement only (was the strum on the beat). |
| `public/sw.js` | Service worker. Network first, skips `.mp3`. Cache name `jazztrum-v8`. |

Facts that correct the owner's impression of the current state:

- **There is no chord recognition at all.** The game detects a strum as a jump in microphone loudness (`rms` test in the `draw` loop of `main.tsx`) and scores timing only. The Help text says so. Any chord, or a hand clap, scores. "Fix the recognition" really means "build it".
- **There is no MP3 analysis at all.** The "Nothing Else Matters" option is an `<audio>` player plus four hard coded string cards timed to the first 2.4 seconds. Nothing is read from the audio.
- The default recording path `nothing-else-matters.mp3` is listed in `.gitignore`, so it does not exist on the live site and the player shows an error until a file is chosen.
- Chord diagrams only support Em and A9. Finger numbers are hard coded inside the `Diagram` component.
- `README.md` calls the built in song "Table Mountain Stomp"; the screen calls it "Jasper's Disco Groove". Use the screen name and fix the README.

## 3. Rules you must not break

1. No backend, no accounts, no API keys, no remote analysis service. Everything runs in the browser. Hosting is GitHub Pages.
2. **Never commit audio.** The repository is public and the recordings are copyrighted. Imported audio lives only on the device (IndexedDB). Do not commit chord charts of commercial songs either. Charts are generated on the device.
3. Keep the Vite base path `/Jazztrum/`.
4. Do not change the tuner's behaviour. Its tests must keep passing untouched.
5. No heavy dependencies. Write the signal processing yourself as specified below (it is about 300 lines). Do not add Essentia.js (AGPL licence, multi megabyte download) or TensorFlow.
6. Every phase ends with `npm test` and `npm run build` passing, and a bump of the cache name in `public/sw.js` (`jazztrum-v9`, `v10`, ...).
7. You cannot hear a guitar. Never report microphone accuracy as verified. State what was proven by synthetic tests and list what the owner must check on the iPad (section 10).
8. Ship one phase at a time. Each phase must leave the live app working.

## 4. Design decisions already made (do not reopen)

- **Verify, do not classify.** During play the app already knows which chord is expected. Asking "does this sound contain the expected chord" is far more reliable than asking "which of 24 chords is this". All live scoring uses verification.
- **Time based charts.** A chart is a list of chord segments with start and end in seconds of the recording. Beats and bars are optional decoration added later. Reason: beat tracking fails often, and Nothing Else Matters is in 6/8, which simple beat trackers get wrong. Scoring must never depend on beats.
- **Charts are editable.** Automatic chord detection on a full band recording is roughly 60 to 75 percent right with this method. The owner must be able to tap a wrong chord and correct it. Without the editor the feature is not finished.
- **Simplified chords.** Detect major and minor triads only in the first version (24 chords plus "no chord"). A B7 will show as B. That is normal for beginner apps.
- **Recording plays through an `<audio>` element**, as now. Read `audio.currentTime` inside `requestAnimationFrame` for the timeline position. Speed uses `playbackRate`; set `preservesPitch = true` (and `webkitPreservesPitch` for older Safari).
- **Headphones for scored play.** If the recording comes out of the iPad speaker the microphone hears the correct chords from the song itself and everything scores. See section 7.4.

## 5. New file layout

```
src/dsp/fft.ts            radix 2 FFT, Hann window
src/dsp/chroma.ts         audio frame -> 12 pitch class energies
src/dsp/templates.ts      chord templates, similarity, ranking
src/dsp/segment.ts        chroma frames -> smoothed chord segments
src/dsp/testSignals.ts    pure synthesised guitar chords for tests
src/analysis/worker.ts    Web Worker: runs the offline analysis
src/analysis/analyse.ts   decode, downsample, call worker
src/library/store.ts      IndexedDB: audio blobs and charts
src/library/chart.ts      chart type, validation, import, export
src/live/chordListener.ts microphone -> verification results
src/data/chordShapes.ts   fingerings for all supported chords
src/ui/...                one component per screen (see phase 0)
```

Every `src/dsp` file must be pure TypeScript with no browser APIs, so it runs in vitest and in the worker.

### Chart format

```ts
type ChordName = string; // 'Em', 'C', 'F#m', or 'N' for no chord
type Segment = {
  start: number;      // seconds in the recording
  end: number;
  chord: ChordName;
  confidence: number; // 0 to 1
  edited?: boolean;   // true once the owner corrected it
};
type SongChart = {
  version: 1;
  id: string;         // see store.ts
  title: string;
  duration: number;
  tuningCents: number;  // recording's offset from A = 440
  segments: Segment[];  // sorted, no gaps, no overlaps
  beats?: number[];     // optional, phase 6
};
```

Segments must cover the whole recording from 0 to `duration` with no gaps. Write a `validateChart` function and test it.

## 6. Signal processing specification

Use these numbers as given. They are starting values that are known to be sensible. Put the tunable ones in a single exported `settings` object.

### 6.1 Preparing audio (offline analysis)

1. `decodeAudioData` on the file's `ArrayBuffer`.
2. Mix to mono (average the channels).
3. Downsample by hand to about 11 kHz: `stride = Math.floor(sampleRate / 11025)`, average each group of `stride` samples (same method as `detectPitch` in `pitch.ts`). Resulting rate is `sampleRate / stride`. Do not use `OfflineAudioContext` for resampling; low rates are unreliable on older Safari.
4. Drop the reference to the decoded buffer straight away (a six minute stereo file is about 140 MB decoded). Transfer the mono `Float32Array` to the worker as a transferable.
5. Refuse files longer than 15 minutes with a clear message.

### 6.2 Chroma (shared by offline and live)

`chroma(frame: Float32Array, sampleRate: number, tuningCents: number): Float32Array(12)`

1. Frame length 4096 samples, Hann window, FFT, magnitude spectrum.
2. For every bin whose frequency `f` is between 65 Hz and 2100 Hz:
   - `pitch = 69 + 12 * log2(f / (440 * 2 ** (tuningCents / 1200)))`
   - `distance = pitch - round(pitch)` (in semitones, -0.5 to 0.5)
   - `weight = exp(-0.5 * (distance / 0.25) ** 2)`
   - add `weight * log(1 + 10 * magnitude)` to pitch class `round(pitch) mod 12` (0 = C).
3. Divide the 12 values by their Euclidean length. If the frame's loudness (root mean square) is below the silence gate, return all zeros.

Offline hop size: 1024 samples (about 93 ms).

### 6.3 Tuning estimate (offline only)

Recordings are often not at exactly A = 440. Take about 200 evenly spaced loud frames. For each candidate offset from -50 to +50 cents in steps of 10, compute the sum over frames of the largest chroma value before normalisation (energy lands most sharply on semitone centres when the offset is right). Pick the offset with the largest sum. Store it as `tuningCents`. Live microphone analysis always uses 0 because the guitar has been tuned with the tuner.

### 6.4 Chord templates

For each of the 12 major chords (root, +4, +7 semitones) and 12 minor chords (root, +3, +7):

- add 1.0 at each chord tone,
- add 0.3 at each chord tone + 7 semitones (the strong third harmonic),
- add 0.1 at each chord tone + 4 semitones (the fifth harmonic),
- normalise to Euclidean length 1.

Similarity between a chroma vector and a template is the dot product (both have length 1, so this is cosine similarity, 0 to 1).

Export `rankChords(chroma)` returning all 24 chords sorted by similarity, and `similarityTo(chroma, chordName)`.

For verification, a chord with extra notes maps to its triad: `B7`, `Bmaj7`, `Bsus4` all verify against `B`; `Em7` against `Em`. `A9` (used by the built in song) verifies against `A`.

### 6.5 From frames to segments (offline)

1. Smooth: replace each frame's chroma with the mean of frames within plus or minus 4 frames (about 0.8 seconds in total), then renormalise.
2. For every frame compute similarity to all 24 templates. A silent frame is state `N`.
3. Find the best path with dynamic programming (Viterbi): the score of a path is the sum of the similarities of the chosen chord at each frame, minus a penalty of 0.6 every time the chord changes. This removes flicker. The penalty is the main tuning knob: higher means fewer, longer segments.
4. Merge any segment shorter than 0.5 seconds into the neighbour it is more similar to.
5. `confidence` of a segment is its mean similarity minus the mean similarity of the second best chord over the same frames, clamped to 0 to 1 after multiplying by 5.

### 6.6 Live verification

In `src/live/chordListener.ts`:

1. Microphone constraints exactly as `Tuner.tsx` uses (echo cancellation, noise suppression and automatic gain all off).
2. `AnalyserNode` with `fftSize = 32768`. Every 50 ms call `getFloatTimeDomainData`, take the newest 16384 samples, downsample by averaging to about 12 kHz (same `stride` rule), take the newest 4096 of those, compute chroma with `tuningCents = 0`. No AudioWorklet is needed.
3. A frame **matches** the expected chord when all of these hold:
   - microphone loudness is above the gate (section 7.4),
   - `similarityTo(chroma, expected) >= 0.70`,
   - the expected chord is first or second in `rankChords`.
4. A **target** is **hit** when 3 consecutive frames match (150 ms of the right chord ringing) at any time inside the target's window.
5. When a target ends without a hit, record the top ranked chord heard while the microphone was above the gate (for the "you played G" hint), or "nothing heard".

The second place allowance exists because chords that share two notes (Em and G, Am and C) sit close together. Do not tighten it without device testing.

## 7. Phases

### Phase 0: make the code editable (no behaviour change)

- Split `src/main.tsx` into readable components under `src/ui/`: `App`, `GrooveGame` (the built in song), `ChordDiagram`, `SongPicker`. Normal formatting, one statement per line.
- Move the game loop's state into a hook or class with named fields.
- Fix the README song name.
- Done when: all 57 tests pass unchanged, the build passes, and the built in song plays, scores and calibrates exactly as before in a browser preview.

### Phase 1: signal processing core with tests

Build `src/dsp/*`. Build `testSignals.ts`: a pure function that synthesises a strummed guitar chord from six fret numbers using the same plucked string method as `pluck` in `synth.ts` (open string notes are MIDI 40, 45, 50, 55, 59, 64; add the fret number), strings staggered 25 ms apart, plus optional white noise.

Required tests:

- FFT of a sine wave peaks at the right bin.
- Chroma of a single synthesised A (110 Hz) note peaks at pitch class A.
- Every one of the 18 fingerings in section 8, synthesised, ranks its own triad first.
- Verification rejects near misses: Em played when E expected, Am when A expected, A when Am expected, D when Dm expected.
- Verification accepts with noise added at a signal to noise ratio of 10 dB.
- A synthesised sequence Em (4 s), C (4 s), G (4 s), D (4 s) through the full offline pipeline gives exactly those four segments with boundaries within 0.3 s.
- The same sequence pitched 30 cents sharp gives `tuningCents` between 20 and 40 and the same four chords.

Done when all of these pass. Nothing visible changes in the app yet.

### Phase 2: chord lab and chord scoring in the built in song

- Add a **Chord lab** screen (button beside "Tune guitar"): live microphone level, twelve bars showing the chroma, and the top three chords with their similarity numbers. This is the owner's diagnostic tool and your only window on real guitar behaviour. Keep it permanently.
- In the built in song, a strum now scores "Nailed!" only if timing is good **and** the chord verifies (use the 400 ms after the strum; require 3 matching frames). Timing good but chord wrong shows "Right time, wrong chord". Keep tapping the neck as a timing only fallback and keep the existing behaviour when the microphone is unavailable.
- Update the Help text, which currently says chords are not judged.
- Done when: tests cover the new judgement, and the owner confirms in Chord lab that his Em and A9 are recognised (section 10).

### Phase 3: import and analyse a recording

- **Song library** screen replacing the two item "Tune" dropdown: the built in groove plus imported songs, with an "Add a song" file button (`accept="audio/*"`).
- On import: store the file blob in IndexedDB, run the analysis in the Web Worker, show a progress bar (the worker posts progress), store the chart. Song `id` is a SHA-256 of the file bytes (`crypto.subtle.digest`), so re-importing the same file reuses the chart.
- Load the worker the Vite way: `new Worker(new URL('./worker.ts', import.meta.url), {type: 'module'})`.
- Remove the hard coded `nothing-else-matters.mp3` path and the four string cards.
- Allow rename and delete of a song.
- Done when: importing a file produces a stored chart that survives a page reload, analysis of a five minute file finishes in under 30 seconds on a laptop, and the page stays responsive during analysis.

### Phase 4: play along screen

- Scrolling timeline on the existing canvas style: chord blocks move right to left toward the glowing line, each labelled with its chord name. Show about 8 seconds ahead.
- Current chord diagram large, next chord diagram smaller, as on the groove screen.
- Targets: each segment is one target. Split any segment longer than 4 seconds into equal targets of at most 4 seconds, so holding a long chord keeps earning. `N` segments are rests, not targets.
- Target window: from 0.15 s before its start to its end, shifted by the stored timing calibration offset.
- Score display: "Chords hit: 23 of 31" plus best score per song (in the song's library record). Colour each passed block green (hit) or red (missed) and show the "you played ..." hint briefly on a miss.
- Speed: normal, 3/4, 1/2. Seeking or restarting clears the hits after the new position.
- Low confidence segments (below 0.3) are drawn hatched so the owner knows which chords to check.
- Done when: a synthetic test drives the scoring logic with fake listener results, and a manual browser check with the synthesised four chord file shows the timeline in step with the audio.

### Phase 5: chart editor and sharing

- In an "Edit chords" mode: tap a block to choose a different chord from a grid, drag a boundary to move it (snap to 0.1 s), split a block at the playhead, merge with the next block. Mark changed segments `edited: true`.
- "Analyse again" keeps edited segments and only replaces unedited ones.
- Export chart as a JSON file, import a chart JSON onto an already imported recording. Validate with `validateChart`.
- Done when: edits persist across reloads and an exported chart re-imports identically (test this round trip).

### Phase 6: optional, only after the owner signs off phases 0 to 5

- Tempo and beat grid (onset strength, autocorrelation between 60 and 180 beats per minute, snap chord boundaries to a beat when within 120 ms). Must never change scoring.
- Loop a section between two markers.
- Seventh chords shown in the chart (detect by energy at the flat seventh).

## 8. Chord fingerings to add

Frets from thick low E to thin high e. `x` means do not play the string.

```
Em   0 2 2 0 0 0      E    0 2 2 1 0 0
Am   x 0 2 2 1 0      A    x 0 2 2 2 0
Dm   x x 0 2 3 1      D    x x 0 2 3 2
C    x 3 2 0 1 0      G    3 2 0 0 0 3
F    1 3 3 2 1 1      B7   x 2 1 2 0 2
A7   x 0 2 0 2 0      D7   x x 0 2 1 2
E7   0 2 0 1 0 0      G7   3 2 0 0 0 1
C7   x 3 2 3 1 0      Bm   x 2 4 4 3 2
F#m  2 4 4 2 2 2      B    x 2 4 4 4 2
```

Keep the existing `A9: x 0 2 4 2 3`.

For any other major or minor chord generate a barre shape. With `n` as the fret of the root on the low E string: major `n n+2 n+2 n+1 n n`, minor `n n+2 n+2 n n n`. If `n` would be above 7, use the A string root instead: major `x n n+2 n+2 n+2 n`, minor `x n n+2 n+2 n+1 n`.

`ChordDiagram` must be rewritten to take a fingering, draw five frets, and show a starting fret label ("3fr") when the shape sits above the third fret. Store finger numbers with each named shape instead of inside the component.

## 9. Things that will go wrong, and what to do

- **Everything scores as correct during play along.** The microphone is hearing the recording. Show "Use headphones for scoring" before play. During the first two seconds of playback measure the microphone loudness and set the gate to 2.5 times that level (never lower than the existing `minimumPitchRms`). If the measured level is already very high, show a warning that the speaker is too loud to score.
- **Chart flickers between chords.** Raise the change penalty (6.5 step 3) or the smoothing width.
- **Chart is full of unlikely chords (lots of sharps for a song in an easy key).** The tuning estimate is wrong. Log `tuningCents` and check 6.3.
- **Arpeggiated passages (the opening of Nothing Else Matters picks single strings) detect poorly.** The smoothing window should gather the notes into one chord. If it does not, widen smoothing for low loudness passages; do not special case the song.
- **Low E and A chords misread on the microphone.** Small device microphones cut bass. The harmonic weights in 6.4 exist for this. Check in Chord lab before changing numbers.
- **iPad Safari refuses audio.** The `AudioContext` must be created or resumed inside a tap handler, as the existing code does.
- **Old version keeps loading.** Forgotten cache name bump in `public/sw.js`.

A sanity reference for the owner's test song: Nothing Else Matters is in E minor and uses mainly Em, D, C, G, B (B7) and Am. A chart dominated by those is plausible. A chart dominated by other chords means a bug. Do not hard code this.

## 10. What the owner must check on the iPad after each phase

You cannot do these. List them in your completion report and do not call the phase proven until he answers.

- Phase 2: in Chord lab, strum Em, A9 (should show A), C, G, D, Am slowly. Is the right chord first or second each time? Note any that are not.
- Phase 2: in the built in song, do right chords score and a deliberately wrong chord not score?
- Phase 3: import the MP3. Does analysis finish? Roughly how long?
- Phase 4: with headphones, play along. Do correct chords turn green? With the guitar silent, does everything stay red?
- Phase 4: without headphones, does the warning appear?
- Phase 5: correct three chords, close the app, reopen. Are the corrections still there?

## 11. Reporting back

After each phase report: what was built, test count before and after, the GitHub Actions run result, the live URL check, the list from section 10 for that phase, and any setting you changed from this document with the reason.
