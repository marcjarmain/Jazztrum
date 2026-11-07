// All instruments, targets and the screen share the same beat clock.
export function beatLength(bpm: number, speed: number) { return 60 / (bpm * speed); }
export function eventTime(start: number, beat: number, bpm: number, speed: number) {
  return start + beat * beatLength(bpm, speed);
}
// Ask the audio device which part of the sound is reaching the speakers now.
export function audibleTime(ctx: AudioContext) {
  if (typeof ctx.getOutputTimestamp === 'function') {
    const stamp = ctx.getOutputTimestamp();
    if (stamp.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.contextTime > 0 && stamp.performanceTime > 0) {
      return Math.min(ctx.currentTime, stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000);
    }
  }
  return Math.max(0, ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0));
}

