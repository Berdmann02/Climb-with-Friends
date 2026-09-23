import { MathUtils, Vector3 } from 'three';
import type { HoldData, PoseTargets, RouteData } from '../core/contracts';
import type { Character } from '../player/Character';

type Hand = 'leftHand' | 'rightHand';
type Foot = 'leftFoot' | 'rightFoot';
type Direction = 'up' | 'down' | 'left' | 'right';
interface Move {
  elapsed: number;
  duration: number;
  hand: Hand;
  hold: HoldData;
  from: PoseTargets;
  to: PoseTargets;
  origin: Vector3;
  destination: Vector3;
}
const HANDS: Hand[] = ['leftHand', 'rightHand'];
const FEET: Foot[] = ['leftFoot', 'rightFoot'];
const smooth = (v: number) => { const t = MathUtils.clamp(v, 0, 1); return t * t * (3 - 2 * t); };
const copyPose = (pose: PoseTargets): PoseTargets => ({
  leftHand: pose.leftHand.clone(), rightHand: pose.rightHand.clone(),
  leftFoot: pose.leftFoot.clone(), rightFoot: pose.rightFoot.clone(),
});

/** Contact-driven local authority. Inputs request moves; procedural animation handles limbs. */
export class ClimbingController {
  private route: RouteData | null = null;
  private running = false;
  private complete = false;
  private contactIds: Record<Hand, string | null> = { leftHand: null, rightHand: null };
  private lastHoldId: string | null = null;
  private transition: Move | null = null;
  private pose: PoseTargets = {
    leftHand: new Vector3(), rightHand: new Vector3(),
    leftFoot: new Vector3(), rightFoot: new Vector3(),
  };
  constructor(private readonly character: Character) {}
  get active(): boolean { return this.running; }
  get finished(): boolean { return this.complete; }
  get height(): number { return this.character.group.position.y; }
  get currentHoldId(): string | null { return this.lastHoldId; }
  get targets(): PoseTargets { return this.pose; }

  setRoute(route: RouteData): void {
    this.stop();
    this.route = route;
    this.complete = false;
    this.lastHoldId = null;
  }

  start(): boolean {
    const holds = this.route?.holds.filter(h => h.type !== 'foothold') ?? [];
    if (!holds.length) return false;
    const starts = holds.filter(h => h.start).sort((a, b) => a.position[0] - b.position[0]);
    const first = starts[0] ?? holds.reduce((a, b) => a.position[1] < b.position[1] ? a : b);
    const nearby = holds.filter(h => h.id !== first.id && Math.abs(h.position[1] - first.position[1]) < .65)
      .sort((a, b) => this.point(a).distanceTo(this.point(first)) - this.point(b).distanceTo(this.point(first)));
    let second = starts[1] ?? nearby[0] ?? first;
    if (this.point(first).distanceTo(this.point(second)) > .95) second = first;
    const left = first.position[0] <= second.position[0] ? first : second;
    const right = left === first ? second : first;
    this.pose.leftHand.copy(this.point(left));
    this.pose.rightHand.copy(this.point(right));
    // A single start hold may be matched by both hands, as on a large jug.
    if (left === right) { this.pose.leftHand.x -= .045; this.pose.rightHand.x += .045; }
    const root = this.rootFor(this.pose.leftHand, this.pose.rightHand);
    if (!this.canSupport(this.pose, root)) return false;
    this.character.group.position.copy(root);
    this.character.group.rotation.set(0, 0, 0);
    this.chooseFeet(this.pose, root);
    this.contactIds.leftHand = left.id;
    this.contactIds.rightHand = right.id;
    this.lastHoldId = left.position[1] > right.position[1] ? left.id : right.id;
    this.transition = null;
    this.running = true;
    this.complete = left.finish || right.finish;
    this.character.setClimbPose(this.pose);
    return true;
  }

  stop(): void { this.running = false; this.transition = null; }

  move(direction: Direction): boolean {
    if (!this.running || this.transition || !this.route) return false;
    const center = this.pose.leftHand.clone().add(this.pose.rightHand).multiplyScalar(.5);
    const top = Math.max(this.pose.leftHand.y, this.pose.rightHand.y);
    const bottom = Math.min(this.pose.leftHand.y, this.pose.rightHand.y);
    const candidates = this.route.holds.filter(h => h.type !== 'foothold' && !HANDS.some(hand => this.contactIds[hand] === h.id))
      .filter(h => direction === 'up' ? h.position[1] > top + .07
        : direction === 'down' ? h.position[1] < bottom - .07
          : direction === 'left' ? h.position[0] < center.x - .12 : h.position[0] > center.x + .12)
      .sort((a, b) => this.directionScore(a, center, direction) - this.directionScore(b, center, direction));
    for (const hold of candidates) if (this.reachHold(hold.id)) return true;
    return false;
  }

  reachableHoldIds(): string[] {
    if (!this.running || this.transition || !this.route) return [];
    return this.route.holds.filter(h => this.planReach(h) !== null).map(h => h.id);
  }

