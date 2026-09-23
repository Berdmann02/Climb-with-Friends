import { Vector3 } from 'three';

/** Analytic two-bone IK. The endpoint is clamped so bones never stretch. */
export function solveTwoBone(
  origin: Vector3, target: Vector3, pole: Vector3,
  upperLength: number, lowerLength: number,
): { joint: Vector3; end: Vector3 } {
  const axis = target.clone().sub(origin);
  const requestedDistance = axis.length();
  if (requestedDistance < 1e-6) axis.set(0, -1, 0);
  else axis.divideScalar(requestedDistance);
  const distance = Math.max(Math.abs(upperLength - lowerLength) + .001,
    Math.min(upperLength + lowerLength - .001, requestedDistance));
  const bend = pole.clone().sub(origin);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < 1e-7) {
    bend.set(Math.abs(axis.y) < .9 ? 0 : 1, Math.abs(axis.y) < .9 ? 1 : 0, 0);
    bend.addScaledVector(axis, -bend.dot(axis));
  }
  bend.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  return {
    joint: origin.clone().addScaledVector(axis, along).addScaledVector(bend, height),
    end: origin.clone().addScaledVector(axis, distance),
  };
}
