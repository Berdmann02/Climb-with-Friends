import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { HoldData, RouteData } from '../src/core/contracts';
import { solveTwoBone } from '../src/climbing/ik';
import { Character } from '../src/player/Character';
import { ClimbingController } from '../src/climbing/ClimbingController';
import { createDefaultRoute } from '../src/routes/defaults';

function makeRoute(): RouteData {
  const hands: HoldData[] = Array.from({ length: 8 }, (_, i) => ({
    id: `hand-${i}`, type: 'jug', asset: 'hold-jug',
    position: [i % 2 ? .28 : -.28, i < 2 ? 1.35 : 1.35 + (i - 1) * .5, .05],
    rotation: 0, scale: 1, color: '#d97359', start: i < 2, finish: i === 7, wallId: 'wall',
  }));
  return { version: 1, id: 'route', name: 'Fixture', creator: 'test', color: '#d97359', holds: hands, wallId: 'wall', grade: 'easy', createdAt: '2026-09-22' };
}
function settle(controller: ClimbingController): void { for (let i = 0; i < 100; i++) controller.update(1 / 60, i / 60); }

describe('two-bone IK', () => {
  it('keeps both bone lengths fixed for reachable and unreachable targets', () => {
    for (const target of [new Vector3(.4, .1, .2), new Vector3(3, 2, 1), new Vector3()]) {
      const origin = new Vector3();
      const result = solveTwoBone(origin, target, new Vector3(0, 0, 1), .32, .32);
      expect(result.joint.distanceTo(origin)).toBeCloseTo(.32, 6);
      expect(result.joint.distanceTo(result.end)).toBeCloseTo(.32, 6);
      expect(result.end.length()).toBeLessThanOrEqual(.64);
    }
  });
  it('uses a stable alternate bend plane when the pole is collinear', () => {
    const result = solveTwoBone(new Vector3(), new Vector3(0, -1, 0), new Vector3(0, -2, 0), .38, .42);
    expect(result.joint.toArray().every(Number.isFinite)).toBe(true);
    expect(result.end.toArray().every(Number.isFinite)).toBe(true);
  });
});

describe('contact-driven climbing', () => {
  it.each(['gym', 'outdoor'] as const)('can complete the authored %s route with supported reaches', (location) => {
    const controller = new ClimbingController(new Character('#cb7965'));
    const route = createDefaultRoute(location);
    controller.setRoute(route);
    expect(controller.start()).toBe(true);
    for (let i = 0; i < route.holds.length && !controller.finished; i++) {
      expect(controller.move('up'), `stuck at ${controller.currentHoldId}`).toBe(true);
      settle(controller);
    }
    expect(controller.finished).toBe(true);
  });
  it('starts at marked holds and advances an alternating route to its finish', () => {
    const character = new Character('#cb7965');
    const controller = new ClimbingController(character);
    controller.setRoute(makeRoute());
    expect(controller.start()).toBe(true);
    expect(controller.active).toBe(true);
    expect(controller.height).toBeGreaterThanOrEqual(0);
    for (let i = 2; i < 8; i++) {
      expect(controller.move('up')).toBe(true);
      settle(controller);
      expect(controller.currentHoldId).toBe(`hand-${i}`);
    }
    expect(controller.finished).toBe(true);
    expect(controller.height).toBeGreaterThan(2.5);
  });
  it('keeps the supporting hand planted during a move and rejects overlapping commands', () => {
    const character = new Character('#cb7965');
    const controller = new ClimbingController(character);
    controller.setRoute(makeRoute()); controller.start();
    const right = controller.targets.rightHand.clone();
    expect(controller.reachHold('hand-2')).toBe(true);
    expect(controller.move('up')).toBe(false);
    for (let i = 0; i < 20; i++) {
      controller.update(1 / 60, i / 60);
      character.update(1 / 60, i / 60, 'climb');
      const renderedHand = character.group.getObjectByName('rightHand')!.getWorldPosition(new Vector3());
      expect(renderedHand.distanceTo(right)).toBeLessThan(.018);
    }
    expect(controller.targets.rightHand.distanceTo(right)).toBeLessThan(.00001);
  });
  it('rejects unreachable moves and empty routes without changing the contact', () => {
    const controller = new ClimbingController(new Character('#cb7965'));
    const route = makeRoute();
    route.holds.push({ ...route.holds[0], id: 'far', start: false, position: [5, 9, .05] });
    controller.setRoute(route); controller.start();
    const original = controller.currentHoldId;
    expect(controller.reachHold('far')).toBe(false);
    expect(controller.currentHoldId).toBe(original);
    controller.setRoute({ ...route, holds: [] });
    expect(controller.start()).toBe(false);
    expect(controller.active).toBe(false);
  });
  it('stops cleanly while a move is pending', () => {
    const controller = new ClimbingController(new Character('#cb7965'));
    controller.setRoute(makeRoute()); controller.start(); controller.move('up'); controller.stop();
    const height = controller.height;
    controller.update(1, 1);
    expect(controller.height).toBe(height);
    expect(controller.move('up')).toBe(false);
  });
});