  reachHold(id: string): boolean {
    if (!this.running || this.transition || !this.route) return false;
    const hold = this.route.holds.find(h => h.id === id);
    if (!hold) return false;
    const plan = this.planReach(hold);
    if (!plan) return false;
    const distance = this.pose[plan.hand].distanceTo(plan.to[plan.hand]);
    this.transition = {
      ...plan, hold, elapsed: 0, duration: .82 + distance * .22,
      from: copyPose(this.pose), origin: this.character.group.position.clone(),
    };
    return true;
  }

  update(dt: number, _time: number): void {
    if (!this.running) return;
    const move = this.transition;
    if (move) {
      move.elapsed += Math.min(dt, .1);
      const progress = Math.min(1, move.elapsed / move.duration);
      // Hips load the supporting leg before the reach; body rises as that leg extends.
      const bodyProgress = smooth((progress - .14) / .78);
      this.character.group.position.lerpVectors(move.origin, move.destination, bodyProgress);
      this.character.group.position.y -= Math.sin(Math.PI * Math.min(progress / .35, 1)) * .025;
      const handProgress = smooth((progress - .08) / .57);
      this.pose[move.hand].lerpVectors(move.from[move.hand], move.to[move.hand], handProgress);
      // The reaching hand clears the wall slightly, then seats on the hold.
      this.pose[move.hand].z += Math.sin(handProgress * Math.PI) * .055;
      for (let i = 0; i < FEET.length; i++) {
        const foot = FEET[i];
        const phase = smooth((progress - (.44 + i * .12)) / .31);
        this.pose[foot].lerpVectors(move.from[foot], move.to[foot], phase);
        this.pose[foot].y += Math.sin(phase * Math.PI) * .085;
        this.pose[foot].z += Math.sin(phase * Math.PI) * .05;
      }
      if (progress >= 1) {
        this.pose = copyPose(move.to);
        this.character.group.position.copy(move.destination);
        this.contactIds[move.hand] = move.hold.id;
        this.lastHoldId = move.hold.id;
        this.complete = move.hold.finish;
        this.transition = null;
      }
    }
    this.character.setClimbPose(this.pose);
  }

  private point(hold: HoldData): Vector3 {
    return new Vector3(hold.position[0], hold.position[1], hold.position[2] + .055);
  }
  private directionScore(hold: HoldData, center: Vector3, direction: Direction): number {
    const delta = this.point(hold).sub(center);
    return direction === 'up' || direction === 'down' ? Math.abs(delta.y) + Math.abs(delta.x) * .26 : Math.abs(delta.x) + Math.abs(delta.y) * .75;
  }
  private rootFor(left: Vector3, right: Vector3): Vector3 {
    return new Vector3((left.x + right.x) * .5, Math.max(0, (left.y + right.y) * .5 - 1.27), Math.max(left.z, right.z) + .385);
  }
  private canSupport(pose: PoseTargets, root: Vector3): boolean {
    return HANDS.every(hand => {
      const shoulder = root.clone().add(new Vector3(hand === 'leftHand' ? -.202 : .202, 1.245, 0));
      return shoulder.distanceTo(pose[hand]) <= .633;
    });
  }
  private planReach(hold: HoldData): { hand: Hand; to: PoseTargets; destination: Vector3 } | null {
    if (hold.type === 'foothold' || HANDS.some(hand => this.contactIds[hand] === hold.id)) return null;
    const destination = this.point(hold);
    const sameRow = Math.abs(this.pose.leftHand.y - this.pose.rightHand.y) < .06;
    const lower: Hand = sameRow
      ? (destination.x < this.character.group.position.x ? 'leftHand' : 'rightHand')
      : this.pose.leftHand.y < this.pose.rightHand.y ? 'leftHand' : 'rightHand';
    const handOrder: Hand[] = [lower, lower === 'leftHand' ? 'rightHand' : 'leftHand'];
    for (const hand of handOrder) {
      if (this.pose[hand].distanceTo(destination) > 1.35) continue;
      const next = copyPose(this.pose);
      next[hand].copy(destination);
      const root = this.rootFor(next.leftHand, next.rightHand);
      if (Math.abs(root.x - this.character.group.position.x) > .65 || !this.canSupport(next, root)) continue;
      this.chooseFeet(next, root);
      return { hand, to: next, destination: root };
    }
    return null;
  }
  private chooseFeet(pose: PoseTargets, root: Vector3): void {
    const chosen = new Set<string>();
    for (const foot of FEET) {
      const side = foot === 'leftFoot' ? -1 : 1;
      const hip = root.clone().add(new Vector3(side * .115, .8, .015));
      const desired = root.clone().add(new Vector3(side * .20, .24, -.385));
      const candidates = (this.route?.holds ?? []).filter(h => {
        const point = this.point(h);
        return !chosen.has(h.id) && point.y < root.y + .52 && point.y >= Math.max(.08, root.y - .02)
          && point.distanceTo(hip) < .765 && Math.abs(point.x - hip.x) < .50;
      }).sort((a, b) => {
        const score = (h: HoldData) => this.point(h).distanceTo(desired) + (h.type === 'foothold' ? -.12 : 0);
        return score(a) - score(b);
      });
      if (candidates[0]) { pose[foot].copy(this.point(candidates[0])); chosen.add(candidates[0].id); }
      else {
        // A quiet smear supports routes without explicit feet; never invent visible holds.
        pose[foot].copy(desired);
        pose[foot].y = Math.max(.065, desired.y);
      }
    }
  }
}
