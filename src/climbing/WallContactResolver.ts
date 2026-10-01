import {MathUtils, Quaternion, Vector3} from 'three';
import type {BodyPose,ClimbSurface,LimbContact} from './types';

/** Compression gives a palm some friction; outward pulling cannot become a jug. */
export function palmQuality(contact:LimbContact,body:BodyPose):number {
  const separation=Math.max(0,body.centerOfMass.clone().sub(contact.point).dot(contact.normal));
  const compression=MathUtils.clamp((.48-separation)/.36,0,1);
  const pulling=Math.max(0,contact.load-.12)+Math.max(0,separation-.35)*1.6;
  const wear=Math.max(0,1-(contact.slipDistance??0)/.09);
  return contact.strength*contact.friction*(.18+compression*.82)*Math.max(.04,1-pulling*1.8)*wear;
}

/** Friction overload integrates sliding distance, not a timed attachment expiry. */
export function slideWallContact(contact:LimbContact,body:BodyPose,surface:ClimbSurface,dt:number):boolean {
  if(contact.kind!=='palm'||!contact.planted)return false;
  const separation=Math.max(0,body.centerOfMass.clone().sub(contact.point).dot(contact.normal));
  const pressure=MathUtils.clamp((.48-separation)/.36,0,1);
  const capacity=contact.strength*contact.friction*(.1+pressure*.9);
  const shear=contact.load*(1+Math.max(0,Math.sin(surface.angle)))+Math.max(0,separation-.38)*.22;
  const overload=Math.max(0,shear-capacity);
  if(overload<=.015)return false;
  const tangent=surface.up.clone().negate().projectOnPlane(contact.normal).normalize();
  if(tangent.lengthSq()<.001)tangent.copy(new Vector3(0,-1,0));
  const distance=dt*overload*(.22+body.strain*.16);
  const next=contact.point.clone().addScaledVector(tangent,distance);
  if(surface.sampleRock){
    const rock=surface.sampleRock(next);if(!rock)return true;
    contact.orientation.premultiply(new Quaternion().setFromUnitVectors(contact.normal,rock.normal));
    contact.point.copy(rock.point).addScaledVector(rock.normal,.015);contact.normal.copy(rock.normal);
  }else contact.point.copy(next);
  contact.slipDistance=(contact.slipDistance??0)+distance;contact.state='slipping';
  return contact.slipDistance>.09||contact.point.y<surface.bounds.minY;
}
