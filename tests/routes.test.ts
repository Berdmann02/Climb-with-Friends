import { describe, expect, it } from 'vitest';
import { createDefaultRoute } from '../src/routes/defaults';
import { deserializeRoute, isHoldWithinWall, RouteStore, serializeRoute, validateRoute } from '../src/routes/RouteStore';

describe('route schema and persistence', () => {
  it('round trips every hold and its gameplay metadata', () => {
    const route = createDefaultRoute('gym');
    route.holds[0].rotation = 1.25;
    route.holds[0].scale = 1.4;
    const restored = deserializeRoute(serializeRoute(route));
    expect(restored).toEqual(route);
    restored.holds[0].position[0] = 9;
    expect(route.holds[0].position[0]).not.toBe(9);
  });

  it('preserves optional directional grip metadata and rejects unknown grips', () => {
    const route = createDefaultRoute('gym');
    const tagged = { ...route, holds: route.holds.map((hold, i) => i === 0 ? { ...hold, grip: 'undercling' } : hold) };
    const restored = deserializeRoute(JSON.stringify(tagged));
    expect((restored.holds[0] as unknown as { grip: string }).grip).toBe('undercling');
    expect(() => validateRoute({ ...route, holds: [{ ...route.holds[0], grip: 'glue' }] })).toThrow('grip type');
    const authored = { ...route, holds: [{ ...route.holds[0], gripPoint: [.02, .03, .05], gripNormal: [0, 0, 1], gripDirection: [0, -1, 0], gripStrength: .8, friction: .7, handAllowed: true, footAllowed: false }] };
    expect(deserializeRoute(JSON.stringify(authored)).holds).toEqual(authored.holds);
    expect(() => validateRoute({ ...route, holds: [{ ...route.holds[0], gripNormal: [0, 0, 0] }] })).toThrow('zero vector');
    expect(() => validateRoute({ ...route, holds: [{ ...route.holds[0], gripStrength: 7 }] })).toThrow('range');
    expect(() => validateRoute({ ...route, holds: [{ ...route.holds[0], footAllowed: 'yes' }] })).toThrow('boolean');
  });

  it('rejects corrupt data and unsupported future formats', () => {
    const route = createDefaultRoute('gym');
    expect(() => validateRoute({ ...route, version: 2 })).toThrow('version');
    expect(() => deserializeRoute('{broken')).toThrow();
    expect(() => validateRoute({ ...route, holds: [{ ...route.holds[0], type: 'mystery' }] })).toThrow('hold type');
    expect(() => validateRoute({ ...route, holds: [{ ...route.holds[0], position: [NaN, 1, 0] }] })).toThrow('range');
    expect(() => validateRoute({ ...route, holds: [{ ...route.holds[0], wallId: 'other' }] })).toThrow('route wall');
    expect(() => validateRoute({ ...route, holds: [route.holds[0], route.holds[0]] })).toThrow('Duplicate');
  });

  it('allows drafts while keeping actual wall placement bounded', () => {
    const route = createDefaultRoute('gym');
    expect(validateRoute({ ...route, holds: [] }).holds).toHaveLength(0);
    const wall = { id: 'gym-main', minX: -3, maxX: 3, minY: 0, maxY: 8, z: 0 };
    expect(isHoldWithinWall(route.holds[0], wall)).toBe(true);
    expect(isHoldWithinWall({ ...route.holds[0], position: [4, 2, 0.1] }, wall)).toBe(false);
    expect(isHoldWithinWall({ ...route.holds[0], position: [0, 2, 3] }, wall)).toBe(false);
  });

  it('saves changes under one ID and restores them from browser storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const store = new RouteStore(storage);
    const route = { ...createDefaultRoute('gym'), id: 'persistence-test', name: 'My first route' };
    store.save(route);
    route.name = 'Edited route';
    route.holds.pop();
    store.save(route);
    expect(new RouteStore(storage).load(route.id)).toEqual(route);
    expect(store.list().filter((entry) => entry.id === route.id)).toHaveLength(1);
    expect(store.load('missing')).toBeNull();
  });

  it('survives storage denial without losing the active session route', () => {
    const store = new RouteStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } });
    const route = { ...createDefaultRoute('gym'), id: 'fallback-test' };
    store.save(route);
    expect(store.load(route.id)).toEqual(route);
    expect(store.storageAvailable).toBe(false);
  });

  it('keeps newer session edits when storage fills after an earlier successful save', () => {
    let persisted: string | null = null, full = false;
    const store = new RouteStore({ getItem: () => persisted, setItem: (_key, value) => { if (full) throw new Error('quota'); persisted = value; } });
    const route = { ...createDefaultRoute('gym'), id: 'quota-after-save', name: 'First version' };
    store.save(route); full = true;
    route.name = 'Latest version'; store.save(route);
    expect(store.load(route.id)?.name).toBe('Latest version');
    expect(store.storageAvailable).toBe(false);
  });

  it('default routes have reachable vertical increments and one finish', () => {
    for (const location of ['gym', 'outdoor'] as const) {
      const route = validateRoute(createDefaultRoute(location));
      const hands = route.holds.filter((hold) => hold.type !== 'foothold').sort((a, b) => a.position[1] - b.position[1]);
      expect(route.holds.filter((hold) => hold.start)).toHaveLength(2);
      expect(route.holds.filter((hold) => hold.finish)).toHaveLength(1);
      for (let i = 1; i < hands.length; i++) expect(hands[i].position[1] - hands[i - 1].position[1]).toBeLessThanOrEqual(0.551);
    }
  });
});
