import {MathUtils,Object3D,PerspectiveCamera,Raycaster,Vector3} from 'three';
import type {Input} from './Input';
export type CameraMode='explore'|'climb'|'belay'|'editor'|'menu';
export class ThirdPersonCamera {
  yaw=0.22; pitch=.3; distance=7.8;
  private target=new Vector3(); private ray=new Raycaster();
  constructor(public camera:PerspectiveCamera,private input:Input){}
  reset(outdoor:boolean){this.yaw=outdoor?.2:.28;this.pitch=.28;this.distance=outdoor?8.8:8;}
  update(dt:number,mode:CameraMode,player:Vector3,climber:Vector3,obstacles:Object3D[],outdoor:boolean){
    if(mode!=='editor'&&mode!=='menu'){
      this.yaw-=this.input.deltaX*.004;
      this.pitch=MathUtils.clamp(this.pitch+this.input.deltaY*.003,-.35,1.15);
      this.distance=MathUtils.clamp(this.distance+this.input.zoom*.55,4.5,13);
    }
    let focus=player.clone().add(new Vector3(0,1.2,0));let desired=new Vector3();
    if(mode==='menu'){
      focus.set(outdoor?0:-1,outdoor?10:3.1,0);
      desired.set(outdoor?15:11,outdoor?8.5:6.5,outdoor?27:18);
    }else if(mode==='editor'){
      focus.set(1,4.1,0);desired.set(1,4.1,12.5);
    }else if(mode==='belay'){
      // Eye stays behind the belayer; looking up never orbits in front of the rope handler.
      const az=MathUtils.clamp(this.yaw,-.65,.65);
      const up=MathUtils.clamp(climber.y*.29+this.pitch*3,2,9);
      focus=player.clone().add(new Vector3(0,up,-2.8));
      desired=player.clone().add(new Vector3(Math.sin(az)*4,1.65,Math.cos(az)*4.7));
    }else{
      const distance=mode==='climb'?this.distance*.85:this.distance;
      if(mode==='climb')focus.y+=.7;
      desired.copy(focus).add(new Vector3(Math.sin(this.yaw)*Math.cos(this.pitch)*distance,Math.sin(this.pitch)*distance,Math.cos(this.yaw)*Math.cos(this.pitch)*distance));
      const delta=desired.clone().sub(focus);this.ray.set(focus,delta.clone().normalize());this.ray.far=delta.length();
      const hit=this.ray.intersectObjects(obstacles,true).find(h=>h.distance>.15);
      if(hit)desired.copy(focus).addScaledVector(delta.normalize(),Math.max(.65,hit.distance-.28));
      desired.y=Math.max(.45,desired.y);
    }
    const alpha=1-Math.exp(-dt*(mode==='editor'?6:5));
    this.camera.position.lerp(desired,alpha);this.target.lerp(focus,alpha);this.camera.lookAt(this.target);
  }
  snap(){this.target.set(0,2,0);this.camera.position.set(9,6,17);}
}
