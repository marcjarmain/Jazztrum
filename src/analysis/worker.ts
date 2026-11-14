import {analyseSamples} from '../dsp/segment';

// Runs the slow chord analysis away from the screen so the page stays responsive.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{samples: Float32Array; sampleRate: number}>) => void) | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = e => {
  try {
    const {samples, sampleRate} = e.data;
    const result = analyseSamples(samples, sampleRate, fraction => scope.postMessage({type: 'progress', fraction}));
    scope.postMessage({type: 'done', ...result});
  } catch (cause) {
    scope.postMessage({type: 'error', message: cause instanceof Error ? cause.message : 'Analysis failed.'});
  }
};
