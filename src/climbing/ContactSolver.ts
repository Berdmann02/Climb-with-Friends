import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import type { HoldData } from '../core/contracts';
import { isHand } from './types';
import type { BodyPose, ClimbSurface, ContactRequest, GripType, LimbContact, LimbId } from './types';
import { ARM_REACH, LEG_REACH, contactJointTarget } from './BodyPoseSolver';

const clamp = MathUtils.clamp;
const LOCAL_NORMAL = new Vector3(0, 0, 1);
const LOCAL_RIGHT = new Vector3(1, 0, 0);
export interface GripMetadata { grip: GripType; strength: number; friction: number; direction: Vector3; rotation: number; }
export interface SurfaceGrip { point:Vector3; normal:Vector3; }
export interface HoldSurfaceMetadata { hand:SurfaceGrip; foot:SurfaceGrip; }
export interface ContactTarget { point:Vector3; normal:Vector3; orientation:Quaternion; }
const holdSurfaces=new Map<string,HoldSurfaceMetadata>();
// Model-space front extents from the authored GLBs. Runtime mesh samples replace
// these conservative fallbacks as soon as HoldRenderer has loaded the assets.
const FRONT_DEPTH:Record<HoldData['type'],number>={jug:.1772,crimp:.124,sloper:.17,pinch:.15,foothold:.085};
export function registerHoldSurface(asset:string,metadata:HoldSurfaceMetadata):void {
  const clone=(grip:SurfaceGrip):SurfaceGrip=>({point:grip.point.clone(),normal:grip.normal.clone().normalize()});
  holdSurfaces.set(asset,{hand:clone(metadata.hand),foot:clone(metadata.foot)});
}
const STRENGTH: Record<GripType, number> = {
  jug: .98, crimp: .73, sloper: .62, pinch: .78, foothold: .88,
  sidepull: .87, undercling: .9, pocket: .86, edge: .76,
};

/** Direction is the preferred in-plane force from the contact toward the climber. */
export function gripForHold(hold: HoldData): GripMetadata {
  const explicit = hold.grip;
  const angle = Math.abs(Math.atan2(Math.sin(hold.rotation), Math.cos(hold.rotation)));
  const grip: GripType = explicit ?? (hold.type === 'jug' && angle > 2.35 ? 'undercling'
    : hold.type === 'jug' && angle > .78 && angle < 2.35 ? 'sidepull' : hold.type);
  let rotation = hold.rotation;
  // Explicit gear metadata remains useful on an unrotated authored asset.
  if (explicit === 'undercling' && angle < .25) rotation = Math.PI;
  if (explicit === 'sidepull' && angle < .25) rotation = (hold.gripDirection?.[0]??1)<0?-Math.PI/2:Math.PI/2;
  const direction = hold.gripDirection ? new Vector3(...hold.gripDirection).normalize() : new Vector3(0, -1, 0);
  return {
    grip, rotation, strength: hold.gripStrength ?? STRENGTH[grip], friction: hold.friction ?? (grip === 'sloper' ? .68 : grip === 'crimp' || grip === 'edge' ? .78 : .9),
    direction: direction.applyAxisAngle(LOCAL_NORMAL, hold.gripDirection?hold.rotation:rotation),
  };
}

export function surfaceRight(surface: ClimbSurface): Vector3 {
  return new Vector3().crossVectors(surface.up, surface.normal).normalize();
}

function orientation(surface: ClimbSurface, rotation: number, contactNormal=surface.normal): Quaternion {
  const normal = contactNormal.clone().normalize();
  const right = new Vector3().crossVectors(surface.up,normal);
  if(right.lengthSq()<1e-6)right.copy(surfaceRight(surface)).projectOnPlane(normal);
  if(right.lengthSq()<1e-6)right.set(1,0,0).projectOnPlane(normal);
  right.normalize();
  const up = new Vector3().crossVectors(normal, right).normalize();
  // Local -Z is the palm/toe direction into the wall; +Y follows the hold's lip.
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal))
    .multiply(new Quaternion().setFromAxisAngle(LOCAL_NORMAL, rotation));
}

function anchor(limb: LimbId, body: BodyPose): Vector3 {
  const side = limb.startsWith('left') ? 'left' : 'right';
  return isHand(limb) ? body.shoulders[side] : body.hips[side];
}

