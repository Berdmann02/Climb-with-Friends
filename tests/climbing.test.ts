import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { solveTwoBone } from '../src/climbing/ik';

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

