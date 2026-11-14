# Jazztrum

A guitar rhythm game for iPad. Play Jasper’s Disco Groove and tap or strum at the glowing line.

## Run
Install Node.js, then run `npm install` and `npm run dev`. Run `npm test` for the timing and song tests. `npm run build` makes the production site.

## Publish
Push to main and enable GitHub Pages with GitHub Actions as the source in repository settings. The workflow builds and publishes the app at `https://marcjarmain.github.io/Jazztrum/`.

## Add your own songs
Choose **Songs**, then **Add a song** and pick an audio file (MP3, M4A, WAV). Jazztrum works out the chords on the device, in the background, and keeps the file and its chart in this browser only. Nothing is uploaded and no audio is ever stored in this repository.

Open the song and press **Play**. A chord timeline scrolls toward the glowing line, and the app listens through the microphone and counts each chord you get right. Use headphones, or the microphone hears the recording itself. Automatic chord detection is only partly accurate, so tap **Edit chords** to fix wrong chords, move block edges, split or merge blocks, re-analyse (your corrections are kept) or export and import a chart as a JSON file.

**Chord lab** shows what the microphone hears: loudness, the twelve note energies and the three best matching chords. Use it to judge how well your guitar is recognised.

The built in groove is in `src/data/song.ts` (BPM, chords per bar, strum positions) with fingerings in `src/data/chordShapes.ts`. The chord detection maths is in `src/dsp/` and its tunable numbers are in the `settings` object in `src/dsp/chroma.ts`.

On iPad, open the published page in Safari and choose Share → Add to Home Screen. Open it once online before trying offline. Microphone access needs HTTPS. Calibration measures your average delay; use the speaker or wired headphones.

## Tune your guitar

Choose **Tune guitar**, then **Start listening** and allow microphone access.
Select one of the six standard-tuning strings (E2 A2 D3 G3 B3 E4), or use
**Auto-detect string**. Pluck one open string at a time, mute the others, and
adjust gently until the display says **In tune** (within five cents, A4 = 440 Hz).
If the detected note is far from the selected target, check which string you
are plucking before adjusting a tuning peg. Low E and high E are two octaves apart.

Use the HTTPS published app or localhost. Microphone audio is analysed on the
device and is not recorded or uploaded. Practice audio pauses while tuning;
leaving the tuner, stopping it, or hiding the page releases the microphone.
The tuner checks string pitch; the separate **Timing calibration** adjusts
rhythm timing, and practice scoring still does not judge notes or chords.

The needle holds the last measured pitch briefly as a pluck fades, then becomes
an outlined waiting marker. A held value is labelled **Last reading**. The mic
level and status below it distinguish a quiet input from sound that cannot yet
be identified. If the browser pauses audio, use **Restart listening**.

## Learn a baseline from your trusted tuner

Tune all six open strings with your established tuner first, then choose
**Set up my guitar** in Jazztrum. Select **My guitar is tuned — begin** and
allow microphone access. The guided setup starts with string 6 (low E, the
thickest string) and moves through A, D, G, B, then string 1 (high E, the thinnest).
Pluck only the requested string, let it ring until a steady sample is learned,
then wait for its green tick. Setup moves automatically to the next string and
saves the baseline after all six are learned. Do not adjust tuning pegs during setup.
Uncheck **Automatically tick and move to the next string** if you prefer manual
confirmation; a **Next string now** button is also available after a sample locks.

Only a complete set of six references is saved. Cancelling keeps the previous
baseline. Jazztrum stores measured frequencies and input levels in this browser,
not audio recordings, and uses them as the zero point for later tuning checks.
Later sharp or flat notes still move the needle. Samples far from standard
tuning or matching a different open string are rejected. If the microphone
mainly hears the second harmonic, setup labels that overtone and asks you to
confirm the correct string; only that learned harmonic correction is used later.
A baseline cannot recover a guitar that the microphone cannot hear.
Repeat setup when changing guitar or microphone.
If a microphone device change is detected, the saved profile is suspended until
you set up that input. **Clear baseline** returns to the standard references.

During normal tuning, hold the selected string within five cents for about
three quarters of a second. A green tick confirms it, then the next unfinished
string is selected automatically. After all six strings pass, the microphone
stops and the app shows a completion message. A brief flash in range or a held
old reading does not complete a string. Automatic advancement can be switched
off; **Auto-detect string** selects this manual mode. Stop, Cancel, and leaving
the tuner cancel any pending automatic transition.
