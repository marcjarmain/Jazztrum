// Require fresh, consecutive in-range measurements. A held display value or
// one lucky frame must not complete a string or start an automatic transition.
export class TuningLock {
  private index = -1;
  private started = 0;
  private last = -Infinity;
  private samples = 0;
  reset() {this.index = -1; this.samples = 0; this.last = -Infinity;}
  add(index: number, cents: number | null, time: number) {
    if (cents === null || !Number.isFinite(cents) || Math.abs(cents) > 5) {this.reset(); return false;}
    if (index !== this.index || time - this.last > 250 || time < this.last) {
      this.index = index; this.started = time; this.samples = 0;
    }
    this.last = time;
    this.samples++;
    return this.samples >= 8 && time - this.started >= 650;
  }
}

export function nextUntunedString(index: number, completed: ReadonlySet<number>) {
  for (let offset = 1; offset <= 6; offset++) {
    const next = (index + offset) % 6;
    if (!completed.has(next)) return next;
  }
  return null;
}
