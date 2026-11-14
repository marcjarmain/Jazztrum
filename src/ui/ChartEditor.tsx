import {useRef, useState} from 'react';
import {analyseFile} from '../analysis/analyse';
import {exportChart, formatTime, parseChart, type Segment} from '../library/chart';
import {mergeAnalysis, mergeNext, moveBoundary, setChord, splitAt} from '../library/edit';
import {getAudio, type SongRecord} from '../library/store';
import {triads} from '../dsp/templates';

type Props = {
  song: SongRecord;
  time: number;
  getTime: () => number;
  seek: (time: number) => void;
  onSegments: (segments: Segment[], tuningCents?: number) => void;
};

// Fix wrong chords: tap a block, pick the right chord, nudge its edges, split or merge it.
export function ChartEditor({song, time, getTime, seek, onSegments}: Props) {
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const segments = song.chart.segments;
  const current = segments[Math.min(selected, segments.length - 1)];
  const index = segments.indexOf(current);

  const apply = (result: Segment[] | null, failure: string) => {
    if (!result) {setNote(failure); return;}
    setNote('');
    onSegments(result);
  };
  const nudge = (which: 'start' | 'end', by: number) => {
    if (which === 'end') apply(moveBoundary(segments, index, current.end + by), 'That would make a block too short.');
    else apply(index > 0 ? moveBoundary(segments, index - 1, current.start + by) : null, index > 0 ? 'That would make a block too short.' : 'The first block starts at the beginning.');
  };

  async function again() {
    setNote(''); setProgress(0);
    try {
      const blob = await getAudio(song.id);
      if (!blob) throw new Error('The recording is no longer stored on this device.');
      const fresh = await analyseFile(new File([blob], song.title), song.title, fraction => setProgress(fraction));
      onSegments(mergeAnalysis(segments, fresh.segments, song.chart.duration), fresh.tuningCents);
      setNote('Analysed again. Your corrected blocks were kept.');
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : 'Could not analyse again.');
    } finally {
      setProgress(null);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([exportChart(song.chart)], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.title}.chords.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function upload(chosen: File) {
    const chart = parseChart(await chosen.text());
    if (!chart) setNote('That is not a valid Jazztrum chord chart.');
    else if (chart.id !== song.id) setNote('This chart was made for a different recording.');
    else {setNote('Chart loaded.'); onSegments(chart.segments, chart.tuningCents);}
  }

  return (
    <section className="recording editor">
      <h2>Edit chords</h2>
      <p>Tap a block to hear it and change it. Hatched or low confidence blocks are the likeliest to be wrong.</p>
      <ol className="segment-list">
        {segments.map((s, i) => (
          <li key={i}>
            <button className={`${i === index ? 'selected' : ''} ${time >= s.start && time < s.end ? 'playing' : ''}`}
              onClick={() => {setSelected(i); seek(s.start + 0.05);}}>
              {formatTime(s.start)} <strong>{s.chord === 'N' ? 'rest' : s.chord}</strong>{s.edited ? ' ✎' : s.confidence < 0.3 ? ' ?' : ''}
            </button>
          </li>
        ))}
      </ol>
      {current && (
        <div className="editor-panel">
          <p><strong>{current.chord === 'N' ? 'Rest' : current.chord}</strong> from {current.start.toFixed(1)} s to {current.end.toFixed(1)} s</p>
          <div className="chord-grid">
            {triads.map(t => <button key={t.name} className={t.name === current.chord ? 'primary' : ''} onClick={() => apply(setChord(segments, index, t.name), '')}>{t.name}</button>)}
            <button className={current.chord === 'N' ? 'primary' : ''} onClick={() => apply(setChord(segments, index, 'N'), '')}>Rest</button>
          </div>
          <div className="editor-actions">
            <button onClick={() => nudge('start', -0.1)}>Start −0.1</button>
            <button onClick={() => nudge('start', 0.1)}>Start +0.1</button>
            <button onClick={() => nudge('end', -0.1)}>End −0.1</button>
            <button onClick={() => nudge('end', 0.1)}>End +0.1</button>
            <button onClick={() => apply(splitAt(segments, getTime()), 'Move the playhead into this block, away from its edges, then split.')}>Split at playhead</button>
            <button onClick={() => apply(mergeNext(segments, index), 'This is the last block.')}>Merge with next</button>
          </div>
        </div>
      )}
      <div className="editor-actions">
        <button onClick={again} disabled={progress !== null}>Analyse again</button>
        <button onClick={download}>Export chart</button>
        <button onClick={() => file.current?.click()}>Import chart</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => {const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f);}} />
      </div>
      {progress !== null && <p role="status"><progress value={progress} max={1} /> Analysing…</p>}
      {note && <p role="status">{note}</p>}
    </section>
  );
}
