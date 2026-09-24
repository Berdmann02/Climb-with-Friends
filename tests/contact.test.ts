import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createContact, gripForHold, updateContactQuality } from '../src/climbing/ContactSolver';
import type { BodyPose, ClimbSurface } from '../src/climbing/types';
import type { HoldData } from '../src/core/contracts';

const surface: ClimbSurface = { id: 'wall', origin: new Vector3(), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), angle: 0, friction: .7, material: 'plywood', bounds: { id: 'wall', minX: -4, maxX: 4, minY: 0, maxY: 8, z: 0 } };
function body(x = 0, comY = 1.05): BodyPose {
  return { root: new Vector3(x, 0, .45), pelvis: new Vector3(x, .8, .43), centerOfMass: new Vector3(x, comY, .45), torsoRotation: new Vector3(), hipRotation: new Vector3(), shoulders: { left: new Vector3(x - .2, 1.245, .45), right: new Vector3(x + .2, 1.245, .45) }, hips: { left: new Vector3(x - .115, .8, .43), right: new Vector3(x + .115, .8, .43) }, strain: 0, feasible: true };
}
function hold(rotation = 0): HoldData { return { id: 'jug', type: 'jug', asset: 'hold-jug', position: [0, 1.35, .12], rotation, scale: 1, color: '#de806a', start: true, finish: false, wallId: 'wall' }; }
const request = (h: HoldData) => ({ point: new Vector3(...h.position), normal: surface.normal, hold: h });

describe('wall contacts and grip direction', () => {
  it('requires real reachable hand holds and uses a physical lip contact', () => {
    expect(createContact('leftHand', { point: new Vector3(0, 1.4, 0), normal: surface.normal }, surface, body())).toBeNull();
    const h = hold(), c = createContact('leftHand', request(h), surface, body())!;
    expect(c.kind).toBe('hold'); expect(c.planted).toBe(true);
    expect(c.point.y).toBeCloseTo(1.395); expect(c.point.z).toBeCloseTo(.175);
    const fixed = c.point.clone(); updateContactQuality(c, body(.15), surface); expect(c.point.equals(fixed)).toBe(true);
    expect(createContact('leftHand', request({ ...h, position: [3, 4, 0] }), surface, body())).toBeNull();
    expect(createContact('leftHand', request({ ...h, type: 'foothold' }), surface, body())).toBeNull();
  });

  it('turns rotated jugs into directional sidepulls with rotated palms', () => {
    const h = hold(Math.PI / 2), c = createContact('rightHand', request(h), surface, body())!;
    expect(gripForHold(h).grip).toBe('sidepull'); expect(c.direction.x).toBeCloseTo(1);
    const good = body(.32, 1.25), bad = body(-.32, 1.25);
    expect(updateContactQuality(c, good, surface)).toBeGreaterThan(updateContactQuality(c, bad, surface) * 2);
    const up = new Vector3(0, 1, 0).applyQuaternion(c.orientation);
    expect(up.x).toBeLessThan(-.9);
  });

  it('underclings favor an upward body load rather than a downward hang', () => {
    const h = hold(Math.PI), c = createContact('leftHand', request(h), surface, body())!;
    expect(c.grip).toBe('undercling'); expect(c.direction.y).toBeCloseTo(1);
    expect(updateContactQuality(c, body(0, 1.6), surface)).toBeGreaterThan(updateContactQuality(c, body(0, .9), surface) * 3);
  });

  it('aligns explicit sidepull palms with their effective directional grip', () => {
    const h = { ...hold(0), grip: 'sidepull' as const }, c = createContact('leftHand', request(h), surface, body())!;
    expect(c.direction.x).toBeCloseTo(1);
    expect(new Vector3(0, 1, 0).applyQuaternion(c.orientation).x).toBeCloseTo(-1);
  });

  it('keeps a toe on the usable top edge without turning shoes upside down', () => {
    const h: HoldData = { ...hold(Math.PI), position: [0, .3, .12] };
    const c = createContact('leftFoot', request(h), surface, body())!;
    expect(c.point.y).toBeGreaterThan(h.position[1]);
    expect(new Vector3(0, 1, 0).applyQuaternion(c.orientation).y).toBeGreaterThan(.9);
  });

  it('transforms authored contact points and vectors and respects limb permissions', () => {
    const h: HoldData = { ...hold(Math.PI / 2), gripPoint: [.04, .02, .08], gripNormal: [0, .2, 1], gripDirection: [0, -1, .2], gripStrength: .7, friction: .65 };
    const c = createContact('leftHand', request(h), surface, body())!;
    expect(c.point.x).toBeCloseTo(-.02); expect(c.point.y).toBeCloseTo(1.39); expect(c.point.z).toBeCloseTo(.2);
    expect(c.normal.x).toBeLessThan(0); expect(c.direction.z).toBeGreaterThan(0);
    expect(new Vector3(0, 0, 1).applyQuaternion(c.orientation).distanceTo(c.normal)).toBeLessThan(1e-8);
    expect(c.strength).toBe(.7); expect(c.friction).toBe(.65);
    expect(createContact('leftHand', request({ ...h, handAllowed: false }), surface, body())).toBeNull();
    expect(createContact('leftFoot', request({ ...h, footAllowed: false }), surface, body())).toBeNull();
  });

  it('small grips lose quality under concentrated hand load', () => {
    const h: HoldData = { ...hold(), type: 'crimp' };
    const c = createContact('leftHand', request(h), surface, body())!;
    const relaxed = updateContactQuality({ ...c, load: .15 }, body(), surface);
    const overloaded = updateContactQuality({ ...c, load: .95 }, body(), surface);
    expect(overloaded).toBeLessThan(relaxed * .8);
  });

  it('smears benefit from rough rock and slab angle and weaken on overhangs', () => {
    const req = { point: new Vector3(-.2, .26, 0), normal: surface.normal };
    const c = createContact('leftFoot', req, surface, body())!;
    expect(c.kind).toBe('smear'); expect(c.holdId).toBeNull();
    const slab = updateContactQuality(c, body(), { ...surface, angle: -.35, material: 'rock' });
    const vertical = updateContactQuality(c, body(), surface);
    const overhang = updateContactQuality(c, body(), { ...surface, angle: .55 });
    expect(slab).toBeGreaterThan(vertical); expect(overhang).toBeLessThan(vertical * .5);
  });

  it('extended feet become unloaded flags and free/moving contacts have no quality', () => {
    const c = createContact('leftFoot', { point: new Vector3(-.72, .48, .1), normal: surface.normal }, surface, body())!;
    expect(c.kind).toBe('flag'); expect(c.planted).toBe(false); expect(c.load).toBe(0);
    expect(updateContactQuality({ ...c, state: 'moving' }, body(), surface)).toBe(0);
  });
});