function worldDirection(direction: Vector3, surface: ClimbSurface): Vector3 {
  return surfaceRight(surface).multiplyScalar(direction.x).addScaledVector(surface.up, direction.y).addScaledVector(surface.normal, direction.z).normalize();
}

/** Resolve geometry only. Free hands may aim at a wall without being allowed to grab it. */
export function getContactTarget(limb:LimbId,request:ContactRequest,surface:ClimbSurface,body?:BodyPose):ContactTarget|null {
  if(![...request.point.toArray(),...request.normal.toArray()].every(Number.isFinite))return null;
  if(request.hold&&request.hold.wallId!==surface.id)return null;
  const hand=isHand(limb),hold=request.hold;
  const point=request.point.clone();
  const normal=request.normal.lengthSq()>.01?request.normal.clone().normalize():surface.normal.clone().normalize();
  const metadata=hold?gripForHold(hold):null;
  const rotation=metadata?.rotation??0;
  const contactRotation=hand?rotation:clamp(Math.atan2(Math.sin(rotation),Math.cos(rotation))*.2,-.32,.32);
  if(hold&&!request.surfaceHit){
    // Model-space samples are transformed by the actual model rotation, while
    // the gripping pose may carry a separate sidepull/undercling orientation.
    const modelOrientation=orientation(surface,hold.rotation);
    const cached=holdSurfaces.get(hold.asset)?.[hand?'hand':'foot'];
    const lip=hand?(hold.type==='crimp'?.018:hold.type==='pinch'?.015:.045):.026;
    const localPoint=hold.gripPoint?new Vector3(...hold.gripPoint):cached?.point.clone()??new Vector3(0,lip,FRONT_DEPTH[hold.type]);
    const localNormal=hold.gripNormal?new Vector3(...hold.gripNormal):cached?.normal.clone()??LOCAL_NORMAL.clone();
    point.fromArray(hold.position).add(localPoint.multiplyScalar(hold.scale).applyQuaternion(modelOrientation));
    normal.copy(localNormal).normalize().applyQuaternion(modelOrientation);
  }
  // Exact ray hits retain their point and normal. Only a small skin/rubber
  // clearance is added; never move a user's target to a hold center or wall plane.
  point.addScaledVector(normal,hand?.015:.010);
  const facing=orientation(surface,contactRotation,normal);
  if(hand&&body){
    // A small pronation adjustment follows the reaching forearm. Rotation is
    // strictly about the palm normal, so the chosen contact point and surface
    // normal are unchanged. A planted contact keeps this captured orientation.
    const arm=anchor(limb,body).clone().sub(point).applyQuaternion(facing.clone().invert());
    const lean=Math.atan2(arm.x,Math.max(.06,Math.abs(arm.y)));
    const grip=metadata?.grip;
    const limit = !hold ? .18
      : grip === 'crimp' || grip === 'edge' ? .04
        : grip === 'sidepull' || grip === 'undercling' || grip === 'pinch' ? .12 : .075;
    const roll=clamp(lean*.30,-limit,limit);
    facing.multiply(new Quaternion().setFromAxisAngle(LOCAL_NORMAL,roll));
  }
  if(!hand&&!hold)facing.multiply(new Quaternion().setFromAxisAngle(LOCAL_RIGHT,.18));
  return {point,normal,orientation:facing};
}

