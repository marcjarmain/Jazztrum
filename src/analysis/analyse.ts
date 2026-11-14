import {settings} from '../dsp/chroma';
import type {SongChart} from '../library/chart';

const targetRate = 11025;

export async function fileId(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

// Mix to mono and drop to about 11 kHz in one pass, so the full decoded
// recording never needs a second copy in memory.
export function toMonoLow(buffer: AudioBuffer) {
  const stride = Math.max(1, Math.floor(buffer.sampleRate / targetRate));
  const out = new Float32Array(Math.floor(buffer.length / stride));
  const channels = Array.from({length: buffer.numberOfChannels}, (_, c) => buffer.getChannelData(c));
  const scale = 1 / (stride * channels.length);
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (const data of channels) for (let j = 0; j < stride; j++) sum += data[i * stride + j];
    out[i] = sum * scale;
  }
  return {samples: out, sampleRate: buffer.sampleRate / stride};
}

function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  return new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(bytes, resolve, reject))
    .catch(() => {throw new Error('This file could not be read as audio. Try an MP3 or M4A file.');})
    .finally(() => void ctx.close());
}

// Reads a file, finds its chords and returns a chart.
export async function analyseFile(file: File, title: string, onProgress: (fraction: number, message: string) => void): Promise<SongChart> {
  onProgress(0, 'Reading the file…');
  const bytes = await file.arrayBuffer();
  const id = await fileId(bytes.slice(0));
  onProgress(0.02, 'Decoding the audio…');
  const buffer = await decode(bytes);
  if (buffer.duration > settings.maxFileSeconds) throw new Error('This recording is longer than 15 minutes. Please choose a shorter one.');
  const low = toMonoLow(buffer);
  onProgress(0.05, 'Finding the chords…');
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {type: 'module'});
  try {
    const result = await new Promise<{duration: number; tuningCents: number; segments: SongChart['segments']}>((resolve, reject) => {
      worker.onmessage = e => {
        if (e.data.type === 'progress') onProgress(0.05 + 0.95 * e.data.fraction, 'Finding the chords…');
        else if (e.data.type === 'done') resolve(e.data);
        else reject(new Error(e.data.message));
      };
      worker.onerror = () => reject(new Error('The chord analysis stopped unexpectedly.'));
      worker.postMessage({samples: low.samples, sampleRate: low.sampleRate}, [low.samples.buffer]);
    });
    onProgress(1, 'Done');
    return {version: 1, id, title, duration: result.duration, tuningCents: result.tuningCents, segments: result.segments};
  } finally {
    worker.terminate();
  }
}
