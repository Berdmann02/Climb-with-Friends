import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import type { PoseTargets, RouteData } from '../core/contracts';
import type { Character } from '../player/Character';
import { createContact, getContactTarget, surfaceRight } from './ContactSolver';
import { evaluateStability } from './StabilitySolver';
import { ARM_REACH, LEG_REACH, bodyPoseAtRoot, constrainBodyRoot, contactJointTarget, solveBodyPose, solveContinuousBodyPose, surfaceOrientation } from './BodyPoseSolver';
import { LimbTargetController } from './LimbTargetController';
import { planNextLimb } from './NextLimbPlanner';
import { LIMBS, isHand } from './types';
import type { BodyPose, ClimbPhase, ClimbSurface, ContactRequest, LimbContact, LimbId, StabilityResult } from './types';

type Contacts = Record<LimbId, LimbContact>;
type AimTarget = { point: Vector3; normal: Vector3; orientation: Quaternion };
const freeContact = (limb: LimbId): LimbContact => ({
  limb, kind: 'free', state: 'free', point: new Vector3(), normal: new Vector3(0, 0, 1), orientation: new Quaternion(),
  holdId: null, grip: 'edge', direction: new Vector3(0, -1, 0), strength: 0, friction: 0, quality: 0, load: 0, rotation: 0, planted: false,
});
const emptyContacts = (): Contacts => Object.fromEntries(LIMBS.map(limb => [limb, freeContact(limb)])) as Contacts;
const defaultSurface = (): ClimbSurface => ({
  id: 'gym-main', origin: new Vector3(), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), angle: 0,
  friction: .72, material: 'plywood', bounds: { id: 'gym-main', minX: -10, maxX: 10, minY: 0, maxY: 30, z: 0 },
});

/** Continuous local authority. Mouse goals move free limbs; clicks only establish contact. */
export class ClimbingController {
  private route: RouteData | null = null;
  private surface = defaultSurface();
  private running = false;
  private complete = false;
  private fell = false;
  private selected: LimbId = 'leftHand';
  private controlled = false;
  private currentPhase: ClimbPhase = 'idle';
  private contactSet = emptyContacts();
  private pose: BodyPose;
  private balance: StabilityResult;
  private lastHold: string | null = null;
  private desiredRequest: ContactRequest | null = null;
  private desiredTarget: AimTarget | null = null;
  private freeGoals = Object.fromEntries(LIMBS.map(limb => [limb, new Vector3()])) as Record<LimbId, Vector3>;
  private freeOrientations = Object.fromEntries(LIMBS.map(limb => [limb, new Quaternion()])) as Record<LimbId, Quaternion>;
  private limbs = new LimbTargetController();
  private rootVelocity = new Vector3();
  private overreach = 0;
  private instability = 0;
  private slipping: { limb: LimbId; elapsed: number; distance: number } | null = null;
  private autoSequence = false;
  private suggested: LimbId | null = null;

  constructor(private readonly character: Character) {
    this.pose = bodyPoseAtRoot(this.contactSet, this.surface, new Vector3());
    this.balance = evaluateStability(this.contactSet, this.pose, this.surface);
  }
  get active(): boolean { return this.running; }
  get finished(): boolean { return this.complete; }
  get didFall(): boolean { return this.fell; }
  get controlling(): boolean { return this.controlled; }
  get height(): number { return this.character.group.position.y; }
  get currentHoldId(): string | null { return this.lastHold; }
  get selectedLimb(): LimbId { return this.selected; }
  get phase(): ClimbPhase { return this.currentPhase; }
  get suggestedLimb(): LimbId | null { return this.suggested; }
  get autoSequencing(): boolean { return this.autoSequence; }
  setAutoSequence(on: boolean): void { this.autoSequence = on; if (!on) this.suggested = null; }
  get contacts(): Contacts { return this.contactSet; }
  get body(): BodyPose { return this.pose; }
  get stability(): StabilityResult { return this.balance; }
  get targets(): PoseTargets {
    return { leftHand: this.contactSet.leftHand.point, rightHand: this.contactSet.rightHand.point,
      leftFoot: this.contactSet.leftFoot.point, rightFoot: this.contactSet.rightFoot.point };
  }
  setRoute(route: RouteData): void { this.stop(); this.route = route; this.surface.id = route.wallId; this.surface.bounds.id = route.wallId; this.lastHold = null; }
  setSurface(surface: ClimbSurface): void { this.surface = surface; }
  stop(): void {
    this.running = false; this.complete = false; this.fell = false; this.controlled = false;
    this.currentPhase = 'idle'; this.instability = 0; this.slipping = null; this.desiredRequest = null; this.desiredTarget = null;
    this.rootVelocity.set(0, 0, 0); this.limbs.reset(); this.overreach = 0; this.suggested = null;
    this.character.setClimbingVisual(null);
  }

