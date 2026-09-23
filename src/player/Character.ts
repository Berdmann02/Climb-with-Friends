import * as THREE from 'three';
import type { PoseTargets } from '../core/contracts';
import { solveTwoBone } from '../climbing/ik';

export type CharacterState = 'idle' | 'walk' | 'jog' | 'climb' | 'fall' | 'belay';
type Limb = { upper: THREE.Mesh; lower: THREE.Mesh; joint: THREE.Mesh; tip: THREE.Group };
const UP = new THREE.Vector3(0, 1, 0);

/** Compact, articulated climber. World transforms belong to gameplay controllers. */
export class Character {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly leftArm: Limb;
  private readonly rightArm: Limb;
  private readonly leftLeg: Limb;
  private readonly rightLeg: Limb;
  private pose: PoseTargets | null = null;
  private belayAction = 'neutral';
  private tension = 0;
  private gait = 0;
  private bodyLean = 0;
  private clipAnimation: { target: THREE.Vector3; elapsed: number; left: boolean } | null = null;
  private readonly belayDevice = new THREE.Group();

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
    this.group.add(this.body);
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
    hips.scale.set(1, .65, .7); hips.position.y = .77; this.group.add(hips);
    const belt = this.mesh(new THREE.TorusGeometry(.19, .021, 7, 18), webbing);
    belt.rotation.x = Math.PI / 2; belt.scale.y = .77; belt.position.y = .84; this.group.add(belt);
    for (const x of [-.115, .115]) {
      const loop = this.mesh(new THREE.TorusGeometry(.09, .014, 6, 14), webbing);
      loop.rotation.x = Math.PI / 2; loop.position.set(x, .665, .008); this.group.add(loop);
      const rise = this.mesh(new THREE.BoxGeometry(.024, .17, .025), webbing);
      rise.position.set(x * .7, .75, -.105); rise.rotation.z = x > 0 ? -.28 : .28; this.group.add(rise);
    }
    const tieIn = this.mesh(new THREE.TorusGeometry(.037, .012, 6, 12), webbing);
    tieIn.position.set(0, .82, -.158); this.group.add(tieIn);
    const deviceBody = this.mesh(new THREE.BoxGeometry(.073, .048, .045), metal);
    deviceBody.position.set(0, .87, -.20); this.belayDevice.add(deviceBody);
    const deviceCarabiner = this.mesh(new THREE.TorusGeometry(.034, .009, 6, 12), metal);
    deviceCarabiner.scale.y = 1.5; deviceCarabiner.position.set(0, .81, -.19); this.belayDevice.add(deviceCarabiner);
    this.group.add(this.belayDevice); this.belayDevice.visible = false;
    const gearLoop = this.mesh(new THREE.TorusGeometry(.04, .009, 6, 12), metal);
    gearLoop.position.set(.19, .8, -.01); gearLoop.rotation.y = Math.PI / 2; this.group.add(gearLoop);
    const chalk = this.mesh(new THREE.CylinderGeometry(.065, .055, .145, 12), cuff);
    chalk.position.set(.02, .75, .19); chalk.rotation.x = .2; this.group.add(chalk);
    const chalkLip = this.mesh(new THREE.TorusGeometry(.063, .012, 6, 12), shoe);
    chalkLip.position.set(.02, .824, .18); chalkLip.rotation.x = Math.PI / 2; this.group.add(chalkLip);
    this.leftArm = this.limb(fleece, fleece, .061, .052, skin);
    this.rightArm = this.limb(fleece, fleece, .061, .052, skin);
    this.leftLeg = this.limb(pants, pants, .081, .064, shoe, true);
    this.rightLeg = this.limb(pants, pants, .081, .064, shoe, true);
    this.leftArm.tip.name = 'leftHand'; this.rightArm.tip.name = 'rightHand';
    this.leftLeg.tip.name = 'leftFoot'; this.rightLeg.tip.name = 'rightFoot';
    for (const leg of [this.leftLeg, this.rightLeg]) {
      const sole = this.mesh(new THREE.BoxGeometry(.12, .026, .235), rubber);
      sole.position.set(0, -.033, -.043); leg.tip.add(sole);
      const toe = this.mesh(new THREE.SphereGeometry(.055, 10, 7), webbing);
      toe.scale.set(1.04, .5, 1.1); toe.position.set(0, .006, -.118); leg.tip.add(toe);
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
    const extremity = this.mesh(new THREE.SphereGeometry(foot ? .065 : .052, 10, 8), tipMat);
    if (foot) { extremity.scale.set(.91, .67, 1.72); extremity.position.z = -.036; }
    else extremity.scale.set(.92, 1.2, .74);
    tip.add(extremity);
    this.group.add(upper, lower, joint, tip);
    return { upper, lower, joint, tip };
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
  get isClipping(): boolean { return this.clipAnimation !== null; }
  playClip(target: THREE.Vector3): void {
    this.clipAnimation = { target: target.clone(), elapsed: 0, left: target.x < this.group.position.x };
  }
  setBelayAction(action: string, tension = 0): void { this.belayAction = action; this.tension = THREE.MathUtils.clamp(tension, 0, 1); }
  harnessPosition(): THREE.Vector3 {
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(new THREE.Vector3(0, .82, -.168));
  }

  update(dt: number, time: number, state: CharacterState, speed = 0): void {
    const walking = state === 'walk' || state === 'jog';
    this.belayDevice.visible = state === 'belay';
    if (state !== 'climb') this.clipAnimation = null;
    const climbing = state === 'climb' && this.pose;
    this.gait += dt * (walking ? 4.2 + speed * 1.2 : 1);
    const stride = walking ? Math.min(.29, .09 + speed * .065) : 0;
    const bob = walking ? Math.abs(Math.sin(this.gait)) * .025 : Math.sin(time * 1.8) * .006;
    this.body.position.y = bob;
    this.bodyLean = THREE.MathUtils.lerp(this.bodyLean, climbing ? Math.sin(time * 1.1) * .025 : walking ? .035 : 0, 1 - Math.exp(-dt * 8));
    this.body.rotation.set(walking ? -.04 : 0, climbing ? Math.sin(time * .8) * .055 : 0, this.bodyLean);
    this.head.rotation.x = state === 'belay' ? .44 : climbing ? .22 : 0;
    this.head.rotation.y = state === 'idle' ? Math.sin(time * .32) * .10 : 0;
    this.group.updateWorldMatrix(true, false);
    const leftShoulder = new THREE.Vector3(-.202, 1.245 + bob, 0).applyEuler(this.body.rotation);
    const rightShoulder = new THREE.Vector3(.202, 1.245 + bob, 0).applyEuler(this.body.rotation);
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
    } else if (state === 'fall') {
      lh.set(-.31, 1.00, -.17); rh.set(.31, 1.06, -.17);
      lf.set(-.20, .18, -.25); rf.set(.21, .23, -.28);
    }
    if (state !== 'belay') this.body.position.z = 0;
    this.poseLimb(this.leftArm, leftShoulder, lh, new THREE.Vector3(-.8, 1, .2), .32, .32);
    this.poseLimb(this.rightArm, rightShoulder, rh, new THREE.Vector3(.8, 1, .2), .32, .32);
    const leftPole = climbing ? new THREE.Vector3(-.55, .45, -.23) : new THREE.Vector3(-.18, .45, -.8);
    const rightPole = climbing ? new THREE.Vector3(.55, .45, -.23) : new THREE.Vector3(.18, .45, -.8);
    this.poseLimb(this.leftLeg, new THREE.Vector3(-.115, .80, .015), lf, leftPole, .38, .42);
    this.poseLimb(this.rightLeg, new THREE.Vector3(.115, .80, .015), rf, rightPole, .38, .42);
  }
}
