import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ClimbInput } from '../src/climbing/ClimbInput';
import { ClimbingController } from '../src/climbing/ClimbingController';
import { contactJointTarget } from '../src/climbing/BodyPoseSolver';
import { Character } from '../src/player/Character';
import { createDefaultRoute } from '../src/routes/defaults';
import type { Input } from '../src/core/Input';
import type { ClimbSurface, LimbId } from '../src/climbing/types';

const surface: ClimbSurface = { id: 'gym-main', origin: new Vector3(), normal: new Vector3(0,0,1), up: new Vector3(0,1,0),
  angle: 0, friction: .8, material: 'plywood', bounds: { id:'gym-main', minX:-5,maxX:5,minY:0,maxY:8,z:0 } };

function setup(mirror = false) {
  const character = new Character('#cb7965'), climb = new ClimbingController(character);
  const route = createDefaultRoute('gym');
  const positions = [[-.2,1.4,.12],[.3,1.4,.12],[-.12,.65,.12],[.3,.65,.12],[.72,2.45,.12]];
  route.holds = route.holds.slice(0,5).map((h,i) => ({...h, rotation:0, position: positions[i].map((v,j)=>j===0&&mirror?-v:v) as [number,number,number]}));
  climb.setRoute(route); climb.setSurface(surface); expect(climb.start()).toBe(true);
  const keys = new Set<string>(), pressed = new Set<string>();
  const input = { down:(key:string)=>keys.has(key), consume:(key:string)=>{const had=pressed.has(key);pressed.delete(key);return had;} } as Input;
  const controls = new ClimbInput({} as HTMLCanvasElement, new PerspectiveCamera(), input);
  let time=0;
  const tick = (seconds:number) => {for(let i=0;i<Math.ceil(seconds*60);i++){
    const previous=climb.body.root.clone();
    controls.update(climb);
    climb.update(1/60,time+=1/60); character.update(1/60,time,'climb');
    expect(climb.body.root.distanceTo(previous)).toBeLessThan(.025);
  }};
  const key = mirror?'KeyQ':'KeyW', hand:LimbId=mirror?'leftHand':'rightHand', foot:LimbId=mirror?'rightFoot':'leftFoot';
  const press=()=>{keys.add(key);pressed.add(key);tick(1/60);};
  const release=()=>keys.delete(key);
  const aim=()=>climb.aim({point:new Vector3(...route.holds[4].position),normal:surface.normal,hold:route.holds[4]});
  const knee = () => {
    const hip=climb.body.hips[mirror?'right':'left'];
    const d=hip.distanceTo(contactJointTarget(climb.contacts[foot]));
    return Math.acos(Math.max(-1,Math.min(1,(.38**2+.42**2-d*d)/(2*.38*.42))))*180/Math.PI;
  };
  const stand=()=>keys.add('Space'), relax=()=>keys.delete('Space');
  return {character,climb,route,tick,press,release,stand,relax,aim,knee,hand,foot};
}