  /** Initial attachment is the only automatic placement in this controller. */
  start(): boolean {
    this.stop();
    const handHolds = this.route?.holds.filter(h => h.type !== 'foothold') ?? [];
    if (!handHolds.length) return false;
    const marked = handHolds.filter(h => h.start).sort((a, b) => a.position[1] - b.position[1]);
    const first = marked[0] ?? [...handHolds].sort((a, b) => a.position[1] - b.position[1])[0];
    const nearby = handHolds.filter(h => h.id !== first.id && Math.abs(h.position[1] - first.position[1]) < .55)
      .sort((a, b) => new Vector3(...a.position).distanceTo(new Vector3(...first.position)) - new Vector3(...b.position).distanceTo(new Vector3(...first.position)));
    const second = marked[1] ?? nearby[0] ?? first;
    const hands = [first, second].sort((a, b) => a.position[0] - b.position[0]);
    const root = new Vector3(...hands[0].position).add(new Vector3(...hands[1].position)).multiplyScalar(.5).addScaledVector(this.surface.up, -1.27);
    root.addScaledVector(this.surface.normal, .52 - root.clone().sub(this.surface.origin).dot(this.surface.normal)); root.y = Math.max(0, root.y);
    const contacts = emptyContacts();
    const requests = {} as Record<LimbId, ContactRequest>;
    requests.leftHand = { hold: hands[0], point: new Vector3(...hands[0].position), normal: this.surface.normal.clone() };
    requests.rightHand = { hold: hands[1], point: new Vector3(...hands[1].position), normal: this.surface.normal.clone() };
    const usedFeet = new Set<string>();
    for (const limb of ['leftFoot', 'rightFoot'] as const) {
      const side = limb === 'leftFoot' ? -1 : 1;
      const feet = (this.route?.holds ?? []).filter(h => h.type === 'foothold' && !usedFeet.has(h.id)
        && h.position[1] < root.y + .65 && Math.abs(h.position[0] - (root.x + side * .18)) < .5)
        .sort((a, b) => a.position[1] - b.position[1] || Math.abs(a.position[0] - root.x - side * .18) - Math.abs(b.position[0] - root.x - side * .18));
      const hold = feet[0]; if (hold) usedFeet.add(hold.id);
      requests[limb] = { ...(hold ? { hold } : {}), point: hold ? new Vector3(...hold.position) : new Vector3(root.x + side * .2, Math.max(this.surface.bounds.minY + .025, root.y + .23), this.surface.origin.z + .012), normal: this.surface.normal.clone() };
    }
    for (const limb of LIMBS) contacts[limb] = this.provisional(limb, requests[limb]);
    let body = solveBodyPose(contacts, this.surface, root);
    for (const limb of LIMBS) {
      const contact = createContact(limb, requests[limb], this.surface, body);
      if (!contact) return false;
      contacts[limb] = contact;
    }
    body = solveBodyPose(contacts, this.surface, body.root);
    if (!body.feasible) return false;
    this.contactSet = contacts; this.pose = body; this.running = true; this.selected = 'leftHand'; this.currentPhase = 'idle'; this.controlled = false;
    this.lastHold = hands[1].id; this.character.group.position.copy(body.root); this.character.group.quaternion.copy(surfaceOrientation(this.surface));
    for (const limb of LIMBS) { this.freeGoals[limb].copy(contacts[limb].point); this.freeOrientations[limb].copy(contacts[limb].orientation); }
    this.refreshStability(); this.syncVisual();
    return true;
  }


