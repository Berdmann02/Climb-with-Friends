import * as THREE from 'three';
import type { PoseTargets } from '../core/contracts';
import type { ClimbingVisual, GripType, LimbId } from '../climbing/types';
import { solveTwoBone } from '../climbing/ik';

export type CharacterState = 'idle' | 'walk' | 'jog' | 'climb' | 'fall' | 'belay' | 'hang' | 'land';
type Finger = { upper:THREE.Mesh; lower:THREE.Mesh; pad:THREE.Mesh };
type Limb = { upper: THREE.Mesh; lower: THREE.Mesh; joint: THREE.Mesh; tip: THREE.Group; contact:THREE.Object3D; fingers?:Finger[]; thumb?:Finger; palm?:THREE.Mesh };
const UP = new THREE.Vector3(0, 1, 0);
const PELVIS_PIVOT = new THREE.Vector3(0,.8,0);
// These are the same contact-to-joint offsets used by BodyPoseSolver. Contacts
// denote the actual gripping fingertip / toe, never the wrist or ankle.
const HAND_CONTACT = new THREE.Vector3(0,.09,-.035);
const FOOT_CONTACT = new THREE.Vector3(0,-.02,-.16);

/** Compact, articulated climber. World transforms belong to gameplay controllers. */
export class Character {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly pelvis = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly leftArm: Limb;
  private readonly rightArm: Limb;
  private readonly leftLeg: Limb;
  private readonly rightLeg: Limb;
  private pose: PoseTargets | null = null;
  private climbingVisual:ClimbingVisual|null = null;
  private belayAction = 'neutral';
  private tension = 0;
  private gait = 0;
  private bodyLean = 0;
  private clipAnimation: { target: THREE.Vector3; elapsed: number; left: boolean } | null = null;
  private readonly belayDevice = new THREE.Group();
  private landing:{size:'low'|'medium'|'high';progress:number}={size:'low',progress:0};
  private lastState:CharacterState='idle';
  private hangTime=0;
  private hangFrom:PoseTargets|null=null;
  private hangTorso=new THREE.Vector3();
  private hangHips=new THREE.Vector3();

