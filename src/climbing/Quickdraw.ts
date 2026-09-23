import * as THREE from 'three';
export class Quickdraw {
  readonly group=new THREE.Group();
  private lower:THREE.Mesh;
  clipped=false;
  constructor(public position:THREE.Vector3){
    this.group.position.copy(position);
    const metal=new THREE.MeshStandardMaterial({color:0xaebcba,metalness:.75,roughness:.25});
    const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.04,12),metal);bolt.rotation.x=Math.PI/2;bolt.position.y=.26;this.group.add(bolt);
    for(const y of [.2,0]){
      const carabiner=new THREE.Mesh(new THREE.TorusGeometry(.058,.013,6,12),metal);carabiner.scale.y=1.65;carabiner.position.set(0,y,.065);carabiner.rotation.z=-.22;this.group.add(carabiner);
    }
    const sling=new THREE.Mesh(new THREE.BoxGeometry(.044,.18,.027),new THREE.MeshStandardMaterial({color:0xb58860,roughness:.88}));sling.position.set(0,.1,.075);this.group.add(sling);
    this.lower=new THREE.Mesh(new THREE.SphereGeometry(.042,8,6),new THREE.MeshBasicMaterial({color:0xd9a54c}));this.lower.position.set(0,0,.07);this.lower.visible=false;this.group.add(this.lower);
  }
  clip(){this.clipped=true;this.lower.visible=true;}
  dispose(){const materials=new Set<THREE.Material>();this.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();materials.add(o.material as THREE.Material);}});materials.forEach(m=>m.dispose());}
  reset(){this.clipped=false;this.lower.visible=false;}
  ropePoint(){return this.position.clone().add(new THREE.Vector3(0,0,.075));}
}
