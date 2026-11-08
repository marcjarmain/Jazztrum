import {describe, expect, it} from 'vitest';
import {BaselineCapture, baselinePitch, baselineSensitivity, GuitarBaseline, parseBaseline, sameMicrophone} from './baseline';
import {guitarStrings, tuningReading} from './pitch';

const profile = (): GuitarBaseline => ({version: 1, createdAt: '2026-11-08T08:00:00Z', deviceId: 'test-mic',
  strings: guitarStrings.map(string => ({frequency: string.frequency * 2 ** (6 / 1200), rms: 0.002, harmonic: 1}))});

describe('six-string baseline', () => {
  it.each(guitarStrings.map((string, index) => ({...string, index})))('learns a stable $note after enough real measurements', string => {
    const capture = new BaselineCapture();
    let result = capture.add(string.index, string.frequency, 0.002, 0);
    for (let frame = 1; frame <= 10; frame++) result = capture.add(string.index, string.frequency * 2 ** ((frame % 3 - 1) / 1200), 0.002, frame * 90);
    expect(result.progress).toBe(1);
    expect(result.candidate?.frequency).toBeCloseTo(string.frequency, 1);
    expect(result.candidate?.rms).toBe(0.002);
  });
  it('does not learn silence, another open string, a wrong octave, or an unsettled note', () => {
    const capture = new BaselineCapture();
    for (let i = 0; i < 20; i++) expect(capture.add(0, null, 0, i * 90).candidate).toBeNull();
    for (let i = 0; i < 20; i++) {
      expect(capture.add(0, 329.6, 0.02, i * 90).reason).toBe('wrong-note');
      expect(capture.add(0, guitarStrings[0].frequency * 2 ** ((i % 2 ? 15 : -15) / 1200), 0.02, i * 90).candidate).toBeNull();
    }
  });
  it('can learn a dominant second harmonic for a known tuned string and apply only that learned correction', () => {
    const capture = new BaselineCapture();
    let result = capture.add(0, 164.8, 0.002, 0);
    for (let frame = 1; frame <= 10; frame++) result = capture.add(0, 164.8, 0.002, frame * 90);
    expect(result.candidate?.harmonic).toBe(2);
    expect(result.candidate?.frequency).toBeCloseTo(82.4);
    const learned = profile(); learned.strings[0] = result.candidate!;
    expect(baselinePitch(164.8, learned, 0)).toBeCloseTo(82.4);
    expect(baselinePitch(82.4, learned, 0)).toBeCloseTo(82.4);
    expect(baselinePitch(164.8, profile(), 0)).toBe(164.8);
    expect(baselinePitch(329.6, learned, 0)).toBe(329.6);
    expect(tuningReading(baselinePitch(164.8 * 2 ** (-20 / 1200), learned, 0)!, 0, learned.strings.map(entry => entry.frequency))?.cents).toBeCloseTo(-20);
  });
  it('does not count long gaps or repeated held values as stable capture', () => {
    const capture = new BaselineCapture();
    capture.add(0, 82.4, 0.002, 0);
    for (let i = 1; i < 20; i++) {
      capture.add(0, null, 0, i * 500 - 90);
      expect(capture.add(0, 82.4, 0.002, i * 500).candidate).toBeNull();
    }
  });
  it('only loads complete, valid profiles', () => {
    expect(parseBaseline(JSON.stringify(profile()))?.strings).toHaveLength(6);
    expect(parseBaseline('{broken')).toBeNull();
    const partial = profile(); partial.strings.pop();
    expect(parseBaseline(JSON.stringify(partial))).toBeNull();
    const wrong = profile(); wrong.strings[0].frequency *= 2;
    expect(parseBaseline(JSON.stringify(wrong))).toBeNull();
  });
  it('uses the trusted baseline as zero and still reports later detuning', () => {
    const frequencies = profile().strings.map(string => string.frequency);
    expect(tuningReading(frequencies[0], 0, frequencies)?.cents).toBeCloseTo(0);
    expect(tuningReading(frequencies[0] * 2 ** (-20 / 1200), 0, frequencies)?.cents).toBeCloseTo(-20);
    expect(tuningReading(frequencies[0] * 2 ** (20 / 1200), 0, frequencies)?.inTune).toBe(false);
  });
  it('adapts to learned input level and identifies a different microphone', () => {
    expect(baselineSensitivity(profile(), 0)).toBeCloseTo(0.0003);
    expect(sameMicrophone(profile(), 'another-mic')).toBe(false);
    expect(sameMicrophone(profile(), 'test-mic')).toBe(true);
  });
});
