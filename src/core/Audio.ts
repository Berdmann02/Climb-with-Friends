export class GameAudio {
  private context:AudioContext|null=null;
  muted=false;
  unlock(){if(!this.context)this.context=new AudioContext();if(this.context.state==='suspended')void this.context.resume();}
  play(kind:'step'|'hold'|'clip'|'save'|'catch'){
    if(this.muted||!this.context)return;
    const ctx=this.context,t=ctx.currentTime;
    const osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);
    osc.type=kind==='clip'?'triangle':'sine';
    const freq=kind==='clip'?1800:kind==='save'?620:kind==='hold'?230:kind==='catch'?85:110;
    osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(freq*.48,t+.13);
    gain.gain.setValueAtTime(kind==='step'?.018:.055,t);gain.gain.exponentialRampToValueAtTime(.001,t+.2);
    osc.start(t);osc.stop(t+.21);
  }
}
