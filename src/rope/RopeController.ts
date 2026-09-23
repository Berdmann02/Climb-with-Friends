import { BufferAttribute, BufferGeometry, Color, DataTexture, Group, Mesh, MeshStandardMaterial, RepeatWrapping, Vector3 } from 'three';

const RINGS_PER_SPAN = 18;
const SIDES = 6;
const MAX_ANCHORS = 48;
const MAX_RINGS = (MAX_ANCHORS - 1) * RINGS_PER_SPAN + 1;
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);

/** Approximate catenary depth from extra rope length, kept bounded for visual stability. */
export function ropeSag(distance: number, slack: number, tension: number): number {
  const length = Math.max(0, distance);
  const extra = Math.max(0, slack);
  return Math.min(3, Math.sqrt(Math.max(0, (length + extra) ** 2 - length ** 2)) * 0.43)
    * (1 - Math.min(1, Math.max(0, tension)) * 0.96);
}

/** Endpoints are exact, so every quickdraw remains a hard constraint. */
export function sampleRopeSegment(start: Vector3, end: Vector3, slack: number, tension: number, t: number, time: number, target = new Vector3()): Vector3 {
  const distance = start.distanceTo(end);
  const sag = ropeSag(distance, slack, tension);
  const arc = Math.sin(Math.PI * t);
  const vertical = distance > 0.0001 ? Math.abs(end.y - start.y) / distance : 0;
  target.lerpVectors(start, end, t);
  target.y -= arc * sag;
  // Nearly vertical slack hangs in a shallow loop in front of the rock face.
  target.z += arc * sag * vertical * 0.52;
  target.x += arc * Math.sin(time * 1.25 + t * 4 + start.y * 0.21) * (0.012 + sag * 0.055) * (1 - tension);
  return target;
}

function ropeMaterial(): MeshStandardMaterial {
  // A tiny repeating textile pattern keeps the rope readable without a large asset.
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  const base = new Color('#e9ba65');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const thread = (x + y * 2) % 12 < 2 ? 0.53 : (x - y + size) % 8 === 0 ? 0.88 : 1;
    const i = (y * size + x) * 4;
    pixels[i] = base.r * 255 * thread; pixels[i + 1] = base.g * 255 * thread; pixels[i + 2] = base.b * 255 * thread; pixels[i + 3] = 255;
  }
  const map = new DataTexture(pixels, size, size);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ color: '#ffd69a', map, roughness: 0.82, metalness: 0 });
}

class RopeTube {
  readonly mesh: Mesh;
  private geometry = new BufferGeometry();
  private positions = new Float32Array(MAX_RINGS * SIDES * 3);
  private normals = new Float32Array(MAX_RINGS * SIDES * 3);
  private uvs = new Float32Array(MAX_RINGS * SIDES * 2);
  private centers = new Float32Array(MAX_RINGS * 3);
  private point = new Vector3();
  private before = new Vector3();
  private after = new Vector3();
  private tangent = new Vector3();
  private normal = new Vector3();
  private binormal = new Vector3();

  constructor(material: MeshStandardMaterial, private radius: number) {
    const indices = new Uint32Array((MAX_RINGS - 1) * SIDES * 6);
    let cursor = 0;
    for (let ring = 0; ring < MAX_RINGS - 1; ring++) for (let side = 0; side < SIDES; side++) {
      const a = ring * SIDES + side, b = ring * SIDES + (side + 1) % SIDES;
      indices.set([a, a + SIDES, b, b, a + SIDES, b + SIDES], cursor); cursor += 6;
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.normals, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(this.uvs, 2));
    this.geometry.setIndex(new BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
  }

  update(points: Vector3[], slack: number, tension: number, time: number): void {
    if (points.length < 2) { this.geometry.setDrawRange(0, 0); return; }
    if (points.length > MAX_ANCHORS) throw new Error(`Rope supports at most ${MAX_ANCHORS} constraint points.`);
    tension = Math.max(0, Math.min(1, tension));
    let totalLength = 0;
    for (let i = 1; i < points.length; i++) totalLength += points[i - 1].distanceTo(points[i]);
    let ringCount = 0;
    for (let span = 0; span < points.length - 1; span++) {
      const distance = points[span].distanceTo(points[span + 1]);
      const share = totalLength > 0 ? distance / totalLength : 0;
      for (let ring = span === 0 ? 0 : 1; ring <= RINGS_PER_SPAN; ring++) {
        sampleRopeSegment(points[span], points[span + 1], Math.max(0, slack) * share, tension, ring / RINGS_PER_SPAN, time, this.point);
        this.point.toArray(this.centers, ringCount++ * 3);
      }
    }
    let textureDistance = 0;
    for (let ring = 0; ring < ringCount; ring++) {
      this.point.fromArray(this.centers, ring * 3);
      this.before.fromArray(this.centers, Math.max(0, ring - 1) * 3);
      this.after.fromArray(this.centers, Math.min(ringCount - 1, ring + 1) * 3);
      this.tangent.subVectors(this.after, this.before);
      if (this.tangent.lengthSq() < 1e-10) this.tangent.set(0, 1, 0);
      this.tangent.normalize();
      this.normal.crossVectors(this.tangent, Math.abs(this.tangent.y) > 0.94 ? RIGHT : UP).normalize();
      this.binormal.crossVectors(this.tangent, this.normal).normalize();
      if (ring) textureDistance += this.point.distanceTo(this.before);
      for (let side = 0; side < SIDES; side++) {
        const angle = side / SIDES * Math.PI * 2;
        const cosine = Math.cos(angle), sine = Math.sin(angle);
        const nx = this.normal.x * cosine + this.binormal.x * sine;
        const ny = this.normal.y * cosine + this.binormal.y * sine;
        const nz = this.normal.z * cosine + this.binormal.z * sine;
        const index = (ring * SIDES + side) * 3;
        this.positions[index] = this.point.x + nx * this.radius;
        this.positions[index + 1] = this.point.y + ny * this.radius;
        this.positions[index + 2] = this.point.z + nz * this.radius;
        this.normals[index] = nx; this.normals[index + 1] = ny; this.normals[index + 2] = nz;
        const uvIndex = (ring * SIDES + side) * 2;
        this.uvs[uvIndex] = side / SIDES; this.uvs[uvIndex + 1] = textureDistance * 6;
      }
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('normal').needsUpdate = true;
    this.geometry.getAttribute('uv').needsUpdate = true;
    this.geometry.setDrawRange(0, (ringCount - 1) * SIDES * 6);
  }

  dispose(): void { this.geometry.dispose(); }
}

/** Stable constrained spline rope: one allocation, with explicit quickdraw waypoints. */
export class RopeController {
  readonly group = new Group();
  private material = ropeMaterial();
  private main = new RopeTube(this.material, 0.028);
  private brake = new RopeTube(this.material, 0.026);

  constructor() { this.group.name = 'climbing-rope'; this.group.add(this.main.mesh, this.brake.mesh); }
  update(_dt: number, points: Vector3[], slack: number, tension: number, time: number): void {
    this.main.update(points, slack, tension, time);
  }
  updateBrake(points: Vector3[], time: number, slack = 0.1): void { this.brake.update(points, slack, 0.15, time); }
  dispose(): void { this.main.dispose(); this.brake.dispose(); this.material.map?.dispose(); this.material.dispose(); }
}
