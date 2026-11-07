# Jazztrum

A guitar rhythm game for iPad. Play Table Mountain Stomp and tap or strum at the glowing line.

## Run
Install Node.js, then run `npm install` and `npm run dev`. Run `npm test` for the timing and song tests. `npm run build` makes the production site.

## Publish
Push to main and enable GitHub Pages with GitHub Actions as the source in repository settings. The workflow builds and publishes the app at `https://marcjarmain.github.io/Jazztrum/`.

## Change the song
Open `src/data/song.ts`. Change the BPM, the chords in each bar, and the strum beat positions. Strings and finger positions are in `src/data/chords.ts`. Run the tests after changes; if you deliberately change the song, update the song test too.

On iPad, open the published page in Safari and choose Share → Add to Home Screen. Open it once online before trying offline. Microphone access needs HTTPS. Calibration measures your average delay; use the speaker or wired headphones.
