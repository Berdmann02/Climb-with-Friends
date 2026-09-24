import {Quaternion,Vector3} from 'three';
import type {HoldData,PoseTargets,WallSpec} from '../core/contracts';
export type LimbId=keyof PoseTargets;
export const LIMBS:LimbId[]=['leftHand','rightHand','leftFoot','rightFoot'];
export const isHand=(limb:LimbId)=>limb==='leftHand'||limb==='rightHand';
export type GripType='jug'|'crimp'|'sloper'|'pinch'|'foothold'|'sidepull'|'undercling'|'pocket'|'edge';
export type ContactKind='hold'|'smear'|'flag'|'free';
export type LimbState='attached'|'loaded'|'light'|'moving'|'slipping'|'free';
export type ClimbPhase='idle'|'selected'|'prepare'|'release'|'moving'|'contact'|'settling'|'falling';
export type StabilityLevel='stable'|'strained'|'unstable'|'critical'|'fall';
export interface ClimbSurface {
  id:string; origin:Vector3; normal:Vector3; up:Vector3;
  angle:number; // radians: negative slab, positive overhang
  friction:number; material:'plywood'|'rock'; bounds:WallSpec;
}
export interface LimbContact {
  limb:LimbId; kind:ContactKind; state:LimbState;
  point:Vector3; normal:Vector3; orientation:Quaternion;
  holdId:string|null; grip:GripType; direction:Vector3;
  strength:number; friction:number; quality:number; load:number;
  rotation:number; planted:boolean;
}
export interface ContactRequest { point:Vector3; normal:Vector3; hold?:HoldData; surfaceHit?:boolean; }
export interface BodyPose {
  root:Vector3; pelvis:Vector3; centerOfMass:Vector3;
  torsoRotation:Vector3; hipRotation:Vector3;
  shoulders:{left:Vector3;right:Vector3}; hips:{left:Vector3;right:Vector3};
  strain:number; feasible:boolean;
}
export interface StabilityResult {
  score:number; level:StabilityLevel; handStrain:number; imbalance:number;
  support:number; flagContribution:number; weakest:LimbId|null;
  qualities:Record<LimbId,number>; loads:Record<LimbId,number>;
}
export interface ClimbingVisual {
  torsoRotation:Vector3; hipRotation:Vector3; orientations:Record<LimbId,Quaternion>;
  contacts:Record<LimbId,LimbContact>; tension:number; tremble:number;
  lookTarget:Vector3|null;
}
export const cloneContact=(c:LimbContact):LimbContact=>({...c,point:c.point.clone(),normal:c.normal.clone(),orientation:c.orientation.clone(),direction:c.direction.clone()});
