import { describe, expect, it } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { RopeController, ropeSag, sampleRopeSegment } from '../src/rope/RopeController';

describe('rope constraints', () => {
  it('passes exactly through protection points while bowing between them', () => {
    const a = new Vector3(0, 1, 3), b = new Vector3(0, 5, 0.4);
    expect(sampleRopeSegment(a, b, 0.6, 0, 0, 2).distanceTo(a)).toBeLessThan(1e-10);
    expect(sampleRopeSegment(a, b, 0.6, 0, 1, 2).distanceTo(b)).toBeLessThan(1e-10);
    const middle = sampleRopeSegment(a, b, 0.6, 0, 0.5, 2);
    expect(middle.y).toBeLessThan(3);
    expect(middle.distanceTo(a.clone().lerp(b, 0.5))).toBeGreaterThan(0.2);
  });

  it('reduces sag under tension and stays bounded with excessive slack', () => {
    expect(ropeSag(5, 0.8, 1)).toBeLessThan(ropeSag(5, 0.8, 0) * 0.1);
    expect(ropeSag(200, 900, 0)).toBe(3);
    expect(ropeSag(5, -2, 0)).toBe(0);
  });

  it('reuses GPU buffers and creates finite geometry through multiple clips', () => {
    const rope = new RopeController();
    const mesh = rope.group.children[0] as Mesh;
    const positions = mesh.geometry.getAttribute('position');
    const points = [new Vector3(0, 1, 3), new Vector3(0, 5, 0.4), new Vector3(0.3, 9, 0.4), new Vector3(0.5, 10, 0.7)];
    for (let frame = 0; frame < 120; frame++) rope.update(1 / 60, points, 0.7, frame / 120, frame / 60);
    expect(mesh.geometry.getAttribute('position')).toBe(positions);
    expect(mesh.geometry.drawRange.count).toBe(3 * 18 * 6 * 6);
    expect([...positions.array].every(Number.isFinite)).toBe(true);
    // The center of the six vertices at ring 18 is the first quickdraw constraint.
    const center = new Vector3();
    for (let side = 0; side < 6; side++) center.add(new Vector3().fromBufferAttribute(positions, 18 * 6 + side));
    expect(center.divideScalar(6).distanceTo(points[1])).toBeLessThan(1e-6);
    rope.updateBrake([new Vector3(0, 1, 3), new Vector3(0.2, 0.1, 3.2)], 1);
    expect((rope.group.children[1] as Mesh).geometry.drawRange.count).toBeGreaterThan(0);
    rope.dispose();
  });

  it('hides empty paths and handles coincident anchors without NaNs', () => {
    const rope = new RopeController();
    const mesh = rope.group.children[0] as Mesh;
    rope.update(0.016, [], 0, 0, 0);
    expect(mesh.geometry.drawRange.count).toBe(0);
    rope.update(0.016, [new Vector3(), new Vector3()], 0, 0, 0);
    expect([...mesh.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    rope.dispose();
  });
});
