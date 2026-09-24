import {Matrix3,Plane,Raycaster,Vector2,Vector3,type PerspectiveCamera,type Object3D} from 'three';
import type {Input} from '../core/Input';
import type {RouteData,World} from '../core/contracts';
import type {HoldRenderer} from '../routes/HoldRenderer';
import type {ClimbingController} from './ClimbingController';
import type {ClimbSurface,ContactRequest,LimbId} from './types';

export const LIMB_KEYS:Readonly<Record<string,LimbId>>={KeyQ:'leftHand',KeyW:'rightHand',KeyA:'leftFoot',KeyS:'rightFoot'};
export const LIMB_LABELS:Record<LimbId,string>={leftHand:'Left hand',rightHand:'Right hand',leftFoot:'Left foot',rightFoot:'Right foot'};
export function surfaceForWorld(world:World):ClimbSurface {
  const angle=world.wall.angle??0;
  return {id:world.wall.id,origin:new Vector3(0,0,world.wall.z),normal:new Vector3(0,-Math.sin(angle),Math.cos(angle)),up:new Vector3(0,Math.cos(angle),Math.sin(angle)),angle,friction:world.wall.friction??(world.wall.id.startsWith('outdoor')?.82:.66),material:world.wall.material??(world.wall.id.startsWith('outdoor')?'rock':'plywood'),bounds:world.wall};
}

/** Pointer input owns the desired target; character/body solvers own the physical result. */
export class ClimbInput {
  private ray=new Raycaster();
  private pointer:Vector2|null=null;
  private orbiting=false;
  constructor(private canvas:HTMLCanvasElement,private camera:PerspectiveCamera,private input:Input){
    canvas.addEventListener?.('pointermove',event=>{
      if(this.orbiting)return;
      this.pointer=new Vector2(event.clientX,event.clientY);
    });
    canvas.addEventListener?.('pointerdown',event=>{if(event.button===2)this.orbiting=true;});
    if(typeof window!=='undefined'){
      window.addEventListener('pointerup',event=>{if(event.button===2)this.orbiting=false;});
      window.addEventListener('blur',()=>{this.orbiting=false;this.pointer=null;});
    }
  }
  update(climb:ClimbingController,world?:World,route?:RouteData,holds?:HoldRenderer){
    for(const [key,limb] of Object.entries(LIMB_KEYS))if(this.input.consume(key))climb.selectLimb(limb);
    if(this.input.consume('Backspace'))climb.releaseSelected();
    if(climb.controlling&&world&&route&&holds&&this.pointer&&!this.orbiting){
      climb.aim(this.project(this.pointer.x,this.pointer.y,world,route,holds,true));
    }
  }
  hit(event:MouseEvent,world:World,route:RouteData,holds:HoldRenderer):ContactRequest|null{
    return this.project(event.clientX,event.clientY,world,route,holds,false);
  }
  private project(x:number,y:number,world:World,route:RouteData,holds:HoldRenderer,allowWallProjection:boolean):ContactRequest|null{
    const rect=this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),this.camera);
    const surface=surfaceForWorld(world);
    const hits=this.ray.intersectObjects([holds.group,...world.cameraObstacles],true);
    const first=hits.find(hit=>!hit.object.userData.nonContact);
    if(first){
      let object:Object3D|null=first.object;
      while(object&&!object.userData.holdId&&object!==holds.group)object=object.parent;
      const id=object?.userData.holdId;
      const normal=first.face?first.face.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(first.object.matrixWorld)).normalize():surface.normal.clone();
      if(normal.dot(this.ray.ray.direction)>0)normal.negate();
      if(id){const hold=route.holds.find(h=>h.id===id);if(hold)return {point:first.point.clone(),normal,hold,surfaceHit:true};}
      const wall=world.wall;
      const onWall=first.point.x>=wall.minX&&first.point.x<=wall.maxX&&first.point.y>=wall.minY&&first.point.y<=wall.maxY
        &&Math.abs(first.point.clone().sub(surface.origin).dot(surface.normal))<.25&&normal.dot(surface.normal)>.45;
      if(onWall)return {point:first.point.clone(),normal,surfaceHit:true};
      // An actual foreground object blocks grabbing anything behind it.
      if(!allowWallProjection)return null;
    }
    if(!allowWallProjection)return null;
    const plane=new Plane().setFromNormalAndCoplanarPoint(surface.normal,surface.origin);
    const point=this.ray.ray.intersectPlane(plane,new Vector3());
    return point?{point,normal:surface.normal,surfaceHit:false}:null;
  }
}
