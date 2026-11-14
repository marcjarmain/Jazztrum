import {useEffect, useState} from 'react';
import {getAudio, getSong, type SongRecord} from '../library/store';
import {chordAt, formatTime} from '../library/chart';
import {ChordDiagram} from './ChordDiagram';

type Props = {id: string; onBack: () => void; onOpenTuner: () => void; onOpenLab: () => void};

// First version of the play screen: the recording and its chord list. Phase 4 adds the timeline.
export function SongScreen({id, onBack, onOpenTuner, onOpenLab}: Props) {
  const [song, setSong] = useState<SongRecord | null | undefined>(undefined);
  const [url, setUrl] = useState('');
  const [time, setTime] = useState(0);

  useEffect(() => {
    let made = '';
    (async () => {
      const [record, blob] = await Promise.all([getSong(id), getAudio(id)]);
      setSong(record ?? null);
      if (blob) {made = URL.createObjectURL(blob); setUrl(made);}
    })().catch(() => setSong(null));
    return () => { if (made) URL.revokeObjectURL(made); };
  }, [id]);

  if (song === undefined) return <main><p>Loading…</p></main>;
  if (!song) return <main><p>This song could not be found.</p><button onClick={onBack}>Back to songs</button></main>;
  const now = chordAt(song.chart.segments, time);
  return (
    <main>
      <header>
        <div><p className="eyebrow">JAZZTRUM · YOUR SONG</p><h1>{song.title}</h1></div>
      </header>
      <nav>
        <button onClick={onBack}>Songs</button>
        <button onClick={onOpenTuner}>Tune guitar</button>
        <button onClick={onOpenLab}>Chord lab</button>
      </nav>
      <section className="recording">
        {url && <audio controls src={url} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onSeeked={e => setTime(e.currentTarget.currentTime)} />}
        {now && <div className="chords"><div><small>PLAY THIS</small><ChordDiagram name={now.chord} /></div></div>}
        <ol className="chord-list">
          {song.chart.segments.map((s, i) => (
            <li key={i} className={s === now ? 'active' : ''}>{formatTime(s.start)} <strong>{s.chord === 'N' ? 'rest' : s.chord}</strong></li>
          ))}
        </ol>
      </section>
    </main>
  );
}
