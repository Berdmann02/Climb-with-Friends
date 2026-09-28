import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { LIMBS, isHand } from './types';
import type { BodyPose, ClimbSurface, LimbContact, LimbId } from './types';

export const ARM_REACH = .64;
export const LEG_REACH = .8;
const REACH_MARGIN = .008;
const PELVIS = new Vector3(0, .8, 0);

/** Wrist/ankle sit behind the contact patch; IK does not place the wrist at fingertips. */
export function contactJointTarget(contact: LimbContact): Vector3 {
  const offset = isHand(contact.limb) ? new Vector3(0, -.09, .035) : new Vector3(0, .02, .16);
  return offset.applyQuaternion(contact.orientation).add(contact.point);
}

export function surfaceOrientation(surface: ClimbSurface): Quaternion {
  const normal = surface.normal.clone().normalize();
  const right = surface.up.clone().cross(normal).normalize();
  const up = normal.clone().cross(right).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal));
}

function rotations(contacts: Record<LimbId, LimbContact>, surface: ClimbSurface): { torso: Vector3; hips: Vector3 } {
  const hands = [contacts.leftHand, contacts.rightHand];
  const feet = [contacts.leftFoot, contacts.rightFoot];
  const normal = surface.normal.clone().normalize();
  const right = surface.up.clone().cross(normal).normalize();
  const up = normal.clone().cross(right).normalize();
  const handHeight = hands[1].point.clone().sub(hands[0].point).dot(up);
  const footHeight = feet[1].point.clone().sub(feet[0].point).dot(up);
  const handX = hands[0].point.clone().add(hands[1].point).multiplyScalar(.5).dot(right);
  const footX = feet[0].point.clone().add(feet[1].point).multiplyScalar(.5).dot(right);
  const freeHandOffset = hands.reduce((sum, contact) => sum + (contact.planted ? 0 : MathUtils.clamp(contact.point.dot(right) - footX, -.8, .8)), 0);
  const freeFootOffset = feet.reduce((sum, contact) => sum + (contact.planted ? 0 : MathUtils.clamp(contact.point.dot(right) - handX, -.8, .8)), 0);
  return {
    torso: new Vector3(0, MathUtils.clamp(handHeight * .12 - freeHandOffset * .14 - (handX - footX) * .1, -.23, .23), MathUtils.clamp((footX - handX) * .12, -.085, .085)),
    hips: new Vector3(0, MathUtils.clamp(footHeight * .13 + freeFootOffset * .15 + (footX - handX) * .06, -.24, .24), MathUtils.clamp(footHeight * .055, -.055, .055)),
  };
}

/** Joint offsets match Character's pelvis-pivot torso and hip rotations. */
function offsets(contacts: Record<LimbId, LimbContact>, surface: ClimbSurface) {
  const rotation = rotations(contacts, surface), world = surfaceOrientation(surface);
  const torso = new Euler(...rotation.torso.toArray() as [number, number, number]);
  const hips = new Euler(...rotation.hips.toArray() as [number, number, number]);
  const result = {} as Record<LimbId, Vector3>;
  for (const limb of LIMBS) {
    const left = limb.startsWith('left');
    result[limb] = (isHand(limb)
      ? new Vector3(left ? -.202 : .202, .445, 0).applyEuler(torso)
      : new Vector3(left ? -.115 : .115, 0, .015).applyEuler(hips))
      .add(PELVIS).applyQuaternion(world);
  }
  return { joints: result, rotation, world };
}

function supports(contact: LimbContact, limb: LimbId, movingLimb?: LimbId): boolean {
  return limb !== movingLimb && contact.planted && contact.kind !== 'free' && contact.kind !== 'flag'
    && contact.state !== 'moving' && contact.state !== 'slipping' && contact.state !== 'free';
}

/** Returns world joint positions and strain without changing any contact point. */
export function bodyPoseAtRoot(contacts: Record<LimbId, LimbContact>, surface: ClimbSurface, root: Vector3, movingLimb?: LimbId): BodyPose {
  const { joints, rotation, world } = offsets(contacts, surface);
  for (const limb of LIMBS) joints[limb].add(root);
  let strain = 0, feasible = root.toArray().every(Number.isFinite);
  for (const limb of LIMBS) if (supports(contacts[limb], limb, movingLimb)) {
    const ratio = joints[limb].distanceTo(contactJointTarget(contacts[limb])) / (isHand(limb) ? ARM_REACH : LEG_REACH);
    strain = Math.max(strain, MathUtils.clamp((ratio - .70) / .30, 0, 1));
    if (ratio > 1.0001) feasible = false;
  }
  const pelvis = PELVIS.clone().applyQuaternion(world).add(root);
  const centerOfMass = new Vector3(-rotation.torso.z * .10, .96, -.025).applyQuaternion(world).add(root);
  return {
    root: root.clone(), pelvis, centerOfMass, torsoRotation: rotation.torso, hipRotation: rotation.hips,
    shoulders: { left: joints.leftHand, right: joints.rightHand },
    hips: { left: joints.leftFoot, right: joints.rightFoot }, strain, feasible,
  };
}

