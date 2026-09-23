import {Box3, MathUtils, Vector3} from 'three';
import type {Character} from './Character';
import type {Input} from '../core/Input';
export class PlayerController {
  readonly velocity=new Vector3();
  grounded=true;
  constructor(private character:Character, private input:Input){}
  update(dt:number,time:number,yaw:number,colliders:Box3[],outdoor:boolean){
    const side=Number(this.input.down('KeyD'))-Number(this.input.down('KeyA'));
    const forward=Number(this.input.down('KeyW'))-Number(this.input.down('KeyS'));
    const jogging=this.input.down('ShiftLeft');
    const direction=new Vector3(side,0,-forward).normalize().applyAxisAngle(new Vector3(0,1,0),yaw);
    const speed=jogging?4:2.5;
    this.velocity.lerp(direction.multiplyScalar(speed),1-Math.exp(-dt*10));
    const p=this.character.group.position;
    for(const axis of ['x','z'] as const){
      const next=p.clone(); next[axis]+=this.velocity[axis]*dt;
      const bounds=new Box3(new Vector3(next.x-.27,next.y+.05,next.z-.27),new Vector3(next.x+.27,next.y+1.58,next.z+.27));
      if(!colliders.some(box=>bounds.intersectsBox(box)))p[axis]=next[axis];
      else this.velocity[axis]=0;
    }
    p.x=MathUtils.clamp(p.x,outdoor?-16:-11.4,outdoor?16:11.4);
    p.z=MathUtils.clamp(p.z,.6,outdoor?22:18.8);
    p.y=0; this.grounded=true;
    if(this.velocity.lengthSq()>.025){
      const target=Math.atan2(-this.velocity.x,-this.velocity.z);
      const delta=MathUtils.euclideanModulo(target-this.character.group.rotation.y+Math.PI,Math.PI*2)-Math.PI;
      this.character.group.rotation.y+=delta*(1-Math.exp(-dt*12));
    }
    this.character.update(dt,time,this.velocity.length()>.2?(jogging?'jog':'walk'):'idle',this.velocity.length());
  }
  reset(){this.velocity.set(0,0,0);}
}