export function createContact(limb: LimbId, request: ContactRequest, surface: ClimbSurface, body: BodyPose): LimbContact | null {
  const hand = isHand(limb);
  if (![...request.point.toArray(), ...request.normal.toArray()].every(Number.isFinite)) return null;
  if (hand && (!request.hold || request.hold.handAllowed === false || request.hold.type === 'foothold' && request.hold.handAllowed !== true)) return null;
  if (!hand && request.hold?.footAllowed === false) return null;
  if (request.hold && request.hold.wallId !== surface.id) return null;
  const resolved=getContactTarget(limb,request,surface,body);if(!resolved)return null;
  const right = surfaceRight(surface);
  const {point,normal}=resolved;
  let grip: GripType = 'edge', strength = .68, friction = clamp(surface.friction, .05, 1);
  let rotation = 0;
  let kind: LimbContact['kind'] = 'smear';
  let direction = surface.up.clone().negate();
  if (request.hold) {
    const hold = request.hold;
    const metadata = gripForHold(hold);
    grip = metadata.grip; strength = metadata.strength; friction = metadata.friction;
    rotation = metadata.rotation; direction = worldDirection(metadata.direction, surface);
    kind = 'hold';
    if (!hand) strength = hold.gripStrength ?? (hold.type === 'sloper' ? .62 : .94);
  } else {
    const delta = point.clone().sub(anchor(limb, body));
    const sideways = Math.abs(delta.dot(right));
    // An extended or crossed unloaded leg is a flag, not an invisible foothold.
    const wallClearance = point.clone().sub(surface.origin).dot(surface.normal);
    if (!request.surfaceHit && sideways > .40 && (delta.length() > .68 || wallClearance > .18)) kind = 'flag';
    if (kind === 'smear') {
      const bounds = surface.bounds;
      if (point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY) return null;
    }
    direction = delta.lengthSq() ? delta.normalize() : surface.up.clone().negate();
    rotation = clamp(delta.dot(right) * .35, -.4, .4);
  }
  const contact: LimbContact = {
    limb, kind, state: kind === 'flag' ? 'light' : 'attached', point, normal,
    orientation: resolved.orientation, holdId: request.hold?.id ?? null,
    grip, direction, strength, friction, quality: 0, load: 0, rotation, planted: kind !== 'flag',
  };
  const distance = contactJointTarget(contact).distanceTo(anchor(limb, body));
  if (distance > (hand ? ARM_REACH + .06 : LEG_REACH + .07)) return null;
  contact.quality = updateContactQuality(contact, body, surface);
  return contact;
}

/** Quality is recomputed from posture; contact positions and orientations never slide. */
export function updateContactQuality(contact: LimbContact, body: BodyPose, surface: ClimbSurface): number {
  if (contact.kind === 'free' || contact.state === 'moving' || contact.state === 'free') return 0;
  const hand = isHand(contact.limb);
  const distance = contactJointTarget(contact).distanceTo(anchor(contact.limb, body));
  const limit = hand ? ARM_REACH : LEG_REACH;
  const reach = distance <= limit ? 1 - Math.max(0, distance / limit - .85) * .8 : clamp(1 - (distance - limit) * 13, 0, 1);
  const posture = reach * (body.feasible ? 1 : .65) * (1 - clamp(body.strain, 0, 1) * .14);
  if (contact.kind === 'flag') return clamp(posture, 0, 1);
  if (contact.kind === 'smear') {
    const angleFactor = clamp(1 - Math.sin(surface.angle) * 1.35, .08, 1.45);
    const beneath = contact.point.dot(surface.up) < body.pelvis.dot(surface.up) ? 1 : .3;
    const roughness = surface.material === 'rock' ? 1.12 : .94;
    return clamp(.83 * contact.friction * angleFactor * roughness * beneath * posture, 0, .93);
  }
  if (!hand) return clamp(contact.strength * posture * (contact.grip === 'sloper' ? contact.friction : 1), 0, 1);
  const load = body.centerOfMass.clone().sub(contact.point);
  if (Math.abs(contact.direction.dot(surface.normal)) < .15) load.projectOnPlane(surface.normal);
  const alignment = load.lengthSq() > 1e-6 ? load.normalize().dot(contact.direction) : .5;
  const directional = contact.grip === 'sidepull' || contact.grip === 'undercling'
    ? .16 + .84 * Math.max(0, alignment)
    : contact.grip === 'pinch' || contact.grip === 'pocket' ? .78 + .22 * Math.max(0, alignment)
      : .50 + .50 * Math.max(0, alignment);
  const outward = Math.max(0, body.centerOfMass.clone().sub(contact.point).dot(surface.normal) - .43);
  const friction = contact.grip === 'sloper' ? clamp(contact.friction - outward * .8, .1, 1) : 1;
  const loadPenalty = clamp(1 - Math.max(0, contact.load - .4) * (contact.grip === 'sloper' || contact.grip === 'crimp' ? .6 : .22), .55, 1);
  return clamp(contact.strength * directional * posture * friction * loadPenalty * (1 - Math.min(.3, outward * .3)), 0, 1);
}
