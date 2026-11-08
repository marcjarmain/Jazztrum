import {centsFrom, guitarStrings, minimumPitchRms} from './pitch';

export const baselineStorageKey = 'jazztrum-guitar-baseline-v1';
export type StringBaseline = {frequency: number; rms: number; harmonic: 1 | 2};
export type GuitarBaseline = {version: 1; createdAt: string; deviceId: string; strings: StringBaseline[]};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Only accept a complete six-string profile close to standard tuning. A wrong
// string, octave, malformed storage entry, or partial setup is never a target.
export function parseBaseline(raw: string | null): GuitarBaseline | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.deviceId !== 'string' || typeof value.createdAt !== 'string'
      || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.strings) || value.strings.length !== 6) return null;
    if (!value.strings.every((entry: StringBaseline, index: number) => entry && Number.isFinite(entry.frequency)
      && Math.abs(centsFrom(entry.frequency, guitarStrings[index].frequency)) <= 50
      && Number.isFinite(entry.rms) && entry.rms >= 0.0001 && entry.rms <= 1 && (entry.harmonic === 1 || entry.harmonic === 2))) return null;
    return value as GuitarBaseline;
  } catch {return null;}
}

export function baselineSensitivity(profile: GuitarBaseline | null, selected: number | null) {
  if (!profile) return minimumPitchRms;
  const rms = selected === null ? Math.min(...profile.strings.map(entry => entry.rms)) : profile.strings[selected].rms;
  return Math.min(minimumPitchRms, Math.max(0.0001, rms * 0.15));
}

export function sameMicrophone(profile: GuitarBaseline | null, deviceId: string) {
  return !profile?.deviceId || !deviceId || profile.deviceId === deviceId;
}

// Only account for an upper overtone after the user explicitly learned it for
// that string. Never fold arbitrary octaves to make them appear in tune.
export function baselinePitch(frequency: number | null, profile: GuitarBaseline | null, selected: number | null) {
  if (frequency === null || !profile) return frequency;
  const indexes = selected === null ? profile.strings.map((_, index) => index) : [selected];
  const match = indexes.find(index => {
    const entry = profile.strings[index];
    return entry.harmonic === 2 && Math.abs(centsFrom(frequency, entry.frequency * 2)) <= 100;
  });
  return match === undefined ? frequency : frequency / 2;
}

export class BaselineCapture {
  private samples: {frequency: number; rms: number; time: number; harmonic: 1 | 2}[] = [];
  private result: StringBaseline | null = null;
  reset() {this.samples = []; this.result = null;}
  add(index: number, frequency: number | null, rms: number, time: number) {
    if (this.result) return {progress: 1, candidate: this.result, reason: 'ready' as const};
    if (this.samples.length && time - this.samples[this.samples.length - 1].time > 350) this.samples = [];
    if (frequency === null || !Number.isFinite(frequency) || !Number.isFinite(rms) || rms < 0.0001 || rms >= 0.6) {
      return {progress: 0, candidate: null, reason: 'waiting' as const};
    }
    const harmonic = Math.abs(centsFrom(frequency, guitarStrings[index].frequency * 2)) <= 50 ? 2 : 1;
    const fundamental = frequency / harmonic;
    if (Math.abs(centsFrom(fundamental, guitarStrings[index].frequency)) > 50) {
      this.samples = [];
      return {progress: 0, candidate: null, reason: 'wrong-note' as const};
    }
    if (this.samples.length && Math.abs(centsFrom(fundamental, median(this.samples.map(sample => sample.frequency)))) > 8) this.samples = [];
    this.samples.push({frequency: fundamental, rms, time, harmonic});
    if (this.samples.length > 24) this.samples.shift();
    const progress = Math.min(1, this.samples.length / 10, (time - this.samples[0].time) / 900);
    if (progress >= 1) {
      this.result = {frequency: median(this.samples.map(sample => sample.frequency)), rms: median(this.samples.map(sample => sample.rms)), harmonic: this.samples.filter(sample => sample.harmonic === 2).length >= 3 ? 2 : 1};
    }
    return {progress, candidate: this.result, reason: this.result ? 'ready' as const : 'listening' as const};
  }
}
