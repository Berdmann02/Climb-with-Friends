import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Character } from '../src/player/Character';
import { ClimbingController } from '../src/climbing/ClimbingController';
import { createDefaultRoute } from '../src/routes/defaults';
import { LIMBS } from '../src/climbing/types';
import type { ClimbSurface, LimbId } from '../src/climbing/types';

export const gymSurface: ClimbSurface = { id: 'gym-main', origin: new Vector3(), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0),
  angle: 0, friction: .66, material: 'plywood', bounds: { id: 'gym-main', minX: -5, maxX: 5, minY: .3, maxY: 8, z: 0 } };
function setup() {
  const character = new Character('#cb7965');
  const controller = new ClimbingController(character), route = createDefaultRoute('gym');
  controller.setRoute(route); controller.setSurface(gymSurface);
  expect(controller.start()).toBe(true);
  const request = (limb: LimbId, index: number) => {
    controller.selectLimb(limb); const hold = route.holds[index];
    return controller.requestMove({ hold, point: new Vector3(...hold.position), normal: gymSurface.normal });
  };
  const tick = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) controller.update(1 / 60, i / 60); };
  return { character, controller, route, request, tick };
}

describe('manual four-limb climbing authority', () => {
  it('completes the authored gym route through an explicit hand-and-foot sequence', () => {
    const { controller, request, tick } = setup();
    // Deliberate individual moves, including intermediate feet on former hand
    // holds. This is a fixed playthrough fixture, never a runtime route planner.
    const moves: [LimbId, number][] = [
      ['rightHand', 4], ['leftFoot', 5], ['rightFoot', 1], ['leftHand', 6],
      ['rightFoot', 7], ['leftFoot', 0], ['leftFoot', 9], ['rightHand', 8],
      ['rightFoot', 4], ['rightFoot', 11], ['leftHand', 10],
      ['leftFoot', 6], ['leftFoot', 13], ['rightHand', 12],
      ['rightFoot', 8], ['rightFoot', 15], ['leftHand', 14],
      ['leftFoot', 10], ['leftFoot', 17], ['rightHand', 16],
      ['rightFoot', 12], ['rightFoot', 19], ['leftHand', 18],
      ['leftFoot', 14], ['leftFoot', 21], ['rightHand', 20],
      ['rightFoot', 16], ['rightFoot', 23], ['leftHand', 22],
    ];
    for (const [limb, hold] of moves) {
      const result = request(limb, hold);
      expect(result.accepted, `${limb} -> hold ${hold}: ${result.reason}; root ${controller.body.root.toArray()}`).toBe(true);
      tick(.9);
      expect(controller.active).toBe(true);
      expect(controller.body.feasible).toBe(true);
    }
    expect(controller.finished).toBe(true);
    controller.stop(); expect(controller.finished).toBe(false);
  });
  it('never advances or relocates contacts without a selected-limb request', () => {
    const { controller, tick } = setup();
    const points = LIMBS.map(l => controller.contacts[l].point.clone());
    tick(8);
    expect(controller.active).toBe(true);
    for (let i = 0; i < LIMBS.length; i++) expect(controller.contacts[LIMBS[i]].point.equals(points[i])).toBe(true);
    expect(controller.finished).toBe(false);
  });
  it('moves only the chosen hand through prepare/release/move/contact/settle phases', () => {
    const { controller, character, request } = setup();
    const points = Object.fromEntries(LIMBS.map(l => [l, controller.contacts[l].point.clone()])) as Record<LimbId, Vector3>;
    expect(request('rightHand', 4).accepted).toBe(true);
    const phases = new Set([controller.phase]);
    for (let i = 0; i < 55; i++) {
      controller.update(1 / 60, i / 60); character.update(1 / 60, i / 60, 'climb'); phases.add(controller.phase);
      for (const limb of ['leftHand', 'leftFoot', 'rightFoot'] as const) {
        expect(controller.contacts[limb].point.distanceTo(points[limb])).toBe(0);
        expect(character.contactWorldPosition(limb).distanceTo(points[limb])).toBeLessThan(.014);
      }
    }
    expect([...phases]).toEqual(expect.arrayContaining(['prepare', 'release', 'moving', 'contact', 'settling', 'selected']));
    expect(controller.contacts.rightHand.holdId).toBe('gym-hold-4');
    expect(controller.contacts.rightHand.point.distanceTo(points.rightHand)).toBeGreaterThan(.4);
  });
  it('allows selection of the next limb while rejecting overlapping movement', () => {
    const { controller, request, tick } = setup();
    expect(request('rightHand', 4).accepted).toBe(true);
    controller.selectLimb('leftFoot');
    expect(controller.selectedLimb).toBe('leftFoot');
    expect(request('leftFoot', 5).accepted).toBe(false);
    tick(.85);
    expect(request('leftFoot', 5).accepted).toBe(true);
  });
  it('rejects impossible reaches without moving another hand, foot or the root', () => {
    const { controller, character, request } = setup();
    const root = character.group.position.clone();
    const contacts = LIMBS.map(l => controller.contacts[l].point.clone());
    expect(request('leftHand', 22).accepted).toBe(false);
    expect(character.group.position.equals(root)).toBe(true);
    for (let i = 0; i < LIMBS.length; i++) expect(controller.contacts[LIMBS[i]].point.equals(contacts[i])).toBe(true);
  });
  it('requires holds for hands but accepts a manually placed foot smear', () => {
    const { controller, tick } = setup();
    const request = { point: new Vector3(-.22, .68, .012), normal: new Vector3(0, 0, 1) };
    controller.selectLimb('leftHand'); expect(controller.requestMove(request).accepted).toBe(false);
    controller.selectLimb('leftFoot'); expect(controller.requestMove(request).accepted).toBe(true); tick(.85);
    expect(controller.contacts.leftFoot.kind).toBe('smear');
    expect(controller.contacts.leftFoot.holdId).toBeNull();
  });
  it('allows an explicitly extended free leg to flag without gaining foothold support', () => {
    const { controller, tick } = setup();
    controller.selectLimb('leftFoot');
    expect(controller.requestMove({ point: new Vector3(-.65, .67, .25), normal: gymSurface.normal }).accepted).toBe(true);
    tick(.85);
    expect(controller.contacts.leftFoot.kind).toBe('flag');
    expect(controller.contacts.leftFoot.planted).toBe(false);
    expect(controller.stability.loads.leftFoot).toBe(0);
  });
  it('gives a recoverable grace period, then slips and reports a fall when support is removed', () => {
    const { controller, character, tick } = setup();
    const root = character.group.position.clone();
    controller.selectLimb('leftFoot'); controller.releaseSelected();
    expect(character.group.position.equals(root)).toBe(true);
    controller.selectLimb('rightFoot'); controller.releaseSelected();
    controller.selectLimb('leftHand'); controller.releaseSelected();
    tick(2);
    expect(controller.active).toBe(true);
    expect(controller.didFall).toBe(false);
    tick(1.1);
    expect(Object.values(controller.contacts).some(c => c.state === 'slipping')).toBe(true);
    tick(.6);
    expect(controller.active).toBe(false);
    expect(controller.didFall).toBe(true);
    expect(controller.phase).toBe('falling');
    controller.stop(); expect(controller.didFall).toBe(false); expect(controller.finished).toBe(false);
  });
  it('enters hand-only authored starts with initial smears inside the wall bounds', () => {
    const { controller, route } = setup();
    controller.setRoute({ ...route, holds: route.holds.filter(h => h.type !== 'foothold') });
    expect(controller.start()).toBe(true);
    expect(controller.contacts.leftFoot.kind).toBe('smear');
    expect(controller.contacts.leftFoot.point.y).toBeGreaterThan(gymSurface.bounds.minY);
  });
});