  /** Auto-sequencing: pick the limb whose move the body is asking for, and take control of it. */
  private advanceSequence(justMoved: LimbId | null): void {
    this.suggested = planNextLimb(this.contactSet, this.pose, this.surface, this.balance, justMoved);
    if (this.suggested) this.selectLimb(this.suggested); else this.syncVisual();
  }

  selectLimb(limb: LimbId): void {
    if (!this.running || !LIMBS.includes(limb)) return;
    if (this.controlled) {
      this.freeGoals[this.selected].copy(this.contactSet[this.selected].point);
      this.freeOrientations[this.selected].copy(this.contactSet[this.selected].orientation);
      this.limbs.reset(this.selected);
    }
    this.selected = limb; this.controlled = true; this.detach(limb);
    this.desiredRequest = null; this.desiredTarget = null; this.complete = false; this.currentPhase = 'moving';
    this.refreshStability(); this.syncVisual();
  }

  aim(request: ContactRequest | null): void {
    if (!this.running || !this.controlled) return;
    this.desiredRequest = request && [...request.point.toArray(), ...request.normal.toArray()].every(Number.isFinite)
      ? { ...request, point: request.point.clone(), normal: request.normal.clone() } : null;
  }

  /** No movement is scheduled here. The hand or toe must already be at the surface. */
  requestMove(request: ContactRequest): { accepted: boolean; reason?: string } {
    if (!this.running || !this.controlled) return { accepted: false };
    const contact = createContact(this.selected, request, this.surface, this.pose);
    if (!contact) return { accepted: false };
    const rendered = this.character.contactWorldPosition(this.selected);
    if (rendered.distanceTo(contact.point) > .095 || this.contactSet[this.selected].point.distanceTo(contact.point) > .095) return { accepted: false };
    const side = this.selected.startsWith('left') ? 'left' : 'right';
    const anchor = isHand(this.selected) ? this.pose.shoulders[side] : this.pose.hips[side];
    if (anchor.distanceTo(contactJointTarget(contact)) > (isHand(this.selected) ? ARM_REACH : LEG_REACH) - .004) return { accepted: false };
    if (!isHand(this.selected) && contact.kind !== 'flag') {
      const delta = contact.point.clone().sub(this.pose.pelvis);
      const lateral = delta.dot(surfaceRight(this.surface));
      if (delta.dot(this.surface.up) > .28 || (this.selected === 'leftFoot' ? lateral > .34 : lateral < -.34)) return { accepted: false };
    }
    const proposed = { ...this.contactSet, [this.selected]: contact };
    if (!bodyPoseAtRoot(proposed, this.surface, this.pose.root).feasible) return { accepted: false };
    this.contactSet[this.selected] = contact; this.freeGoals[this.selected].copy(contact.point);
    this.freeOrientations[this.selected].copy(contact.orientation); this.limbs.reset(this.selected);
    this.controlled = false; this.desiredRequest = null; this.desiredTarget = null; this.currentPhase = 'contact';
    this.lastHold = contact.holdId ?? this.lastHold;
    if (this.slipping?.limb === this.selected) { this.slipping = null; this.instability = Math.max(0, this.instability - 1.5); }
    this.complete = isHand(this.selected) && !!this.route?.holds.some(h => h.finish && h.id === contact.holdId);
    this.refreshStability(); this.recoverSupport(); this.syncVisual();
    // The machine picks which limb moves next; the player still aims and grips it.
    if (this.autoSequence && !this.complete) this.advanceSequence(this.selected);
    else this.syncVisual();
    return { accepted: true };
  }

  releaseSelected(): void { if (this.running) this.selectLimb(this.selected); }

