import {chroma, downsample, rms, settings} from '../dsp/chroma';
import {rankChords, verifyChord} from '../dsp/templates';

export type LiveFrame = {chroma: Float32Array; level: number; active: boolean};
const liveRate = 12000;
const silent = () => new Float32Array(12);

// Pure: turn the newest microphone samples into one chroma frame.
// `buffer` is the analyser's time data; `gate` is the minimum loudness (RMS) to count as playing.
export function liveFrame(buffer: Float32Array, sampleRate: number, gate: number): LiveFrame {
  const newest = buffer.subarray(Math.max(0, buffer.length - 16384));
  const low = downsample(newest, sampleRate, liveRate);
  if (low.samples.length < settings.frameSize) return {chroma: silent(), level: 0, active: false};
  const window = low.samples.subarray(low.samples.length - settings.frameSize);
  const level = rms(window);
  if (level < gate) return {chroma: silent(), level, active: false};
  return {chroma: chroma(window, low.sampleRate, 0, gate), level, active: true};
}

// Decides whether one target chord was played: the expected chord must verify in
// `settings.verifyFrames` consecutive frames. Also remembers what was heard instead.
export class HitDetector {
  hit = false;
  private run = 0;
  private heardCounts = new Map<string, number>();
  constructor(readonly expected: string, private needed = settings.verifyFrames) {}
  push(frame: LiveFrame) {
    if (!frame.active) {
      this.run = 0;
      return this.hit;
    }
    const top = rankChords(frame.chroma)[0].name;
    this.heardCounts.set(top, (this.heardCounts.get(top) ?? 0) + 1);
    if (verifyChord(frame.chroma, this.expected).ok) {
      if (++this.run >= this.needed) this.hit = true;
    } else {
      this.run = 0;
    }
    return this.hit;
  }
  get heard(): string | null {
    let best: string | null = null, count = 0;
    for (const [name, n] of this.heardCounts) if (n > count) {best = name; count = n;}
    return best;
  }
}

// Browser side: an analyser on the microphone with a silent output so Safari keeps it running.
export class ChordListener {
  private analyser: AnalyserNode;
  private sink: GainNode;
  private buffer: Float32Array<ArrayBuffer>;
  constructor(private ctx: AudioContext, source: AudioNode) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 32768;
    this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    source.connect(this.analyser);
    this.analyser.connect(this.sink).connect(ctx.destination);
  }
  read(gate: number): LiveFrame {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return liveFrame(this.buffer, this.ctx.sampleRate, gate);
  }
  close() {
    this.analyser.disconnect();
    this.sink.disconnect();
  }
}
