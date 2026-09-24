import { describe, expect, it } from 'vitest';
import { Euler, Mesh, Quaternion, Vector3 } from 'three';
import { Character } from '../src/player/Character';
import type { PoseTargets } from '../src/core/contracts';
import { LIMBS, type ClimbingVisual, type GripType, type LimbContact, type LimbId } from '../src/climbing/types';

function fixture(grip:GripType='jug',roll=0):{character:Character;targets:PoseTargets;visual:ClimbingVisual} {
  const character=new Character('#b46d52');
  character.group.position.set(.7,2.1,.4);character.group.rotation.y=.36;character.group.updateWorldMatrix(true,true);
  const local:PoseTargets={leftHand:new Vector3(-.28,1.46,-.34),rightHand:new Vector3(.3,1.40,-.32),leftFoot:new Vector3(-.20,.24,-.32),rightFoot:new Vector3(.22,.27,-.32)};
  const targets={} as PoseTargets,contacts={} as Record<LimbId,LimbContact>,orientations={} as Record<LimbId,Quaternion>;
  const rootRotation=character.group.getWorldQuaternion(new Quaternion());
  for(const id of LIMBS){
    targets[id]=character.group.localToWorld(local[id].clone());
    const hand=id.endsWith('Hand');
    orientations[id]=rootRotation.clone().multiply(new Quaternion().setFromEuler(new Euler(hand?.10:-.15,hand?.12:-.17,hand?roll:id==='leftFoot'?.12:-.13)));
    contacts[id]={limb:id,kind:'hold',state:'loaded',point:targets[id].clone(),normal:new Vector3(0,0,1).applyQuaternion(rootRotation),orientation:orientations[id].clone(),holdId:id,grip:hand?grip:'foothold',direction:new Vector3(0,1,0),strength:1,friction:.8,quality:1,load:.25,rotation:roll,planted:true};
  }
  const visual:ClimbingVisual={torsoRotation:new Vector3(.05,.18,-.05),hipRotation:new Vector3(-.04,-.21,.07),contacts,orientations,tension:.45,tremble:0,lookTarget:null};
  character.setClimbPose(targets);character.setClimbingVisual(visual);character.update(1/60,2,'climb');
  character.group.updateWorldMatrix(true,true);
  return {character,targets,visual};
}

function expectFixedBones(character:Character):void {
  for(const id of LIMBS){
    const upper=character.group.getObjectByName(`${id}:upperBone`) as Mesh;
    const lower=character.group.getObjectByName(`${id}:lowerBone`) as Mesh;
    expect(upper.scale.y).toBeCloseTo(id.endsWith('Hand')?.32:.38,7);
    expect(lower.scale.y).toBeCloseTo(id.endsWith('Hand')?.32:.42,7);
  }
}

