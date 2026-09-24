import type { HoldData, HoldType, RouteData, WallSpec } from '../core/contracts';
import type { GripType } from '../climbing/types';

const HOLD_TYPES = new Set<HoldType>(['jug', 'crimp', 'sloper', 'pinch', 'foothold']);
const GRIP_TYPES = new Set<GripType>(['jug', 'crimp', 'sloper', 'pinch', 'foothold', 'sidepull', 'undercling', 'pocket', 'edge']);
const COLOR = /^#[0-9a-f]{6}$/i;
const STORAGE_KEY = 'climb-with-friends.routes.v1';
type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} is missing or too long.`);
  return value.trim();
}

function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} is outside its allowed range.`);
  return value;
}

function color(value: unknown, label: string): string {
  if (typeof value !== 'string' || !COLOR.test(value)) throw new Error(`${label} must be a six-digit hex color.`);
  return value.toLowerCase();
}

/** Incomplete routes are valid drafts; playability is evaluated by the climbing system. */
export function validateRoute(data: unknown): RouteData {
  const source = object(data, 'Route');
  if (source.version !== 1) throw new Error('Unsupported route version. Expected version 1.');
  const wallId = text(source.wallId, 'Wall ID');
  if (!Array.isArray(source.holds) || source.holds.length > 600) throw new Error('A route must have an array of at most 600 holds.');
  const ids = new Set<string>();
  const holds = source.holds.map((value, index): HoldData => {
    const hold = object(value, `Hold ${index + 1}`);
    const id = text(hold.id, 'Hold ID');
    if (ids.has(id)) throw new Error(`Duplicate hold ID: ${id}`);
    ids.add(id);
    if (!HOLD_TYPES.has(hold.type as HoldType)) throw new Error(`Unknown hold type: ${String(hold.type)}`);
    if (hold.grip !== undefined && !GRIP_TYPES.has(hold.grip as GripType)) throw new Error(`Unknown grip type: ${String(hold.grip)}`);
    const metadata: Partial<HoldData> = {};
    if (hold.grip !== undefined) metadata.grip = hold.grip as GripType;
    for (const key of ['gripPoint', 'gripNormal', 'gripDirection'] as const) {
      const value = hold[key];
      if (value === undefined) continue;
      if (!Array.isArray(value) || value.length !== 3) throw new Error(`${key} needs three coordinates.`);
      const vector = value.map(n => number(n, key, -2, 2)) as [number, number, number];
      if (key !== 'gripPoint' && Math.hypot(...vector) < .001) throw new Error(`${key} must not be a zero vector.`);
      metadata[key] = vector;
    }
    for (const key of ['gripStrength', 'friction'] as const) if (hold[key] !== undefined) metadata[key] = number(hold[key], key, 0, 1);
    for (const key of ['handAllowed', 'footAllowed'] as const) {
      if (hold[key] !== undefined && typeof hold[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
      if (hold[key] !== undefined) metadata[key] = hold[key] as boolean;
    }
    if (!Array.isArray(hold.position) || hold.position.length !== 3) throw new Error('Hold position needs three coordinates.');
    if (hold.wallId !== wallId) throw new Error('All holds must belong to the route wall.');
    if (typeof hold.start !== 'boolean' || typeof hold.finish !== 'boolean') throw new Error('Hold start and finish flags must be booleans.');
    return {
      id, type: hold.type as HoldType, asset: text(hold.asset, 'Hold asset'),
      position: hold.position.map((n) => number(n, 'Hold coordinate', -1000, 1000)) as [number, number, number],
      rotation: number(hold.rotation, 'Hold rotation', -Math.PI * 200, Math.PI * 200),
      scale: number(hold.scale, 'Hold scale', 0.3, 2), color: color(hold.color, 'Hold color'),
      start: hold.start, finish: hold.finish, wallId, ...metadata,
    };
  });
  const createdAt = text(source.createdAt, 'Creation date', 40);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Creation date must be a valid date.');
  return {
    version: 1, id: text(source.id, 'Route ID'), name: text(source.name, 'Route name', 80),
    creator: text(source.creator, 'Creator', 80), color: color(source.color, 'Route color'), holds, wallId,
    grade: typeof source.grade === 'string' && source.grade.length <= 30 ? source.grade : '', createdAt,
  };
}

export function isHoldWithinWall(hold: Pick<HoldData, 'position' | 'wallId'>, wall: WallSpec, margin = 0.08): boolean {
  const [x, y, z] = hold.position;
  return hold.wallId === wall.id && [x, y, z].every(Number.isFinite)
    && x >= wall.minX + margin && x <= wall.maxX - margin
    && y >= wall.minY + margin && y <= wall.maxY - margin
    && Math.abs(z - wall.z) <= 0.5;
}

export function serializeRoute(route: RouteData): string { return JSON.stringify(validateRoute(route), null, 2); }
export function deserializeRoute(json: string): RouteData {
  if (json.length > 500_000) throw new Error('Route file is too large.');
  return validateRoute(JSON.parse(json));
}

/** Browser persistence with an in-memory fallback for private browsing and headless tests. */
export class RouteStore {
  private static fallback = new Map<string, string>();
  private storage: StorageAdapter | null;
  storageAvailable = true;

  constructor(storage?: StorageAdapter | null) {
    try { this.storage = storage === undefined ? globalThis.localStorage ?? null : storage; }
    catch { this.storage = null; }
    this.storageAvailable = this.storage !== null;
  }

  private read(): Map<string, string> {
    const records = new Map<string, string>();
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (Array.isArray(saved)) for (const candidate of saved) {
          try { const route = validateRoute(candidate); records.set(route.id, JSON.stringify(route)); }
          catch { /* A damaged record must not hide every other saved route. */ }
        }
      }
    } catch { this.storageAvailable = false; }
    // Session edits are newer than persisted data when a write fails (for example quota).
    for (const [id, json] of RouteStore.fallback) records.set(id, json);
    return records;
  }

  list(): RouteData[] {
    return [...this.read().values()].map(deserializeRoute).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  save(route: RouteData): void {
    const valid = validateRoute(route);
    const records = this.read();
    records.set(valid.id, JSON.stringify(valid));
    RouteStore.fallback = records;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify([...records.values()].map((json) => JSON.parse(json))));
    } catch { this.storageAvailable = false; }
  }

  load(id: string): RouteData | null {
    const json = this.read().get(id);
    return json ? deserializeRoute(json) : null;
  }
}
