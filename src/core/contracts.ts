import type * as THREE from 'three';
export type LocationId = 'gym' | 'outdoor';
export type HoldType = 'jug' | 'crimp' | 'sloper' | 'pinch' | 'foothold';
export interface HoldData { id:string; type:HoldType; asset:string; position:[number,number,number]; rotation:number; scale:number; color:string; start:boolean; finish:boolean; wallId:string; }
export interface RouteData { version:1; id:string; name:string; creator:string; color:string; holds:HoldData[]; wallId:string; grade:string; createdAt:string; }
export interface WallSpec { id:string; minX:number; maxX:number; minY:number; maxY:number; z:number; }
export interface World { group:THREE.Group; colliders:THREE.Box3[]; cameraObstacles:THREE.Object3D[]; wall:WallSpec; spawn:THREE.Vector3; belayPosition:THREE.Vector3; protection:THREE.Vector3[]; update?:(dt:number,time:number)=>void; }
export interface PoseTargets { leftHand:THREE.Vector3; rightHand:THREE.Vector3; leftFoot:THREE.Vector3; rightFoot:THREE.Vector3; }
