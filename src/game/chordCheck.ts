import {HitDetector, type LiveFrame} from '../live/chordListener';

// After a well timed strum, listen for a short time to see if the right chord rings out.
export class ChordCheck {
  private detector: HitDetector;
  constructor(readonly id: string, readonly chord: string, readonly until: number) {
    this.detector = new HitDetector(chord);
  }
  update(frame: LiveFrame, now: number): {state: 'waiting'} | {state: 'hit'} | {state: 'miss'; heard: string | null} {
    if (this.detector.push(frame)) return {state: 'hit'};
    if (now >= this.until) return {state: 'miss', heard: this.detector.heard};
    return {state: 'waiting'};
  }
}

// Measures loudness before the music starts, so a gate sits clearly above the room.
export class LoudnessGate {
  private ambient = 0;
  constructor(private floor = 0.0008, private factor = 2.5) {}
  learn(level: number) {this.ambient = Math.max(this.ambient, level);}
  get value() {return Math.max(this.floor, this.factor * this.ambient);}
}
