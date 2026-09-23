import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function box(parent:THREE.Object3D, size:[number,number,number], at:[number,number,number], mat:THREE.Material, radius=0): THREE.Mesh {
  const geometry=radius ? new RoundedBoxGeometry(...size,2,radius) : new THREE.BoxGeometry(...size);
  const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...at);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function cylinder(parent:THREE.Object3D, top:number,bottom:number,height:number, at:[number,number,number], mat:THREE.Material, segments=12):THREE.Mesh {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,height,segments),mat);mesh.position.set(...at);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function lineTube(parent:THREE.Object3D, points:THREE.Vector3[], radius:number, mat:THREE.Material): THREE.Mesh {
  const curve=new THREE.CatmullRomCurve3(points);const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(12,points.length*8),radius,5,false),mat);mesh.castShadow=true;parent.add(mesh);return mesh;
}
export function sign(parent:THREE.Object3D,title:string,subtitle:string,width:number,height:number,at:[number,number,number], options:{background?:string;color?:string;fontSize?:number}={}):THREE.Mesh {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*height/width);
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=options.background??'#385448';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=options.color??'#f4ebd7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`500 ${options.fontSize??Math.min(105,canvas.height*.28)}px Georgia`;ctx.fillText(title,512,canvas.height*(subtitle?.40:.5),960);
  if(subtitle){ctx.font=`500 ${Math.min(33,canvas.height*.11)}px sans-serif`;ctx.fillText(subtitle.toUpperCase(),512,canvas.height*.72,920);}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map,roughness:.8}));mesh.position.set(...at);parent.add(mesh);return mesh;
}
export function collision(mesh:THREE.Object3D):THREE.Box3 {mesh.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(mesh);}
export function sphere(parent:THREE.Object3D,radius:number,at:[number,number,number],mat:THREE.Material):THREE.Mesh {
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),mat);mesh.position.set(...at);mesh.castShadow=true;parent.add(mesh);return mesh;
}
