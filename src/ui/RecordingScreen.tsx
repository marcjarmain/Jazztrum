import {useState, type ReactNode} from 'react';

const openStrings = [
  {name: 'Low E', detail: 'thickest', start: 0.25, end: 1.08},
  {name: 'G', detail: '', start: 1.08, end: 1.49},
  {name: 'B', detail: '', start: 1.49, end: 1.93},
  {name: 'High e', detail: 'thinnest', start: 1.93, end: 2.36},
];

// Temporary screen for the old "Nothing Else Matters" option. Phase 3 replaces it.
export function RecordingScreen({songChoice, onOpenTuner}: {songChoice: ReactNode; onOpenTuner: () => void}) {
  const [recording, setRecording] = useState(import.meta.env.BASE_URL + 'nothing-else-matters.mp3');
  const [audioMissing, setAudioMissing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">JAZZTRUM · YOUR RECORDING</p>
          <h1>Nothing Else Matters</h1>
          <p>Play along with your own recording.</p>
        </div>
      </header>
      <nav>
        <button onClick={onOpenTuner}>Tune guitar</button>
        {songChoice}
        <label className="speed">
          Speed{' '}
          <select
            aria-label="Speed"
            value={speed}
            onChange={e => {
              const next = Number(e.target.value);
              setSpeed(next);
              const audio = document.querySelector('audio');
              if (audio) audio.playbackRate = next;
            }}
          >
            <option value={1}>Normal</option>
            <option value={0.5}>1/2 speed</option>
            <option value={0.25}>1/4 speed</option>
          </select>
        </label>
      </nav>
      <section className="recording">
        <audio
          key={recording}
          controls
          src={recording}
          onTimeUpdate={e => setRecordingTime(e.currentTarget.currentTime)}
          onSeeked={e => setRecordingTime(e.currentTarget.currentTime)}
          onLoadedMetadata={e => {
            e.currentTarget.playbackRate = speed;
            setAudioMissing(false);
          }}
          onError={() => setAudioMissing(true)}
        />
        {audioMissing && <p>Choose your MP3 below to play it on this device.</p>}
        <label>
          Choose a different audio file{' '}
          <input
            type="file"
            accept="audio/*"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (recording.startsWith('blob:')) URL.revokeObjectURL(recording);
              setAudioMissing(false);
              setRecording(URL.createObjectURL(file));
            }}
          />
        </label>
        <div className="intro-chart">
          <h2>Opening: pick the open strings</h2>
          <p>
            Try these one at a time: thick low E → G → B → thin high e. An open string means no finger on a fret.
            Listen to the recording for the timing.
          </p>
          <div className="string-cards">
            {openStrings.map((note, i) => (
              <span key={note.name} className={recordingTime >= note.start && recordingTime < note.end ? 'active' : ''}>
                <b>{i + 1}</b>
                {note.name}
                <br />
                <small>{note.detail}</small>
              </span>
            ))}
          </div>
          <p>
            The highlighted string follows the first few seconds of your recording, including at slower speeds. This is
            an approximate opening guide, not a complete song chart.
          </p>
        </div>
      </section>
    </main>
  );
}