describe('rendered contact orientation',()=>{
  it.each<GripType>(['jug','crimp','sloper','pinch','sidepull','undercling'])('keeps %s fingertips and shoe toes on their world contacts through rotated hips and shoulders',grip=>{
    const roll=grip==='undercling'?Math.PI:grip==='sidepull'?Math.PI/2:.31;
    const {character,targets,visual}=fixture(grip,roll);
    for(const id of LIMBS){
      expect(character.contactWorldPosition(id).distanceTo(targets[id])).toBeLessThan(1e-6);
      const tip=character.group.getObjectByName(id)!;
      const actual=tip.getWorldQuaternion(new Quaternion());
      expect(Math.abs(actual.dot(visual.orientations[id]))).toBeCloseTo(1,7);
      if(id.endsWith('Hand')){
        const visibleFinger=tip.getObjectByName('gripping-fingertip')!;
        expect(visibleFinger.getWorldPosition(new Vector3()).distanceTo(targets[id])).toBeLessThan(1e-6);
      }
    }
    expectFixedBones(character);
  });

  it('changes grip curl without moving an attached fingertip or stretching an arm',()=>{
    const {character,targets,visual}=fixture('sloper');
    const hand=character.group.getObjectByName('leftHand')!;
    const before=hand.children.filter(o=>o instanceof Mesh).map(o=>o.position.clone());
    visual.contacts.leftHand.grip='crimp';character.update(1/60,3,'climb');
    const after=hand.children.filter(o=>o instanceof Mesh).map(o=>o.position.clone());
    expect(after.some((point,i)=>point.distanceTo(before[i])>.01)).toBe(true);
    expect(character.contactWorldPosition('leftHand').distanceTo(targets.leftHand)).toBeLessThan(1e-6);
    expectFixedBones(character);
  });

  it('rotates the actual pelvis and torso about the hip center while support contacts remain planted',()=>{
    const {character,targets,visual}=fixture();
    const pelvis=character.group.getObjectByName('pelvis')!,torso=character.group.getObjectByName('torso')!;
    const pivotBefore=pelvis.localToWorld(new Vector3(0,.8,0));
    visual.hipRotation.set(.10,.30,-.08);visual.torsoRotation.set(-.05,-.15,.06);
    character.update(1/60,10,'climb');character.group.updateWorldMatrix(true,true);
    expect(pelvis.localToWorld(new Vector3(0,.8,0)).distanceTo(pivotBefore)).toBeLessThan(1e-6);
    expect(pelvis.rotation.y).toBeCloseTo(.30,7);expect(torso.rotation.y).toBeCloseTo(-.15,7);
    for(const id of LIMBS)expect(character.contactWorldPosition(id).distanceTo(targets[id])).toBeLessThan(1e-6);
    expectFixedBones(character);
  });

  it('keeps strain tremble in the body and looks only toward an explicit clicked point',()=>{
    const {character,targets,visual}=fixture();
    const head=character.group.getObjectByName('head')!;
    character.update(1/60,25,'climb');expect(head.rotation.x).toBe(0);expect(head.rotation.y).toBe(0);
    visual.lookTarget=character.group.localToWorld(new Vector3(-.9,2.0,-1));visual.tremble=1;
    character.update(1/60,25.1,'climb');expect(Math.abs(head.rotation.x)+Math.abs(head.rotation.y)).toBeGreaterThan(.1);
    for(let i=0;i<20;i++){
      character.update(1/60,25.1+i/60,'climb');
      for(const id of LIMBS)expect(character.contactWorldPosition(id).distanceTo(targets[id])).toBeLessThan(1e-6);
      expectFixedBones(character);
    }
    visual.lookTarget=null;character.update(1/60,26,'climb');expect(head.rotation.x).toBe(0);expect(head.rotation.y).toBe(0);
  });

  it('clamps unreachable wrist targets instead of stretching limbs',()=>{
    const {character,targets}=fixture();targets.leftHand.add(new Vector3(-3,3,0));
    character.update(1/60,5,'climb');expectFixedBones(character);
    expect(character.contactWorldPosition('leftHand').distanceTo(targets.leftHand)).toBeGreaterThan(2);
  });

  it('keeps critical tremble contact error below eight millimeters at nearly full arm extension',()=>{
    const {character,targets,visual}=fixture();
    const shoulder=character.group.getObjectByName('torso')!.localToWorld(new Vector3(-.202,1.245,0));
    const reachDirection=new Vector3(-.13,.06,-1).normalize().applyQuaternion(character.group.getWorldQuaternion(new Quaternion()));
    const contactOffset=new Vector3(0,.09,-.035).applyQuaternion(visual.orientations.leftHand);
    targets.leftHand.copy(shoulder).addScaledVector(reachDirection,.638).add(contactOffset);visual.tremble=1;
    for(let i=0;i<60;i++){
      character.update(1/60,i/60,'climb');
      expect(character.contactWorldPosition('leftHand').distanceTo(targets.leftHand)).toBeLessThan(.008);
      expectFixedBones(character);
    }
  });

  it('retains legacy world-target posing when no procedural visual is supplied',()=>{
    const character=new Character('#b46d52');
    const targets:PoseTargets={leftHand:new Vector3(-.25,1.35,-.35),rightHand:new Vector3(.25,1.35,-.35),leftFoot:new Vector3(-.17,.24,-.3),rightFoot:new Vector3(.17,.24,-.3)};
    character.setClimbPose(targets);character.setClimbingVisual(null);character.update(1/60,0,'climb');character.group.updateWorldMatrix(true,true);
    expect(character.group.getObjectByName('leftHand')!.getWorldPosition(new Vector3()).distanceTo(targets.leftHand)).toBeLessThan(1e-6);
    expectFixedBones(character);
  });
});