  update(dt: number, _time: number): void {
    if (!this.running || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .05);
    this.desiredTarget = this.controlled && this.desiredRequest ? getContactTarget(this.selected, this.desiredRequest, this.surface, this.pose) : null;
    if (this.desiredTarget) {
      this.freeGoals[this.selected].copy(this.desiredTarget.point);
      this.freeOrientations[this.selected].copy(this.desiredTarget.orientation);
      this.contactSet[this.selected].normal.copy(this.desiredTarget.normal);
    }
    let requestedStrain = 0;
    if (this.controlled && this.desiredTarget) {
      const side = this.selected.startsWith('left') ? 'left' : 'right';
      const anchor = isHand(this.selected) ? this.pose.shoulders[side] : this.pose.hips[side];
      const target = { ...this.contactSet[this.selected], point: this.desiredTarget.point, orientation: this.desiredTarget.orientation };
      requestedStrain = MathUtils.clamp((anchor.distanceTo(contactJointTarget(target)) - (isHand(this.selected) ? ARM_REACH : LEG_REACH) * .93) / .65, 0, 1);
    }
    this.overreach = MathUtils.lerp(this.overreach, requestedStrain, 1 - Math.exp(-dt * 7));
    this.advanceSlip(dt);
    for (const limb of LIMBS) {
      const contact = this.contactSet[limb];
      if (!contact.planted && contact.state !== 'slipping') {
        this.limbs.follow(contact, this.freeGoals[limb], this.freeOrientations[limb], this.pose, this.surface, dt);
        this.freeState(contact);
      }
    }
    const intent = this.controlled && this.desiredTarget
      ? { limb: this.selected, point: this.desiredTarget.point, orientation: this.desiredTarget.orientation, effort: this.overreach } : null;
    const equilibrium = solveContinuousBodyPose(this.contactSet, this.surface, this.pose.root, intent, this.balance.support);
    const acceleration = equilibrium.root.clone().sub(this.pose.root).multiplyScalar(32).addScaledVector(this.rootVelocity, -11);
    this.rootVelocity.addScaledVector(acceleration, dt).clampLength(0, .8);
    const previous = this.pose.root.clone();
    this.pose = constrainBodyRoot(this.contactSet, this.surface, previous.clone().addScaledVector(this.rootVelocity, dt));
    for (const limb of LIMBS) if (!this.contactSet[limb].planted) this.limbs.constrain(this.contactSet[limb], this.pose, this.surface);
    // Reproject after small torso/hip changes caused by the physical free limbs.
    this.pose = constrainBodyRoot(this.contactSet, this.surface, this.pose.root);
    this.rootVelocity.copy(this.pose.root).sub(previous).divideScalar(dt).clampLength(0, .8);
    this.pose.strain = Math.max(this.pose.strain, this.overreach * .88);
    this.character.group.position.copy(this.pose.root);
    this.character.group.quaternion.copy(surfaceOrientation(this.surface));
    this.refreshStability();
    if (this.balance.score > .52) { this.instability = Math.max(0, this.instability - dt * 2.5); this.recoverSupport(); }
    else this.instability += dt * (this.balance.level === 'unstable' ? .6 : 1) * (1 + this.overreach * .2);
    if (this.instability >= 3 && !this.slipping) {
      const weakest = this.balance.weakest;
      if (weakest && this.contactSet[weakest].planted) {
        this.slipping = { limb: weakest, elapsed: 0, distance: 0 };
        this.contactSet[weakest].state = 'slipping'; this.contactSet[weakest].planted = false;
      } else if (this.instability > 3.5 && this.balance.score < .32) this.fall();
    }
    if (this.slipping && this.slipping.elapsed > 1.15 && this.instability > 3.5 && this.balance.score < .52) this.fall();
    if (this.running) this.currentPhase = this.controlled || this.slipping ? 'moving' : 'idle';
    this.syncVisual();
  }

