import {describe, expect, it} from 'vitest';
import {nextUntunedString, TuningLock} from './tuning';

describe('automatic string completion', () => {
  it('locks after a stable in-tune note, not on its first frame', () => {
    const lock = new TuningLock();
    for (let i = 0; i < 8; i++) expect(lock.add(0, i % 2 ? 4 : -4, i * 90)).toBe(false);
    expect(lock.add(0, 0, 720)).toBe(true);
  });
  it('resets for silence, an out-of-range note, a new string, or a long gap', () => {
    for (const interruption of ['silence', 'flat', 'new-string', 'gap']) {
      const lock = new TuningLock();
      for (let i = 0; i < 7; i++) lock.add(0, 0, i * 90);
      if (interruption === 'silence') expect(lock.add(0, null, 630)).toBe(false);
      if (interruption === 'flat') expect(lock.add(0, -6, 630)).toBe(false);
      if (interruption === 'new-string') expect(lock.add(1, 0, 630)).toBe(false);
      if (interruption === 'gap') expect(lock.add(0, 0, 1000)).toBe(false);
      expect(lock.add(0, 0, 1090)).toBe(false);
    }
  });
  it('moves through the uncompleted strings and stops only after all six', () => {
    const completed = new Set<number>();
    for (let i = 0; i < 6; i++) {
      completed.add(i);
      expect(nextUntunedString(i, completed)).toBe(i === 5 ? null : i + 1);
    }
    expect(nextUntunedString(5, new Set([3, 4, 5]))).toBe(0);
  });
});
