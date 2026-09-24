import { MathUtils, Quaternion, Vector3 } from 'three';
import { ARM_REACH, LEG_REACH, contactJointTarget } from './BodyPoseSolver';
import { LIMBS, isHand } from './types';
import type { BodyPose, ClimbSurface, LimbContact, LimbId } from './types';

/** Velocity-driven free limbs. Targets never become a scheduled animation. */
export class LimbTargetController {
  private velocities = Object.fromEntries(LIMBS.map(limb => [limb, new Vector3()])) as Record<LimbId, Vector3>;
  reset(limb?: LimbId): void { for (const id of limb ? [limb] : LIMBS) this.velocities[id].set(0, 0, 0); }

  follow(contact: LimbContact, desired: Vector3, orientation: Quaternion, body: BodyPose, surface: ClimbSurface, dt: number): void {
    const velocity = this.velocities[contact.limb];
    const acceleration = desired.clone().sub(contact.point).multiplyScalar(isHand(contact.limb) ? 72 : 52).addScaledVector(velocity, -15);
    velocity.addScaledVector(acceleration, dt).clampLength(0, isHand(contact.limb) ? 2.5 : 1.9);
    contact.point.addScaledVector(velocity, dt);
    contact.orientation.slerp(orientation, 1 - Math.exp(-dt * 15));
    this.constrain(contact, body, surface);
  }

  constrain(contact: LimbContact, body: BodyPose, surface: ClimbSurface): void {
    const side = contact.limb.startsWith('left') ? 'left' : 'right';
    const hand = isHand(contact.limb), anchor = hand ? body.shoulders[side] : body.hips[side];
    const normal = surface.normal.clone().normalize(), up = surface.up.clone().normalize();
    if (!hand) {
      const highStep = contact.point.clone().sub(body.pelvis).dot(up);
      if (highStep > .28) contact.point.addScaledVector(up, .28 - highStep);
    }
    const depth = contact.point.clone().sub(surface.origin).dot(normal);
    if (depth < .006) contact.point.addScaledVector(normal, .006 - depth);
    const offset = contactJointTarget(contact).sub(contact.point);
    const delta = contact.point.clone().add(offset).sub(anchor), length = delta.length();
    const distance = MathUtils.clamp(length, hand ? .035 : .045, (hand ? ARM_REACH : LEG_REACH) - .004);
    if (Math.abs(distance - length) > .000001) {
      if (length < .000001) delta.copy(up).negate(); else delta.divideScalar(length);
      contact.point.copy(anchor).addScaledVector(delta, distance).sub(offset);
      // Damping prevents stored velocity from throwing the limb past a boundary.
      this.velocities[contact.limb].multiplyScalar(.55);
    }
  }
}