describe('leg-driven hand reach through input, body integration and rendered IK',()=>{
  it.each([false,true])('stands up on a bent supporting leg (mirrored=%s)',mirror=>{
    const s=setup(mirror);s.tick(.3);s.press();s.release();s.tick(.1);
    const before=s.climb.body.root.clone(), knee=s.knee(), hand=s.character.contactWorldPosition(s.hand);
    const planted=Object.values(s.climb.contacts).filter(c=>c.planted).map(c=>({limb:c.limb,point:c.point.clone(),orientation:c.orientation.clone()}));
    s.press();s.release();s.aim();s.stand();s.tick(2);
    const ordinary=setup(mirror);ordinary.tick(.3);ordinary.press();ordinary.release();ordinary.tick(.1);ordinary.press();ordinary.release();ordinary.aim();ordinary.tick(2);
    expect(s.knee()-ordinary.knee()).toBeGreaterThan(20);
    const request={point:new Vector3(...s.route.holds[4].position),normal:surface.normal,hold:s.route.holds[4]};
    expect(ordinary.climb.requestMove(request).accepted).toBe(false);
    expect(s.climb.requestMove(request).accepted).toBe(true);
    expect(s.climb.body.root.y-before.y).toBeGreaterThan(.25);
    expect(s.knee()-knee).toBeGreaterThan(20);
    expect(s.character.contactWorldPosition(s.hand).y-hand.y).toBeGreaterThan(.12);
    expect(s.climb.active).toBe(true);expect(s.climb.body.feasible).toBe(true);
    for(const c of planted){
      expect(s.climb.contacts[c.limb].point.distanceTo(c.point)).toBe(0);
      expect(s.climb.contacts[c.limb].orientation.angleTo(c.orientation)).toBeLessThan(1e-7);
      expect(s.character.contactWorldPosition(c.limb).distanceTo(c.point)).toBeLessThan(.012);
    }
  });
  it('preserves tap selection and stops driving when the key is released',()=>{
    const held=setup(), tapped=setup();
    held.press();held.aim();tapped.press();tapped.release();tapped.aim();
    held.tick(.5);tapped.tick(.5);
    expect(held.climb.selectedLimb).toBe('rightHand');
    expect(held.climb.contacts.rightHand.planted).toBe(false);
    expect(held.climb.body.root.distanceTo(tapped.climb.body.root)).toBeLessThan(1e-8);
    held.stand();held.tick(1.8);const high=held.climb.body.root.y;
    held.relax();held.release();held.tick(1.5);
    expect(held.climb.body.root.y).toBeLessThan(high-.015);
  });
  it.each(['leftFoot','rightFoot'] as const)('can stand through the only planted foot: %s',foot=>{
    const s=setup();s.climb.selectLimb(foot==='leftFoot'?'rightFoot':'leftFoot');
    const planted=s.climb.contacts[foot].point.clone(), before=s.climb.body.root.y;
    s.press();s.release();s.aim();s.stand();s.tick(1.5);
    expect(s.climb.body.root.y-before).toBeGreaterThan(.2);
    expect(s.climb.body.feasible).toBe(true);
    expect(s.climb.contacts[foot].point.distanceTo(planted)).toBe(0);
  });
  it('Space stands up without a mouse target or releasing any contact',()=>{
    const s=setup();const before=s.climb.body.root.y;
    const contacts=Object.values(s.climb.contacts).map(c=>c.point.clone());
    s.stand();s.tick(2);
    expect(s.climb.body.root.y-before).toBeGreaterThan(.2);
    expect(s.climb.controlling).toBe(false);
    Object.values(s.climb.contacts).forEach((c,i)=>{expect(c.planted).toBe(true);expect(c.point.distanceTo(contacts[i])).toBe(0);});
  });
  it('cannot gain leg drive from free feet',()=>{
    const held=setup(), tapped=setup();
    for(const s of [held,tapped]){s.climb.selectLimb('leftFoot');s.climb.selectLimb('rightFoot');s.press();s.aim();}
    tapped.release();held.stand();held.tick(.8);tapped.tick(.8);
    expect(held.climb.body.root.distanceTo(tapped.climb.body.root)).toBeLessThan(1e-8);
  });
  it('stops at fixed limb lengths when the requested hold is unreachable',()=>{
    const s=setup();s.press();s.route.holds[4].position=[.72,4,.12];s.aim();s.stand();s.tick(1.8);
    expect(s.climb.body.feasible).toBe(true);
    expect(s.climb.body.root.y).toBeLessThan(.75);
    expect(s.climb.requestMove({point:new Vector3(...s.route.holds[4].position),normal:surface.normal,hold:s.route.holds[4]}).accepted).toBe(false);
    for(const [limb,side] of [['leftFoot','left'],['rightFoot','right']] as const){
      expect(s.climb.body.hips[side].distanceTo(contactJointTarget(s.climb.contacts[limb]))).toBeLessThanOrEqual(.8);
    }
    expect(s.climb.body.shoulders.left.distanceTo(contactJointTarget(s.climb.contacts.leftHand))).toBeLessThanOrEqual(.64);
  });
});
