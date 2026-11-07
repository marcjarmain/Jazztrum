export const windows = { nailed: 0.12, close: 0.2 };
export type Target = {time:number; id:string};
// A positive offset means your strum arrived late, so move it earlier.
export function judge(time:number, targets:Target[], used:Set<string>, offsetMs:number) {
  const corrected = time - offsetMs / 1000;
  const nearest = targets.filter(t => !used.has(t.id)).sort((a,b) => Math.abs(a.time-corrected)-Math.abs(b.time-corrected))[0];
  if (!nearest || Math.abs(nearest.time-corrected) > windows.close) return null;
  return {id:nearest.id, result: Math.abs(nearest.time-corrected) <= windows.nailed ? 'Nailed!' : 'Close'};
}
