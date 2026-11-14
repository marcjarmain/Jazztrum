import {HitDetector, type LiveFrame} from '../live/chordListener';
import type {Target} from './targets';

export type TargetStatus = 'pending' | 'hit' | 'miss' | 'skipped';
export type TargetState = {status: TargetStatus; heard: string | null};

// Scores a song against the microphone. Times are seconds in the recording.
// A target can be played from `lead` seconds before it starts until it ends,
// all moved later by `shift` (the player's timing calibration).
export class SongScorer {
  states: TargetState[];
  private detectors: (HitDetector | null)[];
  constructor(readonly targets: Target[], private lead = 0.15, private shift = 0) {
    this.states = targets.map(() => ({status: 'pending', heard: null}));
    this.detectors = targets.map(() => null);
  }
  setShift(seconds: number) {this.shift = seconds;}
  private opens = (t: Target) => t.start - this.lead + this.shift;
  private closes = (t: Target) => t.end + this.shift;

  // While the loudness gate is still being learned nothing is judged. A target that began
  // before `time` is skipped only if too little of it is left to listen to (`minimumLeft` seconds).
  skipBefore(time: number, minimumLeft = 1) {
    this.targets.forEach((t, i) => {
      if (this.states[i].status === 'pending' && t.start < time && this.closes(t) - time < minimumLeft) this.states[i] = {status: 'skipped', heard: null};
    });
  }

  feed(time: number, frame: LiveFrame) {
    this.targets.forEach((t, i) => {
      const state = this.states[i];
      if (state.status !== 'pending') return;
      if (time >= this.opens(t) && time <= this.closes(t)) {
        const detector = this.detectors[i] ??= new HitDetector(t.chord);
        if (detector.push(frame)) this.states[i] = {status: 'hit', heard: null};
      } else if (time > this.closes(t)) {
        this.states[i] = {status: 'miss', heard: this.detectors[i]?.heard ?? null};
      }
    });
  }

  // Jumping around forgets every result from the new position onward.
  seek(time: number) {
    this.targets.forEach((t, i) => {
      if (this.closes(t) > time) {
        this.states[i] = {status: 'pending', heard: null};
        this.detectors[i] = null;
      }
    });
  }

  finish() {
    this.targets.forEach((_, i) => {
      if (this.states[i].status === 'pending') this.states[i] = {status: 'miss', heard: this.detectors[i]?.heard ?? null};
    });
  }

  get hits() {return this.states.filter(s => s.status === 'hit').length;}
  get total() {return this.states.filter(s => s.status !== 'skipped').length;}
}
