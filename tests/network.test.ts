import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalRoomTransport, validateSnapshot } from '../src/network/LocalRoomTransport';
import type { PlayerSnapshot } from '../src/network/LocalRoomTransport';
import { createDefaultRoute } from '../src/routes/defaults';

const openTransports: LocalRoomTransport[] = [];
let roomCounter = 0;
function transport(room: string, playerId: string): LocalRoomTransport {
  const connection = new LocalRoomTransport(room, playerId);
  openTransports.push(connection);
  return connection;
}
function snapshot(playerId = 'a'): PlayerSnapshot {
  return {
    playerId, scene: 'outdoor', role: 'climber', state: 'climb', position: [0.4, 8, 0.7], rotation: Math.PI,
    routeId: 'outdoor-welcome-route', activeHoldId: 'outdoor-hold-12',
    rope: { slack: 0.6, tension: 0.1, clippedProtection: [0, 1], action: 'feed' },
  };
}
afterEach(() => { for (const connection of openTransports.splice(0)) connection.close(); vi.unstubAllGlobals(); });

describe('semantic multiplayer foundation', () => {
  it('validates and independently copies only meaningful player and rope state', () => {
    const input = { ...snapshot(), renderer: { mesh: 'must not be synchronized' } };
    const result = validateSnapshot(input);
    expect(result).toEqual(snapshot());
    expect('renderer' in result).toBe(false);
    result.position[0] = 40;
    result.rope!.clippedProtection.push(2);
    expect(input.position[0]).toBe(0.4);
    expect(input.rope!.clippedProtection).toEqual([0, 1]);
    expect(() => validateSnapshot({ ...input, position: [Infinity, 0, 0] })).toThrow();
    expect(() => validateSnapshot({ ...input, rope: { ...input.rope, tension: 2 } })).toThrow();
  });

  it('discovers peers, elects consistent authority, and transmits player snapshots', async () => {
    const room = `test-${++roomCounter}`;
    const a = transport(room, 'a'), b = transport(room, 'b');
    await vi.waitFor(() => { expect(a.peerIds).toEqual(['b']); expect(b.peerIds).toEqual(['a']); });
    expect(a.authorityId).toBe('a'); expect(b.authorityId).toBe('a');
    const received = vi.fn(); b.onSnapshot(received);
    a.publishSnapshot(snapshot('a'));
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith(snapshot('a'), 'a'));
    expect(() => b.publishSnapshot(snapshot('a'))).toThrow('own character');
  });

  it('allows only authority route updates and keeps separate rooms isolated', async () => {
    const room = `test-${++roomCounter}`;
    const a = transport(room, 'a'), b = transport(room, 'b'), other = transport(`${room}-other`, 'c');
    await vi.waitFor(() => expect(b.peerIds).toContain('a'));
    const received = vi.fn(), isolated = vi.fn(); b.onRoute(received); other.onRoute(isolated);
    const route = createDefaultRoute('gym');
    expect(() => b.publishRoute(route)).toThrow('authority');
    a.publishRoute(route);
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith(route, 'a'));
    expect(isolated).not.toHaveBeenCalled(); expect(other.peerIds).toEqual([]);
  });

  it('handles disconnect and reconnect using the same semantic player ID', async () => {
    const room = `test-${++roomCounter}`;
    const a = transport(room, 'a'), b = transport(room, 'b');
    await vi.waitFor(() => expect(b.peerIds).toContain('a'));
    a.close();
    await vi.waitFor(() => expect(b.peerIds).toEqual([]));
    expect(b.isAuthority).toBe(true);
    const replacement = transport(room, 'a');
    await vi.waitFor(() => expect(b.peerIds).toContain('a'));
    const received = vi.fn(); b.onSnapshot(received); replacement.publishSnapshot(snapshot('a'));
    await vi.waitFor(() => expect(received).toHaveBeenCalledOnce());
    expect(b.authorityId).toBe('a');
  });

  it('is optional when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const local = transport(`test-${++roomCounter}`, 'a');
    expect(local.available).toBe(false);
    expect(local.peerIds).toEqual([]);
    expect(() => local.publishSnapshot(snapshot())).not.toThrow();
    expect(() => new LocalRoomTransport('invalid room name', 'a')).toThrow('Room names');
  });
});