  constructor(color: string, helmet = false) {
    this.group.name = 'Climber';
    const fleece = new THREE.MeshStandardMaterial({ color, roughness: .91 });
    const cuff = new THREE.MeshStandardMaterial({ color: '#dfd3b5', roughness: .9 });
    const pants = new THREE.MeshStandardMaterial({ color: '#3c5355', roughness: .94 });
    const skin = new THREE.MeshStandardMaterial({ color: '#dba982', roughness: .88 });
    const shoe = new THREE.MeshStandardMaterial({ color: '#283a3c', roughness: .66 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#18292b', roughness: .75 });
    const webbing = new THREE.MeshStandardMaterial({ color: '#d79249', roughness: .9 });
    const metal = new THREE.MeshStandardMaterial({ color: '#c4ccbf', metalness: .7, roughness: .26 });
    this.body.name='torso';this.pelvis.name='pelvis';this.head.name='head';
    this.group.add(this.body,this.pelvis);
    const torso = this.mesh(new THREE.CapsuleGeometry(.205, .25, 6, 12), fleece);
    torso.scale.set(1, 1, .71);
    torso.position.y = 1.065;
    this.body.add(torso);
    // Hem, zipper, generous collar, and pocket make simple geometry read as clothing.
    const hem = this.mesh(new THREE.CylinderGeometry(.192, .186, .065, 14), cuff);
    hem.scale.z = .75; hem.position.y = .8; this.body.add(hem);
    const zipper = this.mesh(new THREE.BoxGeometry(.012, .35, .012), cuff);
    zipper.position.set(0, 1.12, -.147); this.body.add(zipper);
    const pocket = this.mesh(new THREE.BoxGeometry(.095, .115, .018), fleece);
    pocket.position.set(.09, 1.16, -.154); this.body.add(pocket);
    const neck = this.mesh(new THREE.CylinderGeometry(.073, .083, .14, 12), skin);
    neck.position.y = 1.32; this.body.add(neck);
    this.head.position.y = 1.485; this.body.add(this.head);
    const face = this.mesh(new THREE.SphereGeometry(.18, 16, 12), skin);
    face.scale.set(.9, 1.08, .91); this.head.add(face);
    const hairMat = new THREE.MeshStandardMaterial({ color: '#544538', roughness: 1 });
    const hair = this.mesh(new THREE.SphereGeometry(.184, 14, 8, 0, Math.PI * 2, 0, 1.32), hairMat);
    hair.scale.set(.93, 1.08, .95); this.head.add(hair);
    for (const side of [-1, 1]) {
      const eye = this.mesh(new THREE.SphereGeometry(.014, 8, 8), rubber);
      eye.scale.y = 1.2; eye.position.set(side * .059, .014, -.151); this.head.add(eye);
      const ear = this.mesh(new THREE.SphereGeometry(.035, 10, 8), skin);
      ear.scale.set(.55, 1, .65); ear.position.set(side * .159, -.002, .005); this.head.add(ear);
    }
    const smileCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.032, -.055, -.157), new THREE.Vector3(0, -.074, -.161), new THREE.Vector3(.032, -.055, -.157));
    this.head.add(this.mesh(new THREE.TubeGeometry(smileCurve, 8, .005, 5, false), hairMat));
    if (helmet) {
      const shell = this.mesh(new THREE.SphereGeometry(.205, 16, 10, 0, Math.PI * 2, 0, 1.62), new THREE.MeshStandardMaterial({ color: '#efcc76', roughness: .62 }));
      shell.scale.set(.95, .91, .95); shell.position.y = .04; this.head.add(shell);
      for (const x of [-.09, .09]) {
        const vent = this.mesh(new THREE.BoxGeometry(.025, .012, .085), rubber);
        vent.position.set(x, .218, .005); this.head.add(vent);
      }
      for (const x of [-.135, .135]) {
        const strap = this.mesh(new THREE.BoxGeometry(.012, .17, .012), rubber);
        strap.rotation.z = x > 0 ? -.25 : .25; strap.position.set(x, -.09, -.04); this.head.add(strap);
      }
    }
    const hips = this.mesh(new THREE.SphereGeometry(.19, 14, 10), pants);
    hips.scale.set(1, .65, .7); hips.position.y = .77; this.pelvis.add(hips);
    const belt = this.mesh(new THREE.TorusGeometry(.19, .021, 7, 18), webbing);
    belt.rotation.x = Math.PI / 2; belt.scale.y = .77; belt.position.y = .84; this.pelvis.add(belt);
    for (const x of [-.115, .115]) {
      const loop = this.mesh(new THREE.TorusGeometry(.09, .014, 6, 14), webbing);
      loop.rotation.x = Math.PI / 2; loop.position.set(x, .665, .008); this.pelvis.add(loop);
      const rise = this.mesh(new THREE.BoxGeometry(.024, .17, .025), webbing);
      rise.position.set(x * .7, .75, -.105); rise.rotation.z = x > 0 ? -.28 : .28; this.pelvis.add(rise);
    }
    const tieIn = this.mesh(new THREE.TorusGeometry(.037, .012, 6, 12), webbing);
    tieIn.position.set(0, .82, -.158); this.pelvis.add(tieIn);
    const deviceBody = this.mesh(new THREE.BoxGeometry(.073, .048, .045), metal);
    deviceBody.position.set(0, .87, -.20); this.belayDevice.add(deviceBody);
    const deviceCarabiner = this.mesh(new THREE.TorusGeometry(.034, .009, 6, 12), metal);
    deviceCarabiner.scale.y = 1.5; deviceCarabiner.position.set(0, .81, -.19); this.belayDevice.add(deviceCarabiner);
    this.pelvis.add(this.belayDevice); this.belayDevice.visible = false;
    const gearLoop = this.mesh(new THREE.TorusGeometry(.04, .009, 6, 12), metal);
    gearLoop.position.set(.19, .8, -.01); gearLoop.rotation.y = Math.PI / 2; this.pelvis.add(gearLoop);
    const chalk = this.mesh(new THREE.CylinderGeometry(.065, .055, .145, 12), cuff);
    chalk.position.set(.02, .75, .19); chalk.rotation.x = .2; this.pelvis.add(chalk);
    const chalkLip = this.mesh(new THREE.TorusGeometry(.063, .012, 6, 12), shoe);
    chalkLip.position.set(.02, .824, .18); chalkLip.rotation.x = Math.PI / 2; this.pelvis.add(chalkLip);
    this.leftArm = this.limb(fleece, fleece, .061, .052, skin);
    this.rightArm = this.limb(fleece, fleece, .061, .052, skin);
    this.leftLeg = this.limb(pants, pants, .081, .064, shoe, true);
    this.rightLeg = this.limb(pants, pants, .081, .064, shoe, true);
    this.leftArm.tip.name = 'leftHand'; this.rightArm.tip.name = 'rightHand';
    this.leftLeg.tip.name = 'leftFoot'; this.rightLeg.tip.name = 'rightFoot';
    for(const limb of [this.leftArm,this.rightArm,this.leftLeg,this.rightLeg]){
      limb.upper.name=`${limb.tip.name}:upperBone`;limb.lower.name=`${limb.tip.name}:lowerBone`;limb.joint.name=`${limb.tip.name}:joint`;limb.contact.name=`${limb.tip.name}:contact`;
    }
    for (const leg of [this.leftLeg, this.rightLeg]) {
      const sole = this.mesh(new THREE.BoxGeometry(.12, .026, .235), rubber);
      sole.position.set(0, -.033, -.043); leg.tip.add(sole);
      const toe = this.mesh(new THREE.SphereGeometry(.055, 10, 7), webbing);
      toe.scale.set(1.04, .5, 1.1); toe.position.set(0, .006, -.10); leg.tip.add(toe);
    }
    this.update(0, 0, 'idle');
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const result = new THREE.Mesh(geometry, material);
    result.castShadow = true; result.receiveShadow = true;
    return result;
  }
  private limb(upperMat: THREE.Material, lowerMat: THREE.Material, upperRadius: number, lowerRadius: number, tipMat: THREE.Material, foot = false): Limb {
    const upper = this.mesh(new THREE.CylinderGeometry(upperRadius, upperRadius * .9, 1, 9), upperMat);
    const lower = this.mesh(new THREE.CylinderGeometry(lowerRadius * 1.06, lowerRadius * .85, 1, 9), lowerMat);
    const joint = this.mesh(new THREE.SphereGeometry(lowerRadius * 1.09, 10, 8), upperMat);
    const tip = new THREE.Group();
    const extremity = this.mesh(new THREE.SphereGeometry(foot ? .065 : .045, 10, 8), tipMat);
    if (foot) { extremity.scale.set(.91, .67, 1.72); extremity.position.z = -.036; }
    else {extremity.scale.set(1.02,.85,.59);extremity.position.y=.024;}
    tip.add(extremity);
    const contact=new THREE.Object3D();contact.position.copy(foot?FOOT_CONTACT:HAND_CONTACT);tip.add(contact);
    let fingers:Finger[]|undefined,thumb:Finger|undefined;
    if(!foot){
      const wrist=this.mesh(new THREE.CylinderGeometry(.025,.026,.036,8),tipMat);wrist.position.y=-.013;tip.add(wrist);
      const finger=():Finger=>{const upper=this.mesh(new THREE.CapsuleGeometry(.0095,.018,3,7),tipMat),lower=this.mesh(new THREE.CapsuleGeometry(.009,.018,3,7),tipMat),pad=this.mesh(new THREE.SphereGeometry(.010,8,6),tipMat);tip.add(upper,lower,pad);return {upper,lower,pad};};
      fingers=Array.from({length:3},finger);thumb=finger();
    }
    this.group.add(upper, lower, joint, tip);
    return { upper, lower, joint, tip,contact,fingers,thumb,palm:foot?undefined:extremity };
  }
  private segment(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3): void {
    const delta = end.clone().sub(start);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.scale.y = delta.length();
    mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
  }
  private poseLimb(limb: Limb, origin: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, upper: number, lower: number): void {
    const solved = solveTwoBone(origin, target, pole, upper, lower);
    this.segment(limb.upper, origin, solved.joint);
    this.segment(limb.lower, solved.joint, solved.end);
    limb.joint.position.copy(solved.joint);
    limb.tip.position.copy(solved.end);
  }
  setClimbPose(targets: PoseTargets): void { this.pose = targets; }
  setClimbingVisual(visual:ClimbingVisual|null):void {this.climbingVisual=visual;}
  setLanding(size:'low'|'medium'|'high',progress:number):void {this.landing={size,progress};}
  /** The rendered contact point, useful for contact diagnostics without exposing meshes. */
  contactWorldPosition(limb:LimbId):THREE.Vector3 {
    const target=limb==='leftHand'?this.leftArm:limb==='rightHand'?this.rightArm:limb==='leftFoot'?this.leftLeg:this.rightLeg;
    this.group.updateWorldMatrix(true,true);return target.contact.getWorldPosition(new THREE.Vector3());
  }
  contactWorldOrientation(limb:LimbId):THREE.Quaternion {
    const target=limb==='leftHand'?this.leftArm:limb==='rightHand'?this.rightArm:limb==='leftFoot'?this.leftLeg:this.rightLeg;
    this.group.updateWorldMatrix(true,true);return target.tip.getWorldQuaternion(new THREE.Quaternion());
  }
  get isClipping(): boolean { return this.clipAnimation !== null; }
  playClip(target: THREE.Vector3): void {
    this.clipAnimation = { target: target.clone(), elapsed: 0, left: target.x < this.group.position.x };
  }
  setBelayAction(action: string, tension = 0): void { this.belayAction = action; this.tension = THREE.MathUtils.clamp(tension, 0, 1); }
  harnessPosition(): THREE.Vector3 {
    this.pelvis.updateWorldMatrix(true, false);
    return this.pelvis.localToWorld(new THREE.Vector3(0, .82, -.168));
  }

