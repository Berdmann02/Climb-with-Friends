import {BufferGeometry,Group,Line,LineBasicMaterial,Mesh,MeshBasicMaterial,SphereGeometry,Vector3} from 'three';
import type {ClimbingController} from './ClimbingController';
import {LIMBS} from './types';
/** Opt-in developer overlay. Never enabled in a normal session. */
export class ClimbDebug {
  readonly group=new Group();
  private com=new Mesh(new SphereGeometry(.06,10,8),new MeshBasicMaterial({color:0xfff0a0,depthTest:false}));
  private contacts=LIMBS.map(()=>new Mesh(new SphereGeometry(.035,8,6),new MeshBasicMaterial({color:0x76e0dc,depthTest:false})));
  private supports=LIMBS.map(()=>new Line(new BufferGeometry().setFromPoints([new Vector3(),new Vector3()]),new LineBasicMaterial({color:0xa7b3ef,depthTest:false,transparent:true,opacity:.7})));
  constructor(){this.group.name='developer-climbing-overlay';this.group.visible=false;this.group.add(this.com,...this.contacts,...this.supports);}
  toggle(){this.group.visible=!this.group.visible;}
  update(climb:ClimbingController){if(!this.group.visible||!climb.active){for(const o of this.group.children)o.visible=false;return;}for(const o of this.group.children)o.visible=true;this.com.position.copy(climb.body.centerOfMass);LIMBS.forEach((limb,i)=>{const c=climb.contacts[limb];this.contacts[i].position.copy(c.point);this.contacts[i].material.color.set(c.state==='slipping'?0xe58b5f:0x76e0dc);this.supports[i].geometry.setFromPoints([climb.body.centerOfMass,c.point]);this.supports[i].visible=c.planted;});}
}
