import {describe, it, expect} from 'vitest';
import {liveFrame, HitDetector} from './chordListener';
import {ChordCheck, LoudnessGate} from '../game/chordCheck';
import {strum, concat} from '../dsp/testSignals';
import {shapeFor} from '../data/chordShapes';

const sr = 44100;
// 0.5 s of silence then a strum, as the analyser would see it (newest samples last).
const heardAfter = (chord: string, seconds: number) => {
  const s = concat([new Float32Array(Math.floor(0.5 * sr)), strum(shapeFor(chord)!.frets, 1.5, sr)]);
  return s.subarray(0, Math.floor((0.5 + seconds) * sr));
};
const frames = (chord: string, ats: number[]) => ats.map(t => liveFrame(heardAfter(chord, t), sr, 0.002));

describe('live chord checking', () => {
  it('stays inactive on silence', () => {
    expect(liveFrame(new Float32Array(32768), sr, 0.002).active).toBe(false);
  });
  it('detects the right chord after three frames', () => {
    const d = new HitDetector('Em');
    frames('Em', [0.2, 0.25, 0.3, 0.35, 0.4]).forEach(f => d.push(f));
    expect(d.hit).toBe(true);
  });
  it('does not accept a wrong chord, and reports what it heard', () => {
    const d = new HitDetector('Em');
    frames('Am', [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]).forEach(f => d.push(f));
    expect(d.hit).toBe(false);
    expect(d.heard).toBe('Am');
  });
  it('rejects E when Em is expected and the reverse', () => {
    for (const [played, expected] of [['E', 'Em'], ['Em', 'E']]) {
      const d = new HitDetector(expected);
      frames(played, [0.3, 0.35, 0.4, 0.45, 0.5, 0.55]).forEach(f => d.push(f));
      expect(d.hit, `${played} for ${expected}`).toBe(false);
    }
  });
  it('requires consecutive matching frames', () => {
    const d = new HitDetector('Em');
    const good = frames('Em', [0.4]), bad = frames('Am', [0.4]);
    [good[0], good[0], bad[0], good[0], good[0], bad[0]].forEach(f => d.push(f));
    expect(d.hit).toBe(false);
  });
  it('ChordCheck reports hit, wait and miss', () => {
    const c = new ChordCheck('0-0', 'Em', 1.4);
    const em = frames('Em', [0.3, 0.35, 0.4]);
    expect(c.update(em[0], 1.0).state).toBe('waiting');
    expect(c.update(em[1], 1.05).state).toBe('waiting');
    expect(c.update(em[2], 1.1).state).toBe('hit');
    const m = new ChordCheck('0-1', 'Em', 1.4);
    const am = frames('Am', [0.3]);
    expect(m.update(am[0], 1.0).state).toBe('waiting');
    expect(m.update(am[0], 1.5)).toEqual({state: 'miss', heard: 'Am'});
  });
  it('LoudnessGate sits above the room and never below its floor', () => {
    const g = new LoudnessGate();
    expect(g.value).toBe(0.0008);
    g.learn(0.01); g.learn(0.004);
    expect(g.value).toBeCloseTo(0.025);
  });
});
