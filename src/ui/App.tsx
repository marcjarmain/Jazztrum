import {useState} from 'react';
import {Tuner} from '../Tuner';
import {ChordLab} from './ChordLab';
import {GrooveGame} from './GrooveGame';
import {SongLibrary} from './SongLibrary';
import {SongScreen} from './SongScreen';

// 'game' is the built in groove, 'song:<id>' an imported song.
type Screen = 'game' | 'tuner' | 'lab' | 'library' | `song:${string}`;

export function App() {
  const [screen, setScreen] = useState<Screen>('game');
  const [returnTo, setReturnTo] = useState<Screen>('game');

  const go = (next: Screen) => setScreen(next);
  const visit = (next: 'tuner' | 'lab') => () => {
    setReturnTo(screen);
    setScreen(next);
  };

  if (screen === 'tuner') return <Tuner onClose={() => go(returnTo)} />;
  if (screen === 'lab') return <ChordLab onClose={() => go(returnTo)} />;
  if (screen === 'library') return <SongLibrary onOpenGroove={() => go('game')} onOpenSong={id => go(`song:${id}`)} onBack={() => go('game')} />;
  if (screen.startsWith('song:')) {
    return <SongScreen key={screen} id={screen.slice(5)} onBack={() => go('library')} onOpenTuner={visit('tuner')} onOpenLab={visit('lab')} />;
  }
  return <GrooveGame onOpenLibrary={() => go('library')} onOpenTuner={visit('tuner')} onOpenLab={visit('lab')} />;
}
