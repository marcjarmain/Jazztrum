import {useState} from 'react';
import {Tuner} from '../Tuner';
import {GrooveGame} from './GrooveGame';
import {RecordingScreen} from './RecordingScreen';

type Song = 'disco' | 'metallica';

export function App() {
  const [tunerOpen, setTunerOpen] = useState(false);
  const [song, setSong] = useState<Song>('disco');

  if (tunerOpen) return <Tuner onClose={() => setTunerOpen(false)} />;

  const openTuner = () => {
    document.querySelector('audio')?.pause();
    setTunerOpen(true);
  };
  const songChoice = (
    <label className="speed">
      Tune{' '}
      <select aria-label="Tune" value={song} onChange={e => setSong(e.target.value as Song)}>
        <option value="disco">Jasper’s Disco Groove</option>
        <option value="metallica">Nothing Else Matters</option>
      </select>
    </label>
  );
  return song === 'metallica'
    ? <RecordingScreen songChoice={songChoice} onOpenTuner={openTuner} />
    : <GrooveGame songChoice={songChoice} onOpenTuner={openTuner} />;
}
