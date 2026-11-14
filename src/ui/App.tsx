import {useState} from 'react';
import {Tuner} from '../Tuner';
import {ChordLab} from './ChordLab';
import {GrooveGame} from './GrooveGame';
import {RecordingScreen} from './RecordingScreen';

type Song = 'disco' | 'metallica';
type Screen = 'game' | 'tuner' | 'lab';

export function App() {
  const [screen, setScreen] = useState<Screen>('game');
  const [song, setSong] = useState<Song>('disco');

  if (screen === 'tuner') return <Tuner onClose={() => setScreen('game')} />;
  if (screen === 'lab') return <ChordLab onClose={() => setScreen('game')} />;

  const open = (next: Screen) => () => {
    document.querySelector('audio')?.pause();
    setScreen(next);
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
    ? <RecordingScreen songChoice={songChoice} onOpenTuner={open('tuner')} onOpenLab={open('lab')} />
    : <GrooveGame songChoice={songChoice} onOpenTuner={open('tuner')} onOpenLab={open('lab')} />;
}
