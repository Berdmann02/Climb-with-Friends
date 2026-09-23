import {Vector3} from 'three';
import {BelayController,type BelayAction} from './BelayController';
import {RopeController} from '../rope/RopeController';
import {Quickdraw} from '../climbing/Quickdraw';
import type {ClimbingController} from '../climbing/ClimbingController';
import type {Character} from '../player/Character';
import type {GameAudio} from '../core/Audio';
export class OutdoorSession {
  readonly belay=new BelayController();readonly rope=new RopeController();readonly draws:Quickdraw[];
  suspended=false;role:'climber'|'belayer'='climber';
  ropePoints=0;
  private partnerTimer=0;private reacted=false;private baseBelayer:Vector3;
  constructor(private climber:Character,private partner:Character,private climb:ClimbingController,points:Vector3[],belayPosition:Vector3,private audio:GameAudio,private notify:(message:string)=>void){
    this.draws=points.map(p=>new Quickdraw(p));this.baseBelayer=belayPosition.clone();partner.group.position.copy(belayPosition);
  }
  get clipped(){return this.draws.filter(d=>d.clipped).length;}
  get nextDraw(){return this.draws.find(d=>!d.clipped);}
  get canClip(){const next=this.nextDraw;if(!next||!this.climb.active)return false;const root=this.climber.group.position;return [-.202,.202].some(x=>root.clone().add(new Vector3(x,1.245,0)).distanceTo(next.ropePoint())<.76);}
  clip(quiet=false){if(!this.canClip){if(!quiet)this.notify('Move a little closer to the next quickdraw.');return false;}const draw=this.nextDraw!;draw.clip();this.climber.playClip(draw.ropePoint());this.audio.play('clip');if(!quiet)this.notify(`Clipped. ${this.clipped} of ${this.draws.length} protection points.`);return true;}
  fall(){
    if(!this.climb.active)return;
    if(this.clipped===0){this.notify('Clip the first quickdraw before testing a catch.');return;}
    const height=this.climber.group.position.y+.85;
    this.climb.stop();this.suspended=true;this.reacted=false;
    this.belay.beginFall(height,this.draws[this.clipped-1].position.y);this.notify('Falling — your partner has the rope.');
  }
  lower(){if(!this.climb.active&&!this.suspended)return;this.climb.stop();this.suspended=true;this.belay.setAction('lower');this.notify('Lowering gently. Hold the brake strand.');}
  setAction(action:BelayAction){if(action==='lower')this.lower();else this.belay.setAction(action);}
  reset(){this.climb.stop();this.belay.reset();this.suspended=false;this.role='climber';this.reacted=false;this.partnerTimer=0;for(const d of this.draws)d.reset();this.partner.group.position.copy(this.baseBelayer);}
  update(dt:number,time:number){
    const h=this.climber.group.position.y+.85;
    if(this.role==='climber'&&!this.suspended){this.belay.setAction(this.belay.slack<.6?'feed':'neutral');}
    this.belay.update(dt,h);
    if(this.suspended&&this.belay.fallHeight!==null){
      this.climber.group.position.y=Math.max(0,this.belay.fallHeight-.85);
      this.climber.group.position.z=.7+Math.sin(time*2.5)*.10*this.belay.tension;
      this.climber.update(dt,time,'fall');
      if(this.belay.caught&&!this.reacted){this.reacted=true;this.audio.play('catch');this.notify('Caught. Take a breath, then press L to lower.');}
      if(this.climber.group.position.y<=.005&&this.belay.state!=='falling'&&this.belay.action==='lower'){
        this.suspended=false;this.belay.reset();this.climber.group.position.z=1.5;this.notify('Back on the ground. Nicely done.');
      }
    }
    if(this.role==='belayer'&&this.climb.active&&!this.climb.finished){
      this.partnerTimer+=dt;
      if(this.canClip)this.clip(true);
      if(this.partnerTimer>1.55&&this.belay.action!=='lock'&&this.belay.slack>.18&&!this.climber.isClipping){this.climb.move('up');this.partnerTimer=0;}
    }
    this.partner.group.position.copy(this.baseBelayer);
    if(this.belay.tension>.7){this.partner.group.position.z-=.18*this.belay.tension;this.partner.group.position.y=.055*this.belay.tension;}
    this.partner.setBelayAction(this.belay.action,this.belay.tension);this.partner.update(dt,time,'belay');
    const device=this.partner.harnessPosition().add(new Vector3(0,.09,-.10));
    const points=[device,...this.draws.filter(d=>d.clipped).map(d=>d.ropePoint()),this.climber.harnessPosition()];
    this.ropePoints=points.length;this.rope.update(dt,points,this.belay.slack,this.belay.tension,time);
    this.rope.updateBrake([device,this.partner.group.localToWorld(new Vector3(.15,.72,-.30)),new Vector3(this.baseBelayer.x+.55,.08,this.baseBelayer.z+.38),new Vector3(2.4,.05,6.25)],time,.18);
  }
}
