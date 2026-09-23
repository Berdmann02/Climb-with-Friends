import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {HoldData,HoldType,RouteData} from '../core/contracts';
export class HoldRenderer {
  readonly group=new THREE.Group();
  private templates=new Map<HoldType,THREE.Group>();
  readonly meshes=new Map<string,THREE.Group>();
  private route:RouteData|null=null;
  private ring=new THREE.Mesh(new THREE.TorusGeometry(.23,.014,6,32),new THREE.MeshBasicMaterial({color:0xfff5d4,depthTest:false}));
  async load(){
    const loader=new GLTFLoader();
    await Promise.all((['jug','crimp','sloper','pinch','foothold'] as HoldType[]).map(async type=>{
      try{const gltf=await loader.loadAsync(`/assets/hold-${type}.glb`);this.templates.set(type,gltf.scene);}catch{console.warn(`Using procedural ${type} hold fallback.`);}
    }));
    if(this.route)this.setRoute(this.route);
  }
  setRoute(route:RouteData){
    this.route=route;
    for(const mesh of this.meshes.values())mesh.traverse(o=>{if(o instanceof THREE.Mesh && o.userData.ownedMaterial)(o.material as THREE.Material).dispose();});
    this.group.clear();this.meshes.clear();
    for(const hold of route.holds){const mesh=this.makeHold(hold);this.group.add(mesh);this.meshes.set(hold.id,mesh);}
    this.ring.visible=false;this.group.add(this.ring);
  }
  private makeHold(hold:HoldData){
    const mesh=this.templates.get(hold.type)?.clone(true)??new THREE.Group();
    if(mesh.children.length===0){
      const fallback=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshStandardMaterial());
      fallback.scale.set(hold.type==='foothold'?.12:.2,hold.type==='crimp'?.075:.14,.105);mesh.add(fallback);
    }
    mesh.traverse(o=>{if(o instanceof THREE.Mesh){const mat=new THREE.MeshStandardMaterial({color:hold.color,roughness:.87});o.material=mat;o.castShadow=true;o.receiveShadow=true;o.userData.holdId=hold.id;o.userData.ownedMaterial=true;}});
    mesh.position.fromArray(hold.position);mesh.rotation.z=hold.rotation;mesh.scale.setScalar(hold.scale);mesh.userData.holdId=hold.id;
    const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.018,8),new THREE.MeshStandardMaterial({color:0x4c5150,metalness:.7,roughness:.35}));bolt.rotation.x=Math.PI/2;bolt.position.z=.12;mesh.add(bolt);
    if(hold.start||hold.finish){
      const tape=new THREE.Mesh(new THREE.PlaneGeometry(hold.finish?.18:.07,.16),new THREE.MeshBasicMaterial({color:hold.finish?0xffe8a4:0xf7f4e9,side:THREE.DoubleSide}));
      tape.position.set(0,-.23,.005);mesh.add(tape);
    }
    return mesh;
  }
  select(id:string|null){const mesh=id?this.meshes.get(id):null;this.ring.visible=!!mesh;if(mesh)this.ring.position.copy(mesh.position).add(new THREE.Vector3(0,0,.24));}
  highlight(ids:string[]){for(const [id,mesh] of this.meshes){mesh.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){o.material.emissive.set(ids.includes(id)?0x39271b:0x000000);o.material.emissiveIntensity=.3;}});}}
  dispose(){this.setRoute({version:1,id:'dispose',name:'',creator:'',color:'#fff',holds:[],wallId:'',grade:'',createdAt:''});}
}
