import {describe, it, expect} from 'vitest';
import {beatLength, eventTime} from './clock';
describe('practice speed', () => {
  it.each([1, .5, .25])('keeps music and targets on the same beats at %s speed', speed => {
    const beat = beatLength(96, speed);
    expect(eventTime(10, 1.5, 96, speed)).toBeCloseTo(10 + 1.5 * beat);
    expect(eventTime(10, 32, 96, speed) - 10).toBeCloseTo(32 * beat);
    expect(beat * speed).toBeCloseTo(60 / 96);
  });
});