/**
 * Find a root inside all planted-limb reach spheres. Projected constraints preserve
 * contacts exactly: the body may shift, but a planted hand/foot is never relocated.
 * No contacts or input vectors are modified by the solver.
 */
export function solveBodyPose(contacts: Record<LimbId, LimbContact>, surface: ClimbSurface, previousRoot: Vector3, movingLimb?: LimbId): BodyPose {
  const { joints } = offsets(contacts, surface);
  const active = LIMBS.filter(limb => supports(contacts[limb], limb, movingLimb));
  if (!active.length) return bodyPoseAtRoot(contacts, surface, previousRoot, movingLimb);
  const hands = active.filter(isHand), feet = active.filter(limb => !isHand(limb));
  const mean = (limbs: LimbId[]) => limbs.reduce((sum, limb) => sum.add(contacts[limb].point), new Vector3()).divideScalar(limbs.length);
  const handCenter = hands.length ? mean(hands) : null;
  const footCenter = feet.length ? mean(feet) : null;
  const desired = previousRoot.clone();
  if (handCenter && footCenter) {
    desired.x = handCenter.x * .62 + footCenter.x * .38;
    desired.y = (handCenter.y - 1.27) * .65 + (footCenter.y - .25) * .35;
  } else if (handCenter) { desired.x = handCenter.x; desired.y = handCenter.y - 1.20; }
  else if (footCenter) { desired.x = footCenter.x; desired.y = footCenter.y - .20; }
  desired.lerp(previousRoot, .14);
  const normal = surface.normal.clone().normalize();
  const averageDepth = active.reduce((sum, limb) => sum + contacts[limb].point.clone().sub(surface.origin).dot(normal), 0) / active.length;
  desired.addScaledVector(normal, averageDepth + .365 - desired.clone().sub(surface.origin).dot(normal));
  const centers = active.map(limb => ({ limb, point: contactJointTarget(contacts[limb]).sub(joints[limb]), radius: (isHand(limb) ? ARM_REACH : LEG_REACH) - REACH_MARGIN }));
  const constrainWall = (root: Vector3) => {
    const depth = root.clone().sub(surface.origin).dot(normal);
    root.addScaledVector(normal, MathUtils.clamp(depth, .27, surface.material==='rock'?1.1:.67) - depth);
    root.y = Math.max(0, root.y);
  };
  // Try both the prior posture and the weighted contact center. In thin feasible
  // intersections, the former converges much faster and avoids visible jumps.
  let best = desired.clone(), bestResidual = Infinity, bestCost = Infinity;
  for (const seed of [desired, previousRoot]) {
    const root = seed.clone();
    constrainWall(root);
    for (let iteration = 0; iteration < 90; iteration++) {
      for (const constraint of centers) {
        const delta = root.clone().sub(constraint.point), distance = delta.length();
        if (distance > constraint.radius) root.addScaledVector(delta, -(distance - constraint.radius) / distance);
      }
      constrainWall(root);
    }
    const residual = Math.max(0, ...centers.map(c => root.distanceTo(c.point) - c.radius));
    const cost = root.distanceToSquared(desired) + root.distanceToSquared(previousRoot) * .15;
    if (residual < bestResidual - .00001 || (Math.abs(residual - bestResidual) <= .00001 && cost < bestCost)) {
      best = root; bestResidual = residual; bestCost = cost;
    }
  }
  const result = bodyPoseAtRoot(contacts, surface, best, movingLimb);
  result.feasible = result.feasible && bestResidual < .003;
  return result;
}

export interface BodyIntent {
  limb: LimbId;
  point: Vector3;
  orientation: Quaternion;
  effort: number;
  drive?: boolean;
}

