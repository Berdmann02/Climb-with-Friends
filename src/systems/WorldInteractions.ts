import {MathUtils,Vector3,type Object3D} from 'three';
import type {WallSpec,World} from '../core/contracts';

export type WorldInteraction={kind:'desk'}|{kind:'wall';wall:WallSpec};

/** Proximity and facing gate world actions; there are no globally available wall shortcuts. */
export function nearbyInteraction(player:Object3D,world:World):WorldInteraction|null {
  const p=player.position;
  if(world.frontDesk&&p.distanceTo(world.frontDesk)<1.65)return {kind:'desk'};
  const facing=new Vector3(0,0,-1).applyQuaternion(player.quaternion);
  const walls=world.walls??[world.wall];
  for(const wall of walls){
    const angle=wall.angle??0,normal=new Vector3(0,-Math.sin(angle),Math.cos(angle));
    const point=new Vector3(MathUtils.clamp(p.x,wall.minX,wall.maxX),p.y,wall.z);
    const distance=p.clone().sub(point).dot(normal);
    if(p.x<wall.minX-.15||p.x>wall.maxX+.15||distance<.15||distance>2.1)continue;
    if(facing.dot(normal)<-.3)return {kind:'wall',wall};
  }
  return null;
}
