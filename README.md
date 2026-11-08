# Jazztrum

A guitar rhythm game for iPad. Play Table Mountain Stomp and tap or strum at the glowing line.

## Run
Install Node.js, then run `npm install` and `npm run dev`. Run `npm test` for the timing and song tests. `npm run build` makes the production site.

## Publish
Push to main and enable GitHub Pages with GitHub Actions as the source in repository settings. The workflow builds and publishes the app at `https://marcjarmain.github.io/Jazztrum/`.

## Change the song
Open `src/data/song.ts`. Change the BPM, the chords in each bar, and the strum beat positions. Strings and finger positions are in `src/data/chords.ts`. Run the tests after changes; if you deliberately change the song, update the song test too.

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
