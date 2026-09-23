import * as THREE from 'three';
import { surface, seeded } from './materials';

/** A fractured slab. The central climb corridor stays just behind the contact plane. */
export function graniteFace():THREE.Mesh {
  const nx=32,ny=38,vertices:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++) {
    const x=(i/nx-.5)*23;
    const crest=1.0*Math.sin(x*1.7)+.8*Math.cos(x*.47);
    const y=j/ny*27.5+Math.pow(j/ny,9)*crest;
    const grain=Math.sin(x*1.38+y*.57)*.24+Math.sin(x*3.71-y*.16)*.14;
    const fracture=Math.sin(y*.89+x*.16)*.21;
    const central=Math.max(0,Math.min(1,(Math.abs(x)-2.8)/2.8));
    const z=-.20-Math.abs(grain)-Math.abs(fracture)+(grain*3+Math.sin(y*.4)*.7)*central;
    vertices.push(x,y,z);uv.push(i/nx*7,j/ny*8);
    const tint=.86+Math.sin(x*.49+y*.72)*.06+Math.sin(y*2.2)*.035;
    const c=new THREE.Color('#e3e6e1').multiplyScalar(tint);colors.push(c.r,c.g,c.b);
    if(i<nx&&j<ny){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,b,c,b,d,c);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  const mat=surface('#dadcd5','stone');mat.vertexColors=true;
  const mesh=new THREE.Mesh(g,mat);mesh.receiveShadow=true;mesh.castShadow=true;return mesh;
}

export function mountain(parent:THREE.Object3D,x:number,z:number,width:number,height:number,color:string,seed:number,snow=true):void {
  const random=seeded(seed),vertices:number[]=[],indices:number[]=[],vertexColors:number[]=[],n=13;
  const col=new THREE.Color(color);
  const tiers=[{y:0,r:1},{y:.53,r:.53},{y:.76,r:.23},{y:1,r:.015}];
  tiers.forEach((tier,j)=>{for(let i=0;i<n;i++){const a=i/n*Math.PI*2,r=tier.r*(.80+random()*.35);vertices.push(Math.cos(a)*width*r+Math.sin(j)*height*.08,tier.y*height+(j>0&&j<3?(random()-.5)*height*.12:0),Math.sin(a)*width*r*.7);const c=snow&&j>=2?new THREE.Color('#edf0dc'):col.clone().multiplyScalar(.82+random()*.27);vertexColors.push(c.r,c.g,c.b);}});
  for(let j=0;j<3;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n;indices.push(a,a+n,b,b,a+n,b+n);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));m.position.set(x,-7,z);parent.add(m);
}