  private detach(limb: LimbId): void {
    const contact = this.contactSet[limb]; contact.planted = false; contact.holdId = null; contact.load = 0;
    this.freeState(contact); this.freeGoals[limb].copy(contact.point); this.freeOrientations[limb].copy(contact.orientation); this.limbs.reset(limb);
  }
  private freeState(contact: LimbContact): void {
    contact.kind = isHand(contact.limb) ? 'free' : 'flag'; contact.state = isHand(contact.limb) ? 'moving' : 'light';
    contact.planted = false; contact.load = 0;
    if (!isHand(contact.limb)) { contact.direction.copy(contact.point).sub(this.pose.pelvis).normalize(); contact.strength = .65; contact.friction = this.surface.friction; }
  }
  private advanceSlip(dt: number): void {
    if (!this.slipping) return;
    const contact = this.contactSet[this.slipping.limb]; this.slipping.elapsed += dt;
    if (contact.state !== 'slipping') return;
    const distance = dt * (.045 + Math.min(1, this.instability / 4) * .12);
    contact.point.addScaledVector(this.surface.up, -distance).addScaledVector(this.surface.normal, dt * .014);
    this.slipping.distance += distance;
  }
  private recoverSupport(): void {
    if (!this.slipping || this.balance.score <= .52 || this.slipping.elapsed < .1) return;
    const limb = this.slipping.limb;
    if (this.contactSet[limb].state === 'slipping') this.detach(limb);
    this.slipping = null; this.instability = Math.min(this.instability, 1);
  }
  private fall(): void {
    this.running = false; this.fell = true; this.complete = false; this.controlled = false; this.currentPhase = 'falling';
  }

  private provisional(limb: LimbId, request: ContactRequest): LimbContact {
    const contact = freeContact(limb), normal = this.surface.normal.clone().normalize();
    const right = this.surface.up.clone().cross(normal).normalize(), up = normal.clone().cross(right).normalize();
    contact.kind = request.hold ? 'hold' : 'smear'; contact.state = 'attached'; contact.planted = true;
    const target = getContactTarget(limb, request, this.surface);
    contact.point.copy(target?.point ?? request.point); contact.normal.copy(target?.normal ?? request.normal); contact.holdId = request.hold?.id ?? null;
    contact.orientation.setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal));
    contact.orientation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), request.hold?.rotation ?? 0));
    if (target) contact.orientation.copy(target.orientation);
    contact.strength = 1; contact.friction = this.surface.friction; contact.quality = 1;
    return contact;
  }

  private refreshStability(): void {
    this.balance = evaluateStability(this.contactSet, this.pose, this.surface);
    this.balance.score = MathUtils.clamp(this.balance.score - this.overreach * .18, 0, 1);
    this.balance.handStrain = MathUtils.clamp(this.balance.handStrain + this.overreach * .22, 0, 1);
    if (this.desiredTarget) {
      const lateral = Math.abs(this.desiredTarget.point.clone().sub(this.pose.centerOfMass).dot(surfaceRight(this.surface)));
      this.balance.imbalance = MathUtils.clamp(this.balance.imbalance + Math.min(.22, lateral * .12) * this.overreach, 0, 1);
    }
    const score = this.balance.score;
    this.balance.level = score > .72 ? 'stable' : score > .52 ? 'strained' : score > .32 ? 'unstable' : score > .12 ? 'critical' : 'fall';
    for (const limb of LIMBS) {
      const contact = this.contactSet[limb]; contact.quality = this.balance.qualities[limb]; contact.load = this.balance.loads[limb];
      if (contact.planted && contact.state !== 'slipping') contact.state = contact.load > .28 ? 'loaded' : contact.load > .08 ? 'attached' : 'light';
    }
  }
  private syncVisual(): void {
    this.character.setClimbPose(this.targets);
    this.character.setClimbingVisual({ torsoRotation: this.pose.torsoRotation, hipRotation: this.pose.hipRotation,
      orientations: Object.fromEntries(LIMBS.map(limb => [limb, this.contactSet[limb].orientation])) as Record<LimbId, Quaternion>,
      contacts: this.contactSet, tension: Math.max(this.balance.handStrain, this.pose.strain, this.overreach),
      tremble: Math.min(1, ({ stable: 0, strained: .12, unstable: .4, critical: .8, fall: 1 }[this.balance.level]) + this.overreach * .55),
      lookTarget: this.desiredTarget?.point ?? this.contactSet[this.selected].point,
    });
  }
}
