import {useEffect, useState} from 'react';
import {analyseFile} from '../analysis/analyse';
import {deleteSong, getSong, listSongs, saveAudio, saveSong, askToKeepStorage, type SongRecord} from '../library/store';
import {formatTime} from '../library/chart';

type Props = {onOpenGroove: () => void; onOpenSong: (id: string) => void; onBack: () => void};

export function SongLibrary({onOpenGroove, onOpenSong, onBack}: Props) {
  const [songs, setSongs] = useState<SongRecord[] | null>(null);
  const [progress, setProgress] = useState<{fraction: number; message: string} | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [renaming, setRenaming] = useState<{id: string; title: string} | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = () => listSongs().then(setSongs, () => {setSongs([]); setError('Songs cannot be stored in this browser (private browsing?).');});
  useEffect(() => {void refresh();}, []);

  async function addFile(file: File) {
    setError(''); setNotice('');
    try {
      await askToKeepStorage();
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'My song';
      const chart = await analyseFile(file, title, (fraction, message) => setProgress({fraction, message}));
      const existing = await getSong(chart.id);
      if (existing) {
        setNotice(`“${existing.title}” is already in your songs.`);
      } else {
        await saveAudio(chart.id, file);
        await saveSong({id: chart.id, title, chart, best: 0, added: Date.now()});
        setNotice(`Added “${title}”. Check the chords before you play: tap Edit chords if any look wrong.`);
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this song.');
    } finally {
      setProgress(null);
    }
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">JAZZTRUM</p>
          <h1>Songs</h1>
          <p>Add a recording from this device. Jazztrum works out the chords and keeps the file on this device only.</p>
        </div>
        <button onClick={onBack}>Back</button>
      </header>
      <section className="recording library">
        <div className="song-row">
          <div><strong>Jasper’s Disco Groove</strong><br /><small>BUILT IN · EM AND A9</small></div>
          <button className="primary" onClick={onOpenGroove}>Play</button>
        </div>
        {songs?.map(song => (
          <div className="song-row" key={song.id}>
            <div>
              {renaming?.id === song.id ? (
                <form onSubmit={async e => {
                  e.preventDefault();
                  const title = renaming.title.trim() || song.title;
                  await saveSong({...song, title, chart: {...song.chart, title}});
                  setRenaming(null); void refresh();
                }}>
                  <input autoFocus value={renaming.title} aria-label="Song name" onChange={e => setRenaming({id: song.id, title: e.target.value})} />
                  <button type="submit">Save</button>
                </form>
              ) : (
                <><strong>{song.title}</strong><br /><small>{formatTime(song.chart.duration)} · BEST {song.best}</small></>
              )}
            </div>
            <div className="song-actions">
              <button className="primary" onClick={() => onOpenSong(song.id)}>Play</button>
              <button onClick={() => setRenaming({id: song.id, title: song.title})}>Rename</button>
              {deleting === song.id
                ? <button onClick={async () => {await deleteSong(song.id); setDeleting(null); void refresh();}}>Yes, delete</button>
                : <button onClick={() => setDeleting(song.id)}>Delete</button>}
            </div>
          </div>
        ))}
        {songs?.length === 0 && !error && <p>No songs added yet.</p>}
        <label className="add-song">
          <span className="button">＋ Add a song</span>
          <input type="file" accept="audio/*" disabled={!!progress} onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void addFile(file);
          }} />
        </label>
        {progress && <p role="status"><progress value={progress.fraction} max={1} /> {progress.message} {Math.round(progress.fraction * 100)}%</p>}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
        <p><small>Recordings are copyrighted. They stay in this browser and are never uploaded.</small></p>
      </section>
    </main>
  );
}
