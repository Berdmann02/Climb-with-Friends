import {MathUtils,Vector3} from 'three';
import type {Character} from '../player/Character';
export type LandingSize='low'|'medium'|'high';

/** Gravity-driven drops and controlled mat recovery; never reattaches the climber. */
export class BoulderController {
  private state:'idle'|'drop'|'landing'='idle';
  private velocity=0;
  private elapsed=0;
  private duration=.6;
  private size:LandingSize='low';
  private retreat=new Vector3(0,0,1);
  get active(){return this.state!=='idle';}
  reset(){this.state='idle';this.velocity=0;this.elapsed=0;}
  begin(character:Character,normal=new Vector3(0,0,1)){
    const height=Math.max(0,character.group.position.y);
    this.size=height<.8?'low':height<1.9?'medium':'high';
    this.duration=this.size==='low'?.6:this.size==='medium'?1.25:1.9;
    this.retreat.copy(normal).setY(0).normalize();
    this.state='drop';this.velocity=0;this.elapsed=0;
    character.setClimbingVisual(null);character.group.rotation.set(0,0,0);
  }
  update(dt:number,time:number,character:Character,onGround:()=>void){
    if(this.state==='idle')return;
    if(this.state==='drop'){
      this.velocity+=9.81*dt;
      character.group.position.y=Math.max(0,character.group.position.y-this.velocity*dt);
      character.group.position.addScaledVector(this.retreat,dt*.58);
      character.update(dt,time,'fall');
      if(character.group.position.y===0){this.state='landing';this.elapsed=0;}
    }else{
      this.elapsed+=dt;
      const t=MathUtils.clamp(this.elapsed/this.duration,0,1);
      character.setLanding(this.size,t);
      character.group.position.addScaledVector(this.retreat,dt*(this.size==='low'?.08:.32)*(1-t));
      character.update(dt,time,'land');
      if(t===1){this.state='idle';character.update(dt,time,'idle');onGround();}
    }
  }
}
