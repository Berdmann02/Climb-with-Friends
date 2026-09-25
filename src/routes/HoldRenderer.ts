import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {HoldData,HoldType,RouteData} from '../core/contracts';
import {registerHoldSurface,type HoldSurfaceMetadata,type SurfaceGrip} from '../climbing/ContactSolver';
import {NaturalRockFeatures} from '../world/NaturalRockFeatures';
export class HoldRenderer {
  readonly group=new THREE.Group();
  private templates=new Map<HoldType,THREE.Group>();
  readonly meshes=new Map<string,THREE.Group>();
  private surfaces=new Map<HoldType,HoldSurfaceMetadata>();
  private route:RouteData|null=null;
  private companions:RouteData[]=[];
  private natural=new NaturalRockFeatures();
  private fallbackGeometry=new THREE.SphereGeometry(1,16,10);
  private boltGeometry=new THREE.CylinderGeometry(.018,.018,.018,8);
  private boltMaterial=new THREE.MeshStandardMaterial({color:0x4c5150,metalness:.7,roughness:.35});
  private markerGeometry=new THREE.PlaneGeometry(1,1);
  private startMaterial=new THREE.MeshBasicMaterial({color:0xf7f4e9,side:THREE.DoubleSide});
  private finishMaterial=new THREE.MeshBasicMaterial({color:0xffe8a4,side:THREE.DoubleSide});
  private ring=new THREE.Mesh(new THREE.TorusGeometry(.23,.014,6,32),new THREE.MeshBasicMaterial({color:0xfff5d4,depthTest:false}));
  constructor(){this.ring.raycast=()=>{};}
  async load(){
    const loader=new GLTFLoader();
    await Promise.all((['jug','crimp','sloper','pinch','foothold'] as HoldType[]).map(async type=>{
      try{
        const gltf=await loader.loadAsync(`/assets/hold-${type}.glb`);this.templates.set(type,gltf.scene);
        const surface=this.sampleSurface(gltf.scene,type);this.surfaces.set(type,surface);registerHoldSurface(`hold-${type}`,surface);
      }catch{console.warn(`Using procedural ${type} hold fallback.`);}
    }));
    if(this.route)this.setRoute(this.route);
  }
  /** Samples the actual resin mesh before decorative bolts/tape are added. */
  private sampleSurface(model:THREE.Group,type:HoldType):HoldSurfaceMetadata {
    model.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(model),ray=new THREE.Raycaster();
    const sample=(height:number):SurfaceGrip=>{
      const y=THREE.MathUtils.clamp(height,bounds.min.y+.01,bounds.max.y-.008);
      ray.set(new THREE.Vector3(0,y,bounds.max.z+.25),new THREE.Vector3(0,0,-1));
      const hit=ray.intersectObject(model,true)[0];
      if(hit){
        const normal=hit.face?hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize():new THREE.Vector3(0,0,1);
        return {point:hit.point.clone(),normal};
      }
      return {point:new THREE.Vector3(0,y,bounds.max.z),normal:new THREE.Vector3(0,0,1)};
    };
    return {hand:sample(type==='crimp'?.018:type==='pinch'?.015:.045),foot:sample(Math.max(.018,bounds.max.y*.65))};
  }
  setRoute(route:RouteData){
    this.route=route;
    for(const mesh of this.meshes.values())mesh.traverse(o=>{if(o instanceof THREE.Mesh && o.userData.ownedMaterial)(o.material as THREE.Material).dispose();});
    this.group.clear();this.meshes.clear();
    for(const shown of [route,...this.companions.filter(r=>r.wallId!==route.wallId)])for(const hold of shown.holds){const mesh=this.makeHold(hold);this.group.add(mesh);this.meshes.set(hold.id,mesh);}
    this.ring.visible=false;this.group.add(this.ring);
  }
  setCompanionRoutes(routes:RouteData[]){this.companions=routes;}
  private makeHold(hold:HoldData){
    if(hold.wallId.startsWith('outdoor')){
      const mesh=this.natural.make(hold);
      const sampled=this.sampleSurface(mesh,hold.type);registerHoldSurface(hold.asset,sampled);
      mesh.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.nonContact)o.userData.holdId=hold.id;});
      mesh.position.fromArray(hold.position);mesh.rotation.z=hold.rotation;mesh.scale.setScalar(hold.scale);mesh.userData.holdId=hold.id;
      return mesh;
    }
    const mesh=this.templates.get(hold.type)?.clone(true)??new THREE.Group();
    if(mesh.children.length===0){
      const fallback=new THREE.Mesh(this.fallbackGeometry,this.boltMaterial);
      fallback.scale.set(hold.type==='foothold'?.12:.2,hold.type==='crimp'?.075:.14,.105);mesh.add(fallback);
    }
    // Failed asset loads use their real procedural shape, whose depth differs
    // from the authored GLB. Cache once in model space before route transforms.
    let surface=this.surfaces.get(hold.type);
    if(!surface){surface=this.sampleSurface(mesh,hold.type);this.surfaces.set(hold.type,surface);}
    mesh.traverse(o=>{if(o instanceof THREE.Mesh){const mat=new THREE.MeshStandardMaterial({color:hold.color,roughness:.87});o.material=mat;o.castShadow=true;o.receiveShadow=true;o.userData.holdId=hold.id;o.userData.ownedMaterial=true;}});
    mesh.position.fromArray(hold.position);mesh.rotation.z=hold.rotation;mesh.scale.setScalar(hold.scale);mesh.userData.holdId=hold.id;
    mesh.userData.contactSurface=surface;registerHoldSurface(hold.asset,surface);
    const bolt=new THREE.Mesh(this.boltGeometry,this.boltMaterial);bolt.rotation.x=Math.PI/2;bolt.position.z=.12;bolt.userData.nonContact=true;bolt.raycast=()=>{};mesh.add(bolt);
    if(hold.start||hold.finish){
      const tape=new THREE.Mesh(this.markerGeometry,hold.finish?this.finishMaterial:this.startMaterial);
      tape.scale.set(hold.finish?.18:.07,.16,1);tape.position.set(0,-.23,.005);tape.userData.nonContact=true;tape.raycast=()=>{};mesh.add(tape);
    }
    return mesh;
  }
  updateTransform(hold:HoldData){const mesh=this.meshes.get(hold.id);if(mesh){mesh.position.fromArray(hold.position);mesh.rotation.z=hold.rotation;mesh.scale.setScalar(hold.scale);this.select(hold.id);}}
  select(id:string|null){const mesh=id?this.meshes.get(id):null;this.ring.visible=!!mesh;if(mesh)this.ring.position.copy(mesh.position).add(new THREE.Vector3(0,0,.24));}
  dispose(){this.companions=[];this.setRoute({version:1,id:'dispose',name:'',creator:'',color:'#fff',holds:[],wallId:'',routeType:'TOP_ROPE',grade:'',createdAt:''});}
}