  private poseGrip(limb:Limb,grip:GripType,side:number,tension:number,open=false):void {
    if(!limb.fingers||!limb.thumb)return;
    const extended=grip==='sloper'||grip==='edge';
    const crimp=grip==='crimp'||grip==='pocket';
    const pinch=grip==='pinch';
    const knuckleY=open?.069:extended?.073:crimp?.094:pinch?.081:.104;
    const knuckleZ=open?-.017:extended?-.024:crimp?.006:pinch?-.007:.013;
    const rounded=(mesh:THREE.Mesh,from:THREE.Vector3,to:THREE.Vector3,length:number)=>{this.segment(mesh,from,to);mesh.scale.y/=length;};
    limb.fingers.forEach((finger,i)=>{
      const x=(i-1)*.023;
      const base=new THREE.Vector3(x,.050,-.001);
      const joint=new THREE.Vector3(x*(open?1.12:1),knuckleY-Math.abs(i-1)*.004,knuckleZ-(open?0:tension*.003));
      const tip=HAND_CONTACT.clone().add(new THREE.Vector3(x*(open?1.4:1),Math.abs(i-1)*-.004,0));
      rounded(finger.upper,base,joint,.037);rounded(finger.lower,joint,tip,.036);finger.pad.position.copy(tip);
      finger.pad.name=i===1?'gripping-fingertip':'finger-pad';
    });
    // Opposing thumb closes against a pinch; broad grips keep it beside the palm.
    const thumbBase=new THREE.Vector3(-side*.035,.017,.002);
    const thumbJoint=new THREE.Vector3(-side*(open?.052:pinch?.052:.055),pinch&&!open?.05:.038,pinch&&!open?-.008:-.003);
    const thumbTip=new THREE.Vector3(-side*(open?.066:pinch?.018:.045),pinch&&!open?.065:.058,open?-.007:pinch?-.039:-.024);
    rounded(limb.thumb.upper,thumbBase,thumbJoint,.037);rounded(limb.thumb.lower,thumbJoint,thumbTip,.036);limb.thumb.pad.position.copy(thumbTip);
    if(limb.palm)limb.palm.scale.z=(open || extended) ? .47 : .59;
  }

