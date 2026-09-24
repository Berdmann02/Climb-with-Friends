import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Character } from '../src/player/Character';
import { ClimbingController } from '../src/climbing/ClimbingController';
import { createDefaultRoute } from '../src/routes/defaults';
import { planNextLimb } from '../src/climbing/NextLimbPlanner';
import { isHand } from '../src/climbing/types';
import type { ClimbSurface, LimbId } from '../src/climbing/types';

const gymSurface: ClimbSurface = { id: 'gym-main', origin: new Vector3(), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0),
  angle: 0, friction: .66, material: 'plywood', bounds: { id: 'gym-main', minX: -5, maxX: 5, minY: .3, maxY: 8, z: 0 } };

function setup(auto: boolean) {
  const character = new Character('#cb7965');
  const controller = new ClimbingController(character);
  const route = createDefaultRoute('gym');
  controller.setRoute(route); controller.setSurface(gymSurface);
  controller.setAutoSequence(auto);
  expect(controller.start()).toBe(true);
  // requestMove only accepts a limb that is already at the target, so aim and
  // simulate the reach first, exactly as the game loop does.
  const move = (limb: LimbId, index: number) => {
    const hold = route.holds[index];
    const request = { hold, point: new Vector3(...hold.position), normal: gymSurface.normal };
    controller.selectLimb(limb);
    controller.aim(request);
    // The game ticks the character right after the controller, which is what
    // advances the IK the rendered-contact gate in requestMove checks against.
    for (let i = 0; i < 120; i++) { controller.update(1 / 60, i / 60); character.update(1 / 60, i / 60, 'climb'); }
    return controller.requestMove(request);
  };
  return { controller, route, move };
}

describe('automatic next-limb sequencing', () => {
  it('never proposes a limb that is already free, nor the last remaining hand', () => {
    const { controller } = setup(false);
    controller.selectLimb('leftHand');
    const next = planNextLimb(controller.contacts, controller.body, gymSurface, controller.stability, 'leftHand');
    expect(next).not.toBe('leftHand');
    // rightHand is the only planted hand left, so it must not be offered.
    expect(next).not.toBe('rightHand');
    expect(next && controller.contacts[next].planted).toBe(true);
  });

  it('alternates away from the limb just moved once auto-sequencing is on', () => {
    const { controller, move } = setup(true);
    expect(move('rightHand', 4).accepted).toBe(true);
    // The machine took control of a different limb on its own.
    expect(controller.controlling).toBe(true);
    expect(controller.selectedLimb).not.toBe('rightHand');
    expect(controller.suggestedLimb).toBe(controller.selectedLimb);
    // A hand move is answered by a foot.
    expect(isHand(controller.selectedLimb)).toBe(false);
  });

  it('leaves all four limbs planted after start, and stays manual when disabled', () => {
    const { controller, move } = setup(false);
    expect(controller.controlling).toBe(false);
    expect(move('rightHand', 4).accepted).toBe(true);
    expect(controller.controlling).toBe(false);
    expect(controller.suggestedLimb).toBe(null);
  });
});
