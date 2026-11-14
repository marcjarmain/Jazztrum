import type {Segment} from '../library/chart';

// One thing to play. A long chord is cut into pieces of at most `maxLength` seconds so a held chord keeps earning.
export type Target = {id: string; chord: string; start: number; end: number; low: boolean};

export function makeTargets(segments: Segment[], maxLength = 4): Target[] {
  return segments.flatMap((segment, index) => {
    if (segment.chord === 'N') return [];
    const length = segment.end - segment.start;
    const pieces = Math.max(1, Math.ceil(length / maxLength - 1e-9));
    return Array.from({length: pieces}, (_, k) => ({
      id: `${index}-${k}`,
      chord: segment.chord,
      start: segment.start + k * length / pieces,
      end: segment.start + (k + 1) * length / pieces,
      low: segment.confidence < 0.3,
    }));
  });
}