/** A supported stand-up goal, not a diminishing upward force against the rest pose. */
function standingReach(contacts: Record<LimbId, LimbContact>, surface: ClimbSurface, root: Vector3, intent: BodyIntent): BodyPose | null {
  const normal = surface.normal.clone().normalize(), right = surface.up.clone().cross(normal).normalize();
  const up = normal.clone().cross(right).normalize();
  const current = bodyPoseAtRoot(contacts, surface, root);
  const side = intent.limb.startsWith('left') ? 'left' : 'right';
  const wrist = contactJointTarget({ ...contacts[intent.limb], point: intent.point, orientation: intent.orientation });
  let best: BodyPose | null = null, bestCost = Infinity;
  for (const limb of ['leftFoot', 'rightFoot'] as const) {
    const foot = contacts[limb];
    if (!supports(foot, limb) || foot.quality < .25) continue;
    const hip = current.hips[limb === 'leftFoot' ? 'left' : 'right'];
    const ankle = contactJointTarget(foot);
    if (ankle.clone().sub(hip).dot(up) > .12) continue;
    const goal = root.clone();
    // Put weight over the shoe before extending. A modest lean follows the reach,
    // but neither the opposite nor same-side foot is privileged unconditionally.
    const lean = MathUtils.clamp(wrist.clone().sub(ankle).dot(right) * .12, -.10, .10);
    goal.addScaledVector(right, ankle.dot(right) + lean - goal.dot(right));
    const depth = foot.point.clone().sub(surface.origin).dot(normal) + .26;
    goal.addScaledVector(normal, depth - goal.clone().sub(surface.origin).dot(normal));
    const hipOffset = hip.clone().sub(root);
    const sideways = goal.clone().add(hipOffset).sub(ankle).projectOnPlane(up).lengthSq();
    const extension = LEG_REACH - REACH_MARGIN;
    const standHeight = ankle.dot(up) + Math.sqrt(Math.max(0, extension * extension - sideways)) - hipOffset.dot(up);
    goal.addScaledVector(up, standHeight - goal.dot(up));
    let candidate = constrainBodyRoot(contacts, surface, goal);
    const preserveReach = isHand(intent.limb) && !contacts[intent.limb].planted
      && candidate.shoulders[side].distanceTo(wrist) < ARM_REACH - .004;
    const shoulderOffset = current.shoulders[side].clone().sub(root);
    // Ascend the intersection of planted-limb reach spheres. This allows small
    // hip adjustments at extension and stops at the stance's physical ceiling,
    // independent of how high the pointer happens to be.
    for (let i = 0; i < 16; i++) {
      const proposed = candidate.root.clone().addScaledVector(up, .08);
      // Keep an already reachable mouse target within reach while standing.
      if (preserveReach) {
        const delta = wrist.clone().sub(proposed).sub(shoulderOffset), distance = delta.length();
        if (distance > ARM_REACH - REACH_MARGIN) proposed.addScaledVector(delta, 1 - (ARM_REACH - REACH_MARGIN) / distance);
      }
      let higher = constrainBodyRoot(contacts, surface, proposed);
      if (preserveReach) for (let correction = 0; correction < 8; correction++) {
        const delta = wrist.clone().sub(higher.root).sub(shoulderOffset), distance = delta.length();
        if (distance <= ARM_REACH - REACH_MARGIN + .0001) break;
        higher = constrainBodyRoot(contacts, surface, higher.root.clone().addScaledVector(delta, 1 - (ARM_REACH - REACH_MARGIN) / distance));
      }
      if (!higher.feasible || higher.root.dot(up) <= candidate.root.dot(up) + .00001) break;
      candidate = higher;
    }
    if (!candidate.feasible || candidate.root.clone().sub(root).dot(up) < -.015) continue;
    const cost = -candidate.root.dot(up) + candidate.shoulders[side].distanceTo(wrist) * .03
      + (isHand(intent.limb) && !contacts[intent.limb].planted ? Math.max(0, candidate.shoulders[side].distanceTo(wrist) - (ARM_REACH - REACH_MARGIN)) * 2 : 0)
      + Math.abs(candidate.centerOfMass.clone().sub(ankle).dot(right)) * .15
      + (1 - foot.quality) * .18;
    if (cost < bestCost) { best = candidate; bestCost = cost; }
  }
  if (!best) return null;
  // The spring integrator supplies acceleration and speed limits. Limit the rise
  // while the hips are still far across from the chosen support column.
  const across = Math.abs(best.root.clone().sub(root).dot(right));
  const rise = best.root.clone().sub(root).dot(up);
  if (rise > 0) best.root.addScaledVector(up, -rise * MathUtils.clamp((across - .08) / .35, 0, .85));
  return constrainBodyRoot(contacts, surface, best.root);
}

