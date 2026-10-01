import * as THREE from 'three';
import { surface, seeded } from './materials';

export function mountain(parent:THREE.Object3D,x:number,z:number,width:number,height:number,color:string,seed:number,snow=true):void {
  const random=seeded(seed),vertices:number[]=[],indices:number[]=[],vertexColors:number[]=[],n=13;
  const col=new THREE.Color(color);
  const tiers=[{y:0,r:1},{y:.53,r:.53},{y:.76,r:.23},{y:1,r:.015}];
  tiers.forEach((tier,j)=>{for(let i=0;i<n;i++){const a=i/n*Math.PI*2,r=tier.r*(.80+random()*.35);vertices.push(Math.cos(a)*width*r+Math.sin(j)*height*.08,tier.y*height+(j>0&&j<3?(random()-.5)*height*.12:0),Math.sin(a)*width*r*.7);const c=snow&&j>=2?new THREE.Color('#edf0dc'):col.clone().multiplyScalar(.82+random()*.27);vertexColors.push(c.r,c.g,c.b);}});
  for(let j=0;j<3;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n;indices.push(a,a+n,b,b,a+n,b+n);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));m.position.set(x,-7,z);parent.add(m);
}
