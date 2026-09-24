import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { evaluateStability } from '../src/climbing/StabilitySolver';
import { LIMBS } from '../src/climbing/types';
import type { BodyPose, ClimbSurface, LimbContact, LimbId } from '../src/climbing/types';

const surface: ClimbSurface = { id: 'wall', origin: new Vector3(), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), angle: 0, friction: .7, material: 'plywood', bounds: { id: 'wall', minX: -4, maxX: 4, minY: 0, maxY: 8, z: 0 } };
function body(x = 0): BodyPose { return { root: new Vector3(x, 0, .42), pelvis: new Vector3(x, .8, .42), centerOfMass: new Vector3(x, 1.05, .42), torsoRotation: new Vector3(), hipRotation: new Vector3(), shoulders: { left: new Vector3(x - .2, 1.245, .42), right: new Vector3(x + .2, 1.245, .42) }, hips: { left: new Vector3(x - .115, .8, .42), right: new Vector3(x + .115, .8, .42) }, strain: 0, feasible: true }; }
function contacts(): Record<LimbId, LimbContact> {
  return Object.fromEntries(LIMBS.map(limb => { const hand = limb.endsWith('Hand'); return [limb, { limb, kind: 'hold', state: 'attached', point: new Vector3(limb.startsWith('left') ? -.25 : .25, hand ? 1.4 : .25, .16), normal: surface.normal.clone(), orientation: new Quaternion(), holdId: limb, grip: hand ? 'jug' : 'foothold', direction: new Vector3(0, -1, 0), strength: .98, friction: .9, quality: 1, load: 0, rotation: 0, planted: true }]; })) as Record<LimbId, LimbContact>;
}
function release(c: LimbContact) { c.kind = 'free'; c.state = 'free'; c.planted = false; }

describe('posture support and balance', () => {
  it('puts most load through good feet and supports a deliberate three-point move', () => {
    const c = contacts(), four = evaluateStability(c, body(), surface);
    expect(four.level).toBe('stable'); expect(four.loads.leftFoot + four.loads.rightFoot).toBeGreaterThan(.6);
    release(c.leftHand);
    const three = evaluateStability(c, body(), surface);
    expect(three.score).toBeGreaterThan(.72); expect(three.loads.leftHand).toBe(0);
    expect(three.loads.leftFoot + three.loads.rightFoot + three.loads.rightHand).toBeCloseTo(1);
  });

  it('hanging on arms increases strain and cannot score like a standing stance', () => {
    const c = contacts(), good = evaluateStability(c, body(), surface);
    release(c.leftFoot); release(c.rightFoot);
    const hang = evaluateStability(c, body(), surface);
    expect(hang.handStrain).toBeGreaterThan(good.handStrain * 3);
    expect(hang.score).toBeLessThan(.52); expect(hang.score).toBeGreaterThan(.12);
    expect(hang.support).toBe(0);
  });

  it('only counter-balancing flags improve torque; same-side flags can worsen it', () => {
    const c = contacts(), pose = body(.18);
    c.leftFoot.point.x = -.3;
    c.rightFoot.kind = 'flag'; c.rightFoot.state = 'light'; c.rightFoot.planted = false;
    c.rightFoot.point.set(-.43, .52, .15);
    const good = evaluateStability(c, pose, surface);
    c.rightFoot.point.set(.79, .52, .15);
    const bad = evaluateStability(c, pose, surface);
    expect(good.flagContribution).toBeGreaterThan(0); expect(bad.flagContribution).toBeLessThan(0);
    expect(good.imbalance).toBeLessThan(bad.imbalance); expect(good.score).toBeGreaterThan(bad.score);
    expect(good.loads.rightFoot).toBe(0); expect(bad.loads.rightFoot).toBe(0);
  });

  it('critical contact release produces a fall instead of support from free limbs', () => {
    const c = contacts(); for (const limb of LIMBS) release(c[limb]);
    const result = evaluateStability(c, body(), surface);
    expect(result.level).toBe('fall'); expect(result.score).toBe(0); expect(result.weakest).toBeNull();
    expect(Object.values(result.loads).every(load => load === 0)).toBe(true);
  });

  it('smear support falls on overhanging surfaces', () => {
    const c = contacts(); for (const limb of ['leftFoot', 'rightFoot'] as LimbId[]) { c[limb].kind = 'smear'; c[limb].friction = .7; }
    const slab = evaluateStability(c, body(), { ...surface, angle: -.3, material: 'rock' });
    const steep = evaluateStability(c, body(), { ...surface, angle: .6 });
    expect(slab.support).toBeGreaterThan(steep.support * 2); expect(slab.score).toBeGreaterThan(steep.score);
  });
});
