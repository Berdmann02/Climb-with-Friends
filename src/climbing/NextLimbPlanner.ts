import { MathUtils } from 'three';
import { surfaceRight } from './ContactSolver';
import { ARM_REACH, LEG_REACH, contactJointTarget } from './BodyPoseSolver';
import { LIMBS, isHand } from './types';
import type { BodyPose, ClimbSurface, LimbContact, LimbId, StabilityResult } from './types';

const clamp = MathUtils.clamp;
const opposite: Record<LimbId, LimbId> = {
  leftHand: 'rightHand', rightHand: 'leftHand', leftFoot: 'rightFoot', rightFoot: 'leftFoot',
};

/**
 * Which limb should move next, judged from the pose the solvers already produced.
 * A limb is a good candidate when it is cramped, carries little load, and letting
 * go of it leaves the remaining three points holding the body.
 */
export function planNextLimb(
  contacts: Record<LimbId, LimbContact>, body: BodyPose, surface: ClimbSurface,
  balance: StabilityResult, justMoved: LimbId | null,
): LimbId | null {
  const right = surfaceRight(surface);
  const up = surface.up.clone().normalize();
  const plantedFeet = LIMBS.filter(limb => !isHand(limb) && contacts[limb].planted).length;
  const plantedHands = LIMBS.filter(limb => isHand(limb) && contacts[limb].planted).length;
  let best: LimbId | null = null, bestScore = -Infinity;
  for (const limb of LIMBS) {
    const contact = contacts[limb];
    if (!contact.planted) continue;
    const hand = isHand(limb);
    // Releasing the last hand, or the only foot under an overhang, is never the move.
    if (hand && plantedHands < 2) continue;
    if (!hand && plantedFeet < 2 && surface.angle > .2) continue;
    const anchor = hand ? body.shoulders[limb.startsWith('left') ? 'left' : 'right'] : body.hips[limb.startsWith('left') ? 'left' : 'right'];
    const reach = anchor.distanceTo(contactJointTarget(contact)) / (hand ? ARM_REACH : LEG_REACH);
    // A limb already near full extension has the most to gain from moving.
    const cramped = clamp(reach - .55, 0, .5) * 1.7 + clamp(.42 - reach, 0, .42) * .8;
    const free = 1 - clamp(contact.load, 0, 1);
    const weak = 1 - clamp(balance.qualities[limb] ?? contact.quality, 0, 1);
    // Climbing goes up: a low limb is more interesting than one already high.
    const rise = clamp(.5 - (contact.point.clone().sub(body.centerOfMass).dot(up) + .5), 0, 1);
    // Prefer moving the limb on the lightly weighted side, and keep the pattern
    // alternating hand/foot and left/right the way a real sequence does.
    const lever = body.centerOfMass.dot(right) - contact.point.dot(right);
    const across = clamp(Math.abs(lever) / .6, 0, 1) * (hand ? .5 : .35);
    const alternation = justMoved === null ? 0
      : (isHand(justMoved) !== hand ? .55 : 0) + (opposite[justMoved] === limb ? .3 : 0) + (justMoved === limb ? -.9 : 0);
    // Hands lead when the feet are already high; feet lead when they are trailing.
    const lead = hand ? clamp(balance.support - .35, 0, .5) : clamp(.7 - balance.support, 0, .7) * 1.2;
    const score = cramped * 1.25 + free * .8 + weak * .7 + rise * .6 + across + alternation + lead
      - clamp(balance.loads[limb] ?? 0, 0, 1) * .5;
    if (score > bestScore) { bestScore = score; best = limb; }
  }
  return best;
}
