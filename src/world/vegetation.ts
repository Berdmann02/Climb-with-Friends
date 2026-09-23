import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded, surface } from './materials';

function colored(geo:THREE.BufferGeometry,color:string):THREE.BufferGeometry {
  const c=new THREE.Color(color);const data=new Float32Array(geo.getAttribute('position').count*3);for(let i=0;i<data.length;i+=3){data[i]=c.r;data[i+1]=c.g;data[i+2]=c.b;}geo.setAttribute('color',new THREE.BufferAttribute(data,3));return geo;
}
/** One instanced geometry contains both trunk and softly layered evergreen canopy. */
export function forest(parent:THREE.Object3D,positions:Array<[number,number,number,number]>,seed=8):THREE.InstancedMesh {
  const pieces:THREE.BufferGeometry[]=[];
  pieces.push(colored(new THREE.CylinderGeometry(.12,.21,2.7,7).translate(0,1.35,0),'#706446'));
  for(let i=0;i<4;i++) {
    const shape=new THREE.ConeGeometry(1.45-i*.26,2.20-i*.15,9,1);shape.translate(0,2.0+i*.67,0);
    pieces.push(colored(shape,['#536d53','#5f7c5f','#66845f','#76906a'][i]));
  }
  const mesh=new THREE.InstancedMesh(mergeGeometries(pieces),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,flatShading:true}),positions.length);
  const d=new THREE.Object3D(),random=seeded(seed);
  positions.forEach(([x,y,z,scale],i)=>{d.position.set(x,y,z);d.scale.setScalar(scale);d.rotation.y=random()*6.28;d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});
  mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function meadow(parent:THREE.Object3D,seed=51):void {
  const random=seeded(seed),count=190;const geo=new THREE.ConeGeometry(.16,.5,3);geo.translate(0,.25,0);
  const mesh=new THREE.InstancedMesh(geo,surface('#87945c'),count);const flowerGeo=new THREE.SphereGeometry(.055,5,3);
  const blooms=new THREE.InstancedMesh(flowerGeo,surface('#e2bb78'),90);const d=new THREE.Object3D();let j=0;
  for(let i=0;i<count;i++) {let x=(random()-.5)*47,z=random()*30+3;if(Math.abs(x)<5&&z<16)x+=x<0?-6:6;d.position.set(x,0,z);d.rotation.y=random()*6.28;d.scale.set(.7+random(),.5+random(),.7+random());d.updateMatrix();mesh.setMatrixAt(i,d.matrix);if(j<90){d.position.y=.35*d.scale.y;d.scale.setScalar(.8+random()*.6);d.updateMatrix();blooms.setMatrixAt(j++,d.matrix);}}
  mesh.receiveShadow=true;parent.add(mesh,blooms);
}
