import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { ARM_REACH, LEG_REACH, contactJointTarget, solveBodyPose } from '../src/climbing/BodyPoseSolver';
import { LIMBS, isHand } from '../src/climbing/types';
import type { ClimbSurface, LimbContact, LimbId } from '../src/climbing/types';
const surface: ClimbSurface = { id: 'wall', origin: new Vector3(), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), angle: 0,
  friction: .7, material: 'plywood', bounds: { id: 'wall', minX: -5, maxX: 5, minY: 0, maxY: 8, z: 0 } };
function contacts(): Record<LimbId, LimbContact> {
  return Object.fromEntries(LIMBS.map(limb => [limb, { limb, kind: 'hold', state: 'attached', point: new Vector3(limb.startsWith('left') ? -.3 : .3, isHand(limb) ? 1.4 : .35, .175),
    orientation: new Quaternion(), normal: new Vector3(0, 0, 1), holdId: limb, grip: 'jug', direction: new Vector3(0, -1, 0), strength: 1, friction: .9, quality: 1, load: .25, rotation: 0, planted: true }])) as Record<LimbId, LimbContact>;
}
describe('contact-constrained body pose', () => {
  it('keeps every planted wrist/ankle within its fixed bone length without editing contacts', () => {
    const set = contacts(), before = LIMBS.map(l => set[l].point.clone());
    const pose = solveBodyPose(set, surface, new Vector3(0, .1, .52));
    expect(pose.feasible).toBe(true);
    for (let i = 0; i < LIMBS.length; i++) {
      const limb = LIMBS[i], side = limb.startsWith('left') ? 'left' : 'right';
      const anchor = isHand(limb) ? pose.shoulders[side] : pose.hips[side];
      expect(anchor.distanceTo(contactJointTarget(set[limb]))).toBeLessThanOrEqual(isHand(limb) ? ARM_REACH : LEG_REACH);
      expect(set[limb].point.equals(before[i])).toBe(true);
    }
  });
  it('shifts the body for a reachable hand while preserving three planted supports', () => {
    const set = contacts(), initial = solveBodyPose(set, surface, new Vector3(0, .1, .52));
    set.rightHand.point.y = 1.95;
    const reached = solveBodyPose(set, surface, initial.root);
    expect(reached.feasible).toBe(true);
    expect(reached.root.y).toBeGreaterThan(initial.root.y);
    expect(reached.torsoRotation.y).not.toBe(0);
  });
  it('rejects a split stance whose simultaneous limb reach spheres cannot overlap', () => {
    const set = contacts(); set.rightHand.point.set(3, 3, .175);
    expect(solveBodyPose(set, surface, new Vector3(0, .1, .52)).feasible).toBe(false);
  });
  it('does not constrain the root to an explicitly released or moving limb', () => {
    const set = contacts(); set.rightHand.point.set(3, 3, .175);
    expect(solveBodyPose(set, surface, new Vector3(0, .1, .52), 'rightHand').feasible).toBe(true);
    set.rightHand.planted = false; set.rightHand.state = 'free';
    expect(solveBodyPose(set, surface, new Vector3(0, .1, .52)).feasible).toBe(true);
  });
});
