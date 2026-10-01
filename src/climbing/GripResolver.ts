import {Box3, Matrix3, Matrix4, Mesh, Triangle, Vector3} from 'three';
import type {World, RouteData} from '../core/contracts';
import type {HoldRenderer} from '../routes/HoldRenderer';
import type {ContactRequest,LimbId} from './types';
import {isHand} from './types';

/** Small physical overlap at the rendered palm/toe. Cursor position is irrelevant. */
export class GripResolver {
  contactRadius=.07;
  resolve(limb:LimbId,actual:Vector3,world:World,route:RouteData,holds:HoldRenderer):ContactRequest|null {
    let best:ContactRequest|null=null,distance=this.contactRadius;
    for(const hold of route.holds){
      if(isHand(limb)&&(hold.handAllowed===false||hold.type==='foothold'&&hold.handAllowed!==true))continue;
      if(!isHand(limb)&&hold.footAllowed===false)continue;
      const mesh=holds.meshes.get(hold.id);if(!mesh)continue;
      const hit=this.closest(actual,mesh,distance);if(hit){distance=hit.point.distanceTo(actual);best={...hit,hold,surfaceHit:true};}
    }
    if(best)return best;
    if(world.rockSurface){
      const rock=world.rockSurface.nearby(actual,this.contactRadius);
      return rock?{point:rock.point,normal:rock.normal,rock,surfaceHit:true}:null;
    }
    for(const object of world.cameraObstacles){
      const hit=this.closest(actual,object,distance);if(!hit)continue;
      const w=world.wall;
      if(hit.point.x<w.minX||hit.point.x>w.maxX||hit.point.y<w.minY||hit.point.y>w.maxY)continue;
      const wallNormal=new Vector3(0,-Math.sin(w.angle??0),Math.cos(w.angle??0));
      if(Math.abs(hit.point.clone().sub(new Vector3(0,0,w.z)).dot(wallNormal))>.25||hit.normal.dot(wallNormal)<.45)continue;
      distance=hit.point.distanceTo(actual);best={...hit,surfaceHit:true};
    }
    return best;
  }

  private closest(point:Vector3,object:import('three').Object3D,radius:number):{point:Vector3;normal:Vector3}|null {
    object.updateWorldMatrix(true,true);
    if(new Box3().setFromObject(object).distanceToPoint(point)>radius)return null;
    let best:{point:Vector3;normal:Vector3}|null=null,bestDistance=radius;
    object.traverse(child=>{
      if(!(child instanceof Mesh)||child.userData.nonContact)return;
      const geometry=child.geometry;
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      if(geometry.boundingBox!.clone().applyMatrix4(child.matrixWorld).distanceToPoint(point)>bestDistance)return;
      const local=point.clone().applyMatrix4(new Matrix4().copy(child.matrixWorld).invert());
      const positions=geometry.getAttribute('position'),index=geometry.getIndex();
      const tri=new Triangle(),nearest=new Vector3(),normalMatrix=new Matrix3().getNormalMatrix(child.matrixWorld);
      const count=index?index.count:positions.count;
      for(let i=0;i<count;i+=3){
        tri.a.fromBufferAttribute(positions,index?index.getX(i):i);
        tri.b.fromBufferAttribute(positions,index?index.getX(i+1):i+1);
        tri.c.fromBufferAttribute(positions,index?index.getX(i+2):i+2);
        tri.closestPointToPoint(local,nearest);const worldPoint=nearest.clone().applyMatrix4(child.matrixWorld),d=worldPoint.distanceTo(point);
        if(d<bestDistance){bestDistance=d;best={point:worldPoint,normal:tri.getNormal(new Vector3()).applyMatrix3(normalMatrix).normalize()};}
      }
    });
    return best;
  }
}
