import { MathUtils } from 'three';
import { surfaceRight, updateContactQuality } from './ContactSolver';
import { LEG_REACH, contactJointTarget } from './BodyPoseSolver';
import { LIMBS, isHand } from './types';
import type { BodyPose, ClimbSurface, LimbContact, LimbId, StabilityLevel, StabilityResult } from './types';

const clamp = MathUtils.clamp;
const record = (): Record<LimbId, number> => ({ leftHand: 0, rightHand: 0, leftFoot: 0, rightFoot: 0 });

/** Quasi-static game support estimate. Flags affect torque, never vertical load. */
export function evaluateStability(contacts: Record<LimbId, LimbContact>, body: BodyPose, surface: ClimbSurface): StabilityResult {
  const qualities = record(), loads = record();
  const right = surfaceRight(surface);
  const hands: LimbId[] = [], feet: LimbId[] = [], flags: LimbId[] = [];
  let handCapacity = 0, footCapacity = 0;
  for (const limb of LIMBS) {
    const contact = contacts[limb];
    // A moving free foot has mass even though it has no ground/hold reaction.
    // Its current position changes torque continuously, never vertical support.
    if (!isHand(limb) && !contact.planted && contact.state !== 'slipping') {
      const hip = body.hips[limb === 'leftFoot' ? 'left' : 'right'];
      const reach = contactJointTarget(contact).distanceTo(hip) / LEG_REACH;
      qualities[limb] = clamp(1 - Math.max(0, reach - .88) * 1.6, 0, 1) * (body.feasible ? 1 : .65);
      flags.push(limb); continue;
    }
    qualities[limb] = updateContactQuality(contact, body, surface);
    if (contact.kind === 'flag' && contact.state !== 'moving' && contact.state !== 'free') { flags.push(limb); continue; }
    if (!contact.planted || qualities[limb] <= .025 || contact.kind === 'free' || contact.state === 'slipping') continue;
    if (isHand(limb)) { hands.push(limb); handCapacity += qualities[limb]; }
    else { feet.push(limb); footCapacity += qualities[limb]; }
  }
  const angle = Math.sin(surface.angle);
  const footEfficiency = clamp(1 - Math.max(0, angle) * .65 + Math.max(0, -angle) * .3, .25, 1.2);
  const support = clamp(footCapacity / 1.55 * footEfficiency, 0, 1);
  // A lone foot can take real weight, but is less forgiving of lateral displacement.
  const footWeight = feet.length ? clamp(support * .78, .1, .85) : 0;
  const handWeight = 1 - footWeight;
  for (const limb of feet) loads[limb] = footWeight * qualities[limb] / footCapacity;
  for (const limb of hands) loads[limb] = handWeight * qualities[limb] / handCapacity;

  let supportX = 0, supportWeight = 0;
  for (const limb of [...hands, ...feet]) {
    const weight = qualities[limb] * (isHand(limb) ? .45 : 1);
    supportX += contacts[limb].point.dot(right) * weight;
    supportWeight += weight;
  }
  supportX = supportWeight ? supportX / supportWeight : body.centerOfMass.dot(right);
  const lever = body.centerOfMass.dot(right) - supportX;
  let flagMoment = 0;
  for (const limb of flags) {
    const extension = contacts[limb].point.clone().sub(body.pelvis).dot(right);
    flagMoment += extension * .18 * qualities[limb];
  }
  const correctedLever = lever + flagMoment;
  const flagContribution = clamp((Math.abs(lever) - Math.abs(correctedLever)) / .55, -.22, .22);
  const imbalance = clamp(Math.abs(correctedLever) / (feet.length >= 2 ? .65 : .5), 0, 1);
  const averageHandQuality = hands.length ? handCapacity / hands.length : 0;
  const handStrain = hands.length ? clamp(handWeight / Math.max(.3, handCapacity) * .9
    + Math.max(0, angle) * .19 + body.strain * .17 + imbalance * .12, 0, 1) : (support > .85 && angle < -.2 ? .1 : 1);
  const handSecurity = clamp(handCapacity / 1.65, 0, 1);
  let score = .10 + handSecurity * .40 + support * .40
    + (hands.length > 0 && feet.length > 0 ? .12 : 0)
    - imbalance * .22 - handStrain * .12 - Math.max(0, angle) * .055;
  if (hands.length === 1 && feet.length >= 1) score += .07; // Stable three-point moves are expected, not a penalty timer.
  if (hands.length === 0) score *= angle < -.2 ? .78 : .16;
  if (hands.length === 1 && feet.length === 0) score *= .6;
  if (!hands.length && !feet.length) score = 0;
  if (!body.feasible) score -= .13;
  // Directionally poor hands cannot silently inherit a jug's nominal strength.
  if (hands.length && averageHandQuality < .25) score -= .09;
  score = clamp(score, 0, 1);
  const level: StabilityLevel = score > .72 ? 'stable' : score > .52 ? 'strained' : score > .32 ? 'unstable' : score > .12 ? 'critical' : 'fall';
  const loaded = [...hands, ...feet];
  const weakest = loaded.length ? loaded.reduce((a, b) => qualities[a] / Math.max(.1, loads[a]) < qualities[b] / Math.max(.1, loads[b]) ? a : b) : null;
  return { score, level, handStrain, imbalance, support, flagContribution, weakest, qualities, loads };
}
