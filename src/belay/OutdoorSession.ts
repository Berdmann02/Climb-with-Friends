import {MathUtils,Vector3} from 'three';
import {BelayController,type BelayAction} from './BelayController';
import {RopeController} from '../rope/RopeController';
import {Quickdraw} from '../climbing/Quickdraw';
import type {ClimbingController} from '../climbing/ClimbingController';
import type {Character} from '../player/Character';
import type {GameAudio} from '../core/Audio';

/** Shared roped session: top anchor indoors, progressive lead protection outdoors. */
export class OutdoorSession {
  readonly belay=new BelayController();readonly rope=new RopeController();readonly draws:Quickdraw[];
  suspended=false;role:'climber'|'belayer'='climber';
  ropePoints=0;
  private reacted=false;private baseBelayer:Vector3;
  private reengaging=false;
  private entryTime=0;
  private entryFrom=new Vector3();
  private entryTo=new Vector3();
  private wallZ=0;
  private grounded=false;
  private terminalAnchor:Vector3|null=null;
  private gearMode=false;private aligning=false;
  private defaultClimber:Character;private defaultBelayer:Character;private defaultClimb:ClimbingController;
  private wallSample:((point:Vector3)=>import('../climbing/types').RockSample|null)|undefined;
  private swingVelocity=new Vector3();private fallStartHeight=0;
  private idleOffset=new Vector3();
  constructor(private climber:Character,private partner:Character,private climb:ClimbingController,points:Vector3[],belayPosition:Vector3,private audio:GameAudio,private notify:(message:string)=>void,private topAnchor:Vector3|null=null){
    this.defaultClimber=climber;this.defaultBelayer=partner;this.defaultClimb=climb;
    this.draws=(topAnchor?[]:points).map(p=>new Quickdraw(p));this.baseBelayer=belayPosition.clone();partner.group.position.copy(belayPosition);
  }
  get fromGear(){return this.gearMode;}
  get climberCharacter(){return this.climber;}
  get belayerCharacter(){return this.partner;}
  startFromGear(climber:Character,belayer:Character,climb:ClimbingController):void {
    this.climber=climber;this.partner=belayer;this.climb=climb;this.gearMode=true;this.aligning=true;
    this.role='belayer';this.belay.reset();this.suspended=false;this.reacted=false;
  }
  setWallDepth(z:number){this.wallZ=z;}
  setRockSurface(sample:((point:Vector3)=>import('../climbing/types').RockSample|null)|undefined){this.wallSample=sample;}
  get clipped(){return this.draws.filter(d=>d.clipped).length;}
  get nextDraw(){return this.draws.find(d=>!d.clipped);}
  get hanging(){return this.suspended&&!this.reengaging&&this.belay.caught&&this.belay.state==='caught';}
  get canClip(){const next=this.nextDraw;if(this.topAnchor||!next||!this.climb.active||this.climber.isClipping||this.climb.finished)return false;const root=this.climber.group.position;return [-.202,.202].some(x=>root.clone().add(new Vector3(x,1.245,0)).distanceTo(next.ropePoint())<.76);}
  clip(_quiet=false){if(!this.canClip)return false;const draw=this.nextDraw!;draw.clip();this.climber.playClip(draw.ropePoint());this.audio.play('clip');return true;}
  fall(forced=false){
    if((!this.climb.active&&!forced)||this.suspended)return;
    const height=this.climber.group.position.y+.85;
    this.fallStartHeight=height;this.swingVelocity.set(0,0,this.topAnchor?.12:.25);
    this.climb.stop();this.suspended=true;this.reacted=false;this.reengaging=false;this.grounded=false;
    this.belay.beginFall(height,this.topAnchor?.y??this.terminalAnchor?.y??this.draws[this.clipped-1]?.position.y??0,!!(this.topAnchor||this.terminalAnchor));
  }
  continueClimbing(){
    if(!this.hanging)return;
    this.role=this.gearMode?'belayer':'climber';
    this.reengaging=true;this.entryTime=0;this.entryFrom.copy(this.climber.group.position);
    this.entryTo.copy(this.entryFrom);this.entryTo.z=this.wallZ+(this.topAnchor?.52:.85);
    const rock=this.wallSample?.(this.entryTo.clone().add(new Vector3(0,1,0)));if(rock)this.entryTo.z=rock.point.z+.4;
  }
  lower(){
    if(!this.climb.active&&!this.suspended)return;
    if(!this.topAnchor&&!this.terminalAnchor&&!this.clipped){this.fall();return;}
    this.reengaging=false;this.swingVelocity.set(0,0,0);this.climb.stop();this.suspended=true;this.grounded=false;this.belay.setAction('lower');
  }
  /** Matching the terminal feature includes transferring to the route's lower-off anchor. */
  finishLower(anchor?:Vector3){if(!this.topAnchor&&anchor)this.terminalAnchor=anchor.clone();this.lower();}
  setAction(action:BelayAction){if(action==='lower')this.lower();else this.belay.setAction(action);}
  reset(){
    this.idleOffset.set(this.gearMode?.7:0,0,this.gearMode?.35:0);this.swingVelocity.set(0,0,0);
    this.climb.stop();this.climber=this.defaultClimber;this.partner=this.defaultBelayer;this.climb=this.defaultClimb;this.gearMode=false;this.aligning=false;
    this.climb.stop();this.belay.reset();this.suspended=false;this.reengaging=false;this.grounded=false;this.terminalAnchor=null;this.role='climber';this.reacted=false;
    for(const d of this.draws)d.reset();this.partner.group.position.copy(this.baseBelayer).add(this.idleOffset);
  }
  takeGrounded(){const result=this.grounded;this.grounded=false;return result;}
  update(dt:number,time:number){
    const h=this.climber.group.position.y+.85;
    if(this.role==='climber'&&!this.suspended){this.belay.setAction(this.climb.ropeSupported?'lock':this.topAnchor?(this.belay.slack>.3?'take':'neutral'):this.belay.slack<.6?'feed':'neutral');}
    this.belay.update(dt,h);
    if(this.reengaging){
      this.entryTime+=dt;const t=MathUtils.smoothstep(this.entryTime,0,.5);
      this.climber.group.position.lerpVectors(this.entryFrom,this.entryTo,t);this.climber.update(dt,time,'hang');
      if(t===1){this.reengaging=false;this.suspended=false;this.belay.resumeClimbing();this.climb.resumeSupported(this.climber.group.position.clone());}
    }else if(this.suspended&&this.belay.fallHeight!==null){
      this.climber.group.position.y=Math.max(0,this.belay.fallHeight-.85);
      const rock=this.wallSample?.(this.climber.group.position.clone().add(new Vector3(0,1,0)));
      const away=Math.max(this.wallZ+(this.topAnchor?.72:1.0),(rock?.point.z??-Infinity)+.6);
      const protection=this.topAnchor??this.terminalAnchor??this.draws[this.clipped-1]?.position;
      if(this.belay.caught||this.belay.state==='lowering'){
        if(this.belay.caught&&!this.reacted)this.swingVelocity.z=Math.min(.95,.2+Math.max(0,this.fallStartHeight-this.belay.fallHeight)*.12);
        const span=Math.max(1,Math.abs((protection?.y??0)-this.belay.fallHeight));
        const omega=9.81/span;
        this.swingVelocity.x+=((protection?.x??this.climber.group.position.x)-this.climber.group.position.x)*omega*dt;
        this.swingVelocity.z+=(away-this.climber.group.position.z)*omega*dt;
        this.swingVelocity.multiplyScalar(Math.exp(-dt*1.8));
      }
      this.climber.group.position.x+=this.swingVelocity.x*dt;this.climber.group.position.z+=this.swingVelocity.z*dt;
      if(rock)this.climber.group.position.z=Math.max(this.climber.group.position.z,rock.point.z+.3);
      this.climber.update(dt,time,this.belay.state==='falling'?'fall':'hang');
      if(this.belay.caught&&!this.reacted){this.reacted=true;this.audio.play('catch');}
      if(this.climber.group.position.y<=.005&&this.belay.state!=='falling'){
        this.suspended=false;this.belay.reset();this.climber.group.position.y=0;this.grounded=true;
        this.climber.group.rotation.set(0,0,0);this.climber.update(dt,time,'idle');
      }
    }
    if(this.aligning){
      const delta=this.baseBelayer.clone().sub(this.partner.group.position),distance=delta.length();
      this.partner.group.position.addScaledVector(delta,distance>.001?Math.min(1,dt*1.6/distance):1);
      this.partner.group.rotation.y=MathUtils.lerp(this.partner.group.rotation.y,0,1-Math.exp(-dt*7));
      if(distance<.04)this.aligning=false;
    }else {
      this.partner.group.position.copy(this.baseBelayer);
      if(!this.climb.active&&!this.suspended&&!this.gearMode)this.partner.group.position.add(this.idleOffset);
      if(this.belay.tension>.7){this.partner.group.position.z-=.18*this.belay.tension;this.partner.group.position.y=.055*this.belay.tension;}
    }
    this.partner.setBelayAction(this.belay.action,this.belay.tension);this.partner.update(dt,time,this.aligning?'walk':this.climb.active||this.suspended?'belay':'idle',this.aligning?1.4:0);
    if(!this.aligning&&this.gearMode)this.partner.group.rotation.y=0;
    const device=this.partner.harnessPosition().add(new Vector3(0,.09,-.10));
    const points=[device,...(this.topAnchor?[this.topAnchor]:this.draws.filter(d=>d.clipped).map(d=>d.ropePoint())),...(this.terminalAnchor?[this.terminalAnchor]:[]),this.climber.harnessPosition()];
    this.rope.setView(this.role==='climber'&&(this.climb.active||this.suspended)?'climber':'full');
    this.rope.group.visible=this.climb.active||this.suspended;this.ropePoints=points.length;this.rope.update(dt,points,this.belay.slack,this.belay.tension,time);
    this.rope.updateBrake([device,this.partner.group.localToWorld(new Vector3(.15,.72,-.30)),new Vector3(this.baseBelayer.x+.55,.08,this.baseBelayer.z+.38)],time,.18);
  }
}
