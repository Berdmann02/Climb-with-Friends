import type * as THREE from 'three';
export type LocationId = 'gym' | 'outdoor';
export type RouteType = 'BOULDER' | 'TOP_ROPE' | 'LEAD';
export type HoldType = 'jug' | 'crimp' | 'sloper' | 'pinch' | 'foothold';
export type GripStyle = 'jug' | 'crimp' | 'sloper' | 'pinch' | 'foothold' | 'sidepull' | 'undercling' | 'pocket' | 'edge';
export interface HoldData { id:string; type:HoldType; asset:string; position:[number,number,number]; rotation:number; scale:number; color:string; start:boolean; finish:boolean; wallId:string; grip?:GripStyle; gripPoint?:[number,number,number]; gripNormal?:[number,number,number]; gripDirection?:[number,number,number]; gripStrength?:number; friction?:number; handAllowed?:boolean; footAllowed?:boolean; }
// Missing routeType is accepted only for version-one legacy data; RouteStore normalizes it.
export interface RouteData { version:1; id:string; name:string; creator:string; color:string; holds:HoldData[]; wallId:string; routeType?:RouteType; grade:string; createdAt:string; }
export interface WallSpec { id:string; minX:number; maxX:number; minY:number; maxY:number; z:number; routeType?:RouteType; angle?:number; friction?:number; material?:'plywood'|'rock'; topAnchor?:[number,number,number]; }
export interface World { group:THREE.Group; colliders:THREE.Box3[]; cameraObstacles:THREE.Object3D[]; wall:WallSpec; walls?:WallSpec[]; frontDesk?:THREE.Vector3; spawn:THREE.Vector3; belayPosition:THREE.Vector3; protection:THREE.Vector3[]; update?:(dt:number,time:number)=>void; }
export interface PoseTargets { leftHand:THREE.Vector3; rightHand:THREE.Vector3; leftFoot:THREE.Vector3; rightFoot:THREE.Vector3; }
