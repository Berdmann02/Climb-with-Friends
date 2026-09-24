import {describe,expect,it} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,PerspectiveCamera,Vector3} from 'three';
import {ClimbInput,LIMB_KEYS} from '../src/climbing/ClimbInput';
import {HoldRenderer} from '../src/routes/HoldRenderer';
import {createDefaultRoute} from '../src/routes/defaults';
import type {World} from '../src/core/contracts';
import type {Input} from '../src/core/Input';
import type {ClimbingController} from '../src/climbing/ClimbingController';

describe('manual click input',()=>{
  it('maps Q/W/A/S only to selection and never issues a movement request',()=>{
    const selected:string[]=[];
    const input={consume:(key:string)=>Object.keys(LIMB_KEYS).includes(key)} as Input;
    const controller={selectLimb:(limb:string)=>selected.push(limb),releaseSelected:()=>{throw Error('unexpected release');}} as unknown as ClimbingController;
    new ClimbInput({} as HTMLCanvasElement,new PerspectiveCamera(),input).update(controller);
    expect(selected).toEqual(['leftHand','rightHand','leftFoot','rightFoot']);
  });
  it('raycasts the actual hold or bare wall without snapping to an adjacent grip',()=>{
    const camera=new PerspectiveCamera(48,1,.1,100);camera.position.set(0,2,5);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
    const route=createDefaultRoute('gym');route.holds=route.holds.slice(0,1);
    const renderer=new HoldRenderer();renderer.setRoute(route);renderer.group.updateMatrixWorld(true);
    const wall=new Mesh(new BoxGeometry(10,8,.1),new MeshBasicMaterial());wall.position.set(0,4,-.05);wall.updateMatrixWorld(true);
    const world:World={group:new Group(),colliders:[],cameraObstacles:[wall],wall:{id:'gym-main',minX:-5,maxX:5,minY:.3,maxY:7.6,z:0},spawn:new Vector3(),belayPosition:new Vector3(),protection:[]};
    const canvas={getBoundingClientRect:()=>({left:0,top:0,width:1000,height:1000})} as HTMLCanvasElement;
    const input=new ClimbInput(canvas,camera,{} as Input);
    const eventAt=(point:Vector3)=>{const p=point.project(camera);return {clientX:(p.x+1)*500,clientY:(1-p.y)*500} as MouseEvent;};
    const hold=route.holds[0];
    const actual=input.hit(eventAt(new Vector3(...hold.position).add(new Vector3(0,0,.05))),world,route,renderer);
    expect(actual?.hold?.id).toBe(hold.id);
    const wallHit=input.hit(eventAt(new Vector3(.4,1.5,0)),world,route,renderer);
    expect(wallHit).not.toBeNull();expect(wallHit?.hold).toBeUndefined();expect(wallHit?.point.x).toBeCloseTo(.4);
    expect(input.hit(eventAt(new Vector3(8,1.5,0)),world,route,renderer)).toBeNull();
  });
});
