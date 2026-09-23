import type { LocationId, RouteData } from '../core/contracts';
import type { BelayAction } from '../belay/BelayController';
import { validateRoute } from '../routes/RouteStore';

/** Gameplay state, never renderer objects. This schema can later use a server transport. */
export interface PlayerSnapshot {
  playerId: string;
  scene: LocationId;
  role: 'climber' | 'belayer' | 'visitor';
  state: 'idle' | 'walk' | 'jog' | 'climb' | 'fall' | 'belay';
  position: [number, number, number];
  rotation: number;
  activeHoldId: string | null;
  routeId: string | null;
  rope?: { slack: number; tension: number; clippedProtection: number[]; action: BelayAction };
}

type Listener<T> = (value: T, senderId: string) => void;
type Message = { protocol: 1; roomId: string; senderId: string; sequence: number; kind: 'hello' | 'leave' | 'snapshot' | 'route'; payload?: unknown };

export interface RoomTransport {
  readonly roomId: string;
  readonly playerId: string;
  readonly authorityId: string;
  publishSnapshot(snapshot: PlayerSnapshot): void;
  publishRoute(route: RouteData): void;
  onSnapshot(listener: Listener<PlayerSnapshot>): () => void;
  onRoute(listener: Listener<RouteData>): () => void;
  close(): void;
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function validateSnapshot(value: unknown): PlayerSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid player snapshot.');
  const snapshot = value as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 120;
  if (!id(snapshot.playerId) || !['gym', 'outdoor'].includes(String(snapshot.scene))
    || !['climber', 'belayer', 'visitor'].includes(String(snapshot.role))
    || !['idle', 'walk', 'jog', 'climb', 'fall', 'belay'].includes(String(snapshot.state))
    || !Array.isArray(snapshot.position) || snapshot.position.length !== 3 || !snapshot.position.every((n) => finite(n, -2000, 2000))
    || !finite(snapshot.rotation, -1000, 1000)
    || !(snapshot.activeHoldId === null || id(snapshot.activeHoldId))
    || !(snapshot.routeId === null || id(snapshot.routeId))) throw new Error('Invalid player snapshot fields.');
  if (snapshot.rope !== undefined) {
    const rope = snapshot.rope as Record<string, unknown>;
    if (!rope || typeof rope !== 'object' || !finite(rope.slack, 0, 20) || !finite(rope.tension, 0, 1)
      || !['neutral', 'feed', 'take', 'lock', 'lower'].includes(String(rope.action))
      || !Array.isArray(rope.clippedProtection) || rope.clippedProtection.length > 48
      || !rope.clippedProtection.every((n) => finite(n, 0, 1000) && Number.isInteger(n))) throw new Error('Invalid rope snapshot.');
  }
  // Only gameplay fields cross the boundary; renderer objects and unknown data are discarded.
  const result: PlayerSnapshot = {
    playerId: snapshot.playerId, scene: snapshot.scene as LocationId,
    role: snapshot.role as PlayerSnapshot['role'], state: snapshot.state as PlayerSnapshot['state'],
    position: [...snapshot.position] as [number, number, number], rotation: snapshot.rotation,
    activeHoldId: snapshot.activeHoldId as string | null, routeId: snapshot.routeId as string | null,
  };
  if (snapshot.rope !== undefined) {
    const rope = snapshot.rope as NonNullable<PlayerSnapshot['rope']>;
    result.rope = { slack: rope.slack, tension: rope.tension, clippedProtection: [...rope.clippedProtection], action: rope.action };
  }
  return result;
}

/** Same-origin, same-browser room experiment. It does not provide internet multiplayer. */
export class LocalRoomTransport implements RoomTransport {
  private channel: BroadcastChannel | null = null;
  private sequence = 0;
  private receivedSequence = new Map<string, number>();
  private peers = new Map<string, number>();
  private snapshotListeners = new Set<Listener<PlayerSnapshot>>();
  private routeListeners = new Set<Listener<RouteData>>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(readonly roomId: string, readonly playerId: string) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(roomId)) throw new Error('Room names use 1–40 letters, numbers, underscores, or dashes.');
    if (!playerId || playerId.length > 120) throw new Error('A player ID is required.');
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(`juniper-climbing-room:${roomId}`);
        this.channel.onmessage = (event: MessageEvent<unknown>) => this.receive(event.data);
        this.send('hello');
        this.heartbeat = setInterval(() => this.send('hello'), 2500);
      }
    } catch { this.channel = null; }
  }

  get available(): boolean { return this.channel !== null && !this.closed; }
  get peerIds(): string[] {
    const now = Date.now();
    for (const [id, lastSeen] of this.peers) if (now - lastSeen > 8000) { this.peers.delete(id); this.receivedSequence.delete(id); }
    return [...this.peers.keys()];
  }
  /** Deterministic prototype authority; a future server should own room and rope state. */
  get authorityId(): string { return [this.playerId, ...this.peerIds].sort()[0]; }
  get isAuthority(): boolean { return this.authorityId === this.playerId; }

  private send(kind: Message['kind'], payload?: unknown): void {
    if (this.closed) return;
    this.channel?.postMessage({ protocol: 1, roomId: this.roomId, senderId: this.playerId, sequence: ++this.sequence, kind, payload } satisfies Message);
  }

  private receive(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const message = value as Message;
    if (message.protocol !== 1 || message.roomId !== this.roomId || typeof message.senderId !== 'string' || !message.senderId || message.senderId.length > 120
      || !['hello', 'leave', 'snapshot', 'route'].includes(message.kind)
      || message.senderId === this.playerId || !Number.isSafeInteger(message.sequence)
      || message.sequence <= (this.receivedSequence.get(message.senderId) ?? 0)) return;
    this.receivedSequence.set(message.senderId, message.sequence);
    const wasNew = !this.peers.has(message.senderId);
    if (message.kind === 'leave') { this.peers.delete(message.senderId); this.receivedSequence.delete(message.senderId); return; }
    this.peers.set(message.senderId, Date.now());
    if (message.kind === 'hello') { if (wasNew) this.send('hello'); return; }
    try {
      if (message.kind === 'snapshot') {
        const snapshot = validateSnapshot(message.payload);
        if (snapshot.playerId !== message.senderId) return;
        for (const listener of this.snapshotListeners) listener(snapshot, message.senderId);
      } else if (message.kind === 'route' && message.senderId === this.authorityId) {
        const route = validateRoute(message.payload);
        for (const listener of this.routeListeners) listener(route, message.senderId);
      }
    } catch { /* Invalid remote messages never reach gameplay code. */ }
  }

  publishSnapshot(snapshot: PlayerSnapshot): void {
    const valid = validateSnapshot(snapshot);
    if (valid.playerId !== this.playerId) throw new Error('A peer can only publish its own character.');
    this.send('snapshot', valid);
  }
  publishRoute(route: RouteData): void {
    if (!this.isAuthority) throw new Error('Only the room authority may publish route state.');
    this.send('route', validateRoute(route));
  }
  onSnapshot(listener: Listener<PlayerSnapshot>): () => void { this.snapshotListeners.add(listener); return () => this.snapshotListeners.delete(listener); }
  onRoute(listener: Listener<RouteData>): () => void { this.routeListeners.add(listener); return () => this.routeListeners.delete(listener); }
  close(): void {
    if (this.closed) return;
    this.send('leave'); this.closed = true;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.channel?.close(); this.channel = null;
    this.peers.clear(); this.snapshotListeners.clear(); this.routeListeners.clear();
  }
}
