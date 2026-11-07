export function tone(ctx:AudioContext, time:number, frequency:number, duration=.15, volume=.1, output:AudioNode=ctx.destination) {const o=ctx.createOscillator(), g=ctx.createGain();o.frequency.value=frequency;o.type='sine';g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(g).connect(output);o.start(time);o.stop(time+duration);}
export function pluck(ctx:AudioContext,time:number,frequency:number,output:AudioNode=ctx.destination) {const length=Math.floor(ctx.sampleRate*1.2), buffer=ctx.createBuffer(1,length,ctx.sampleRate), data=buffer.getChannelData(0), period=Math.max(2,Math.round(ctx.sampleRate/frequency));for(let i=0;i<period;i++)data[i]=Math.random()*2-1;for(let i=period;i<length;i++)data[i]=(data[i-period]+data[i-period+1])*.497;const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffer;g.gain.value=.12;s.connect(g).connect(output);s.start(time);}

// A soft kick and snare give the song a steady beat.
export function drum(ctx: AudioContext, time: number, kind: 'kick' | 'snare', output: AudioNode) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(kind === 'kick' ? 0.14 : 0.045, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
  gain.connect(output);
  if (kind === 'kick') {
    const oscillator = ctx.createOscillator();
    oscillator.frequency.setValueAtTime(120, time);
    oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    oscillator.connect(gain); oscillator.start(time); oscillator.stop(time + 0.13);
  } else {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.13), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 1800;
    source.buffer = buffer; source.connect(filter).connect(gain); source.start(time);
  }
}