/** Nearest feasible root; used after inertial integration, without a pose tween. */
export function constrainBodyRoot(contacts: Record<LimbId, LimbContact>, surface: ClimbSurface, proposedRoot: Vector3): BodyPose {
  const { joints } = offsets(contacts, surface);
  const active = LIMBS.filter(limb => supports(contacts[limb], limb));
  const centers = active.map(limb => ({ point: contactJointTarget(contacts[limb]).sub(joints[limb]), radius: (isHand(limb) ? ARM_REACH : LEG_REACH) - REACH_MARGIN }));
  const normal = surface.normal.clone().normalize(), root = proposedRoot.clone();
  for (let iteration = 0; iteration < 32; iteration++) {
    for (const constraint of centers) {
      const delta = root.clone().sub(constraint.point), distance = delta.length();
      if (distance > constraint.radius) root.addScaledVector(delta, -(distance - constraint.radius) / distance);
    }
    const depth = root.clone().sub(surface.origin).dot(normal);
    root.addScaledVector(normal, MathUtils.clamp(depth, .255, surface.material==='rock'?1.1:.69) - depth);
    root.y = Math.max(0, root.y);
  }
  return bodyPoseAtRoot(contacts, surface, root);
}

/** A fresh force target each frame, biased by the currently aimed free limb. */
export function solveContinuousBodyPose(contacts: Record<LimbId, LimbContact>, surface: ClimbSurface, previousRoot: Vector3, intent: BodyIntent | null, support: number): BodyPose {
  if (intent?.drive) {
    const standing = standingReach(contacts, surface, previousRoot, intent);
    if (standing) return standing;
  }
  const normal = surface.normal.clone().normalize(), right = surface.up.clone().cross(normal).normalize();
  const up = normal.clone().cross(right).normalize();
  const active = LIMBS.filter(limb => supports(contacts[limb], limb));
  const hands = active.filter(isHand), feet = active.filter(limb => !isHand(limb));
  const center = (limbs: LimbId[]) => limbs.reduce((sum, limb) => sum.add(contacts[limb].point), new Vector3()).divideScalar(limbs.length);
  const desired = previousRoot.clone();
  if (active.length) {
    const handsCenter = hands.length ? center(hands) : null, feetCenter = feet.length ? center(feet) : null;
    let across = previousRoot.dot(right), height = previousRoot.dot(up);
    if (handsCenter && feetCenter) {
      across = handsCenter.dot(right) * .58 + feetCenter.dot(right) * .42;
      height = (handsCenter.dot(up) - 1.27) * .58 + (feetCenter.dot(up) - .25) * .42;
    } else if (handsCenter) { across = handsCenter.dot(right); height = handsCenter.dot(up) - 1.29; }
    else if (feetCenter) { across = feetCenter.dot(right); height = feetCenter.dot(up) - .22; }
    desired.addScaledVector(right, (across - previousRoot.dot(right)) * .58);
    desired.addScaledVector(up, (height - previousRoot.dot(up)) * .58);
    const averageDepth = active.reduce((sum, limb) => sum + contacts[limb].point.clone().sub(surface.origin).dot(normal), 0) / active.length;
    const overhang = Math.max(0, Math.sin(surface.angle)), slab = Math.max(0, -Math.sin(surface.angle));
    const hipDepth = averageDepth + .345 + overhang * .16 - slab * .045;
    desired.addScaledVector(normal, (hipDepth - desired.clone().sub(surface.origin).dot(normal)) * .62);
  }
  if (intent) {
    const current = bodyPoseAtRoot(contacts, surface, previousRoot);
    const side = intent.limb.startsWith('left') ? 'left' : 'right';
    const anchor = isHand(intent.limb) ? current.shoulders[side] : current.hips[side];
    const target = { ...contacts[intent.limb], point: intent.point, orientation: intent.orientation };
    const delta = contactJointTarget(target).sub(anchor);
    const length = delta.length(), comfortable = isHand(intent.limb) ? .49 : .58;
    if (length > comfortable) {
      const pull = delta.multiplyScalar(Math.min(isHand(intent.limb) ? .42 : .28, length - comfortable) / Math.max(.001, length));
      desired.addScaledVector(pull.clone().projectOnPlane(normal), isHand(intent.limb) ? .92 : .66);
      desired.addScaledVector(normal, pull.dot(normal) * .3);
    }
  }
  // Continuous weight settling is stronger without feet and on a strained reach.
  const overhangLoad = Math.max(0, Math.sin(surface.angle));
  desired.addScaledVector(up, -(.006 + (1 - MathUtils.clamp(support, 0, 1)) * .038 + (intent?.effort ?? 0) * .026 + overhangLoad * .035));
  const result = constrainBodyRoot(contacts, surface, desired);
  result.strain = Math.max(result.strain, (intent?.effort ?? 0) * .88);
  return result;
}