  /** Rotate a modeled body part about the pelvis rather than around the feet. */
  private pivotAroundPelvis(part:THREE.Group):void {
    part.position.copy(PELVIS_PIVOT).sub(PELVIS_PIVOT.clone().applyQuaternion(part.quaternion));
  }

  update(dt: number, time: number, state: CharacterState, speed = 0): void {
    if(state==='hang'&&this.lastState!=='hang'){
      this.hangTime=0;
      this.hangFrom={leftHand:this.leftArm.tip.position.clone(),rightHand:this.rightArm.tip.position.clone(),leftFoot:this.leftLeg.tip.position.clone(),rightFoot:this.rightLeg.tip.position.clone()};
      this.hangTorso.set(this.body.rotation.x,this.body.rotation.y,this.body.rotation.z);
      this.hangHips.set(this.pelvis.rotation.x,this.pelvis.rotation.y,this.pelvis.rotation.z);
    }
    if(state==='hang')this.hangTime+=dt;
    this.lastState=state;
    const hangingBlend=THREE.MathUtils.smoothstep(this.hangTime,0,.48);
    const walking = state === 'walk' || state === 'jog';
    this.belayDevice.visible = state === 'belay';
    if (state !== 'climb') this.clipAnimation = null;
    const climbing = state === 'climb' && this.pose;
    const visual=climbing?this.climbingVisual:null;
    this.gait += dt * (walking ? 4.2 + speed * 1.2 : 1);
    const stride = walking ? Math.min(.29, .09 + speed * .065) : 0;
    const bob = walking ? Math.abs(Math.sin(this.gait)) * .025 : Math.sin(time * 1.8) * .006;
    this.bodyLean = THREE.MathUtils.lerp(this.bodyLean, climbing ? Math.sin(time * 1.1) * .025 : walking ? .035 : 0, 1 - Math.exp(-dt * 8));
    if(visual){
      const shake=THREE.MathUtils.clamp(visual.tremble,0,1)*.011;
      this.body.rotation.set(visual.torsoRotation.x,visual.torsoRotation.y+Math.sin(time*22)*shake,visual.torsoRotation.z+Math.sin(time*28.3)*shake);
      this.pelvis.rotation.set(visual.hipRotation.x,visual.hipRotation.y,visual.hipRotation.z);
      this.pivotAroundPelvis(this.body);this.pivotAroundPelvis(this.pelvis);
    }else{
      this.body.rotation.set(walking ? -.04 : 0, climbing ? Math.sin(time * .8) * .055 : 0, this.bodyLean);
      this.pivotAroundPelvis(this.body);this.body.position.y+=bob;
      this.pelvis.rotation.set(0,0,0);this.pelvis.position.set(0,0,0);
    }
    this.head.rotation.set(state === 'belay' ? .44 : climbing&&!visual ? .22 : 0,state === 'idle' ? Math.sin(time * .32) * .10 : 0,0);
    let compression=0,roll=0;
    if(state==='hang'){
      this.body.rotation.set(THREE.MathUtils.lerp(this.hangTorso.x,.18+Math.sin(time*1.7)*.008,hangingBlend),this.hangTorso.y*(1-hangingBlend),this.hangTorso.z*(1-hangingBlend));
      this.pelvis.rotation.set(THREE.MathUtils.lerp(this.hangHips.x,.12,hangingBlend),this.hangHips.y*(1-hangingBlend),this.hangHips.z*(1-hangingBlend));
      this.pivotAroundPelvis(this.body);this.pivotAroundPelvis(this.pelvis);
      this.head.rotation.y=Math.sin(time*.35)*.12;
    }
    if(state==='land'){
      const {size,progress:t}=this.landing;
      const compressIn=THREE.MathUtils.smoothstep(t,0,.16),stand=1-THREE.MathUtils.smoothstep(t,.55,1);
      compression=compressIn*stand;
      roll=size==='low'?0:Math.sin(THREE.MathUtils.clamp((t-.17)/.62,0,1)*Math.PI)*(size==='high'?1.42:.68);
      this.body.rotation.set(roll-.18*compression,0,roll*(size==='high'?.24:.12));
      this.pelvis.rotation.set(roll*.58,0,roll*.14);
      this.pivotAroundPelvis(this.body);this.pivotAroundPelvis(this.pelvis);
      const sink=compression*(size==='low'?.22:.43)+(size==='high'?roll*.115:0);
      this.body.position.y-=sink;
      this.pelvis.position.y-=sink;
      this.head.rotation.x=-roll*.45;
    }
    this.group.updateWorldMatrix(true, false);
    if(visual?.lookTarget){
      this.body.updateWorldMatrix(true,false);
      const direction=this.body.worldToLocal(visual.lookTarget.clone()).sub(this.head.position);
      this.head.rotation.set(THREE.MathUtils.clamp(Math.atan2(direction.y,Math.hypot(direction.x,direction.z)),-.6,.7),THREE.MathUtils.clamp(Math.atan2(-direction.x,-direction.z),-.9,.9),0);
    }
    const torsoPoint=(p:THREE.Vector3)=>p.applyQuaternion(this.body.quaternion).add(this.body.position);
    const pelvisPoint=(p:THREE.Vector3)=>p.applyQuaternion(this.pelvis.quaternion).add(this.pelvis.position);
    const leftShoulder = torsoPoint(new THREE.Vector3(-.202, 1.245, 0));
    const rightShoulder = torsoPoint(new THREE.Vector3(.202, 1.245, 0));
    let lh = new THREE.Vector3(-.245, .69, -Math.sin(this.gait) * stride);
    let rh = new THREE.Vector3(.245, .69, Math.sin(this.gait) * stride);
    let lf = new THREE.Vector3(-.13, .07 + Math.max(0, Math.sin(this.gait)) * stride * .4, Math.cos(this.gait) * stride);
    let rf = new THREE.Vector3(.13, .07 + Math.max(0, -Math.sin(this.gait)) * stride * .4, -Math.cos(this.gait) * stride);
    if (climbing && this.pose) {
      lh = this.group.worldToLocal(this.pose.leftHand.clone());
      rh = this.group.worldToLocal(this.pose.rightHand.clone());
      lf = this.group.worldToLocal(this.pose.leftFoot.clone());
      rf = this.group.worldToLocal(this.pose.rightFoot.clone());
      if (this.clipAnimation) {
        const clip = this.clipAnimation; clip.elapsed += dt;
        const t = Math.min(1, clip.elapsed / .75);
        const weight = Math.sin(t * Math.PI);
        const target = this.group.worldToLocal(clip.target.clone());
        if (clip.left) lh.lerp(target, weight); else rh.lerp(target, weight);
        if (t >= 1) this.clipAnimation = null;
      }
    } else if (state === 'belay') {
      const handling = this.belayAction === 'feed' ? Math.sin(time * 5) : this.belayAction === 'take' ? -Math.sin(time * 5) : 0;
      lh.set(-.12, 1.14 + handling * .10, -.30);
      // Brake-side hand stays below the device for lock/lower poses.
      rh.set(.15, this.belayAction === 'feed' ? .94 + handling * .065 : .72 + handling * .05, -.30);
      lf.set(-.2, .07, -.15 - this.tension * .08); rf.set(.18, .07, .13);
      this.body.position.z = this.tension * .045;
    } else if(state==='hang'){
      lh.set(-.25,.86,-.07);rh.set(.25,.82,-.08);
      lf.set(-.18,.13,-.25);rf.set(.19,.18,-.29);
      if(this.hangFrom){lh.lerp(this.hangFrom.leftHand,1-hangingBlend);rh.lerp(this.hangFrom.rightHand,1-hangingBlend);lf.lerp(this.hangFrom.leftFoot,1-hangingBlend);rf.lerp(this.hangFrom.rightFoot,1-hangingBlend);}
    } else if(state==='land'){
      lh.set(-.34,.67-compression*.48,.05+roll*.28);rh.set(.34,.65-compression*.44,.03+roll*.22);
      lf.set(-.2,.075+roll*.19,-.16-roll*.19);rf.set(.21,.075+roll*.23,-.1-roll*.16);
    } else if (state === 'fall') {
      lh.set(-.31, 1.00, -.17); rh.set(.31, 1.06, -.17);
      lf.set(-.20, .18, -.25); rf.set(.21, .23, -.28);
    }
    if (state !== 'belay'&&state !== 'hang'&&state !== 'land'&&!visual) this.body.position.z = 0;
    const limbs:Record<LimbId,Limb>={leftHand:this.leftArm,rightHand:this.rightArm,leftFoot:this.leftLeg,rightFoot:this.rightLeg};
    const targets:PoseTargets={leftHand:lh,rightHand:rh,leftFoot:lf,rightFoot:rf};
    const inverseRoot=this.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    for(const id of ['leftHand','rightHand','leftFoot','rightFoot'] as LimbId[]){
      const limb=limbs[id],hand=id.endsWith('Hand');
      if(visual){
        limb.tip.quaternion.copy(inverseRoot).multiply(visual.orientations[id]).normalize();
        targets[id].sub((hand?HAND_CONTACT:FOOT_CONTACT).clone().applyQuaternion(limb.tip.quaternion));
      }else limb.tip.rotation.set(0,0,hand&&!climbing?Math.PI:0);
      if(hand){
        const contact=visual?.contacts[id];
        const open=!!contact&&(!contact.planted||contact.kind==='free'||contact.state==='free'||contact.state==='moving');
        this.poseGrip(limb,contact?.grip??'sloper',id==='leftHand'?-1:1,visual?.tension??0,open);
      }
    }
    const armPole=(side:number)=>torsoPoint(new THREE.Vector3(side*.64,1.04,.24));
    this.poseLimb(this.leftArm, leftShoulder, targets.leftHand, armPole(-1), .32, .32);
    this.poseLimb(this.rightArm, rightShoulder, targets.rightHand, armPole(1), .32, .32);
    const leftPole = climbing ? pelvisPoint(new THREE.Vector3(-.55, .45, -.23)) : new THREE.Vector3(-.18, .45, -.8);
    const rightPole = climbing ? pelvisPoint(new THREE.Vector3(.55, .45, -.23)) : new THREE.Vector3(.18, .45, -.8);
    this.poseLimb(this.leftLeg, pelvisPoint(new THREE.Vector3(-.115, .80, .015)), targets.leftFoot, leftPole, .38, .42);
    this.poseLimb(this.rightLeg, pelvisPoint(new THREE.Vector3(.115, .80, .015)), targets.rightFoot, rightPole, .38, .42);
  }
}
