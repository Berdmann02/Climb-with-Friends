import * as THREE from 'three';
import { box, cylinder, lineTube, sphere, sign } from './builders';
import { colors, surface } from './materials';

const oak=surface(colors.wood,'wood'), dark=surface(colors.darkWood,'wood'), metal=surface('#4d5953',undefined,.35);
const leaf=surface('#608368'), leafLight=surface('#7f9b6b'), soil=surface('#514631','earth'), terracotta=surface('#bb7755','stone');
const cloth=surface('#c38055','fabric'), strap=surface('#394e46','fabric');
export function plant(parent:THREE.Object3D,x:number,z:number,scale=1):THREE.Group {
  const group=new THREE.Group(); group.position.set(x,0,z); group.scale.setScalar(scale);parent.add(group);
  cylinder(group,.27,.20,.46,[0,.23,0],terracotta);cylinder(group,.235,.235,.02,[0,.465,0],soil);
  for(let i=0;i<9;i++) {const a=i*2.4,h=.75+(i%3)*.28;const target=new THREE.Vector3(Math.cos(a)*.32,h,Math.sin(a)*.32);lineTube(group,[new THREE.Vector3(0,.46,0),target],.013,leaf);const l=sphere(group,.16,[target.x,target.y,target.z],i%2?leaf:leafLight);l.scale.set(.65,1.7,.33);l.rotation.set(.7*Math.cos(a),a,.65*Math.sin(a));}
  return group;
}
export function bench(parent:THREE.Object3D,x:number,z:number,angle=0):THREE.Group {
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;parent.add(g);
  for(const zz of [-.2,0,.2]) box(g,[2.5,.11,.16],[0,.57,zz],oak,.025);
  for(const xx of [-.95,.95]){box(g,[.09,.54,.44],[xx,.27,0],metal,.02);box(g,[.38,.07,.58],[xx,.05,0],metal,.02);}
  return g;
}
export function sofa(parent:THREE.Object3D,x:number,z:number,angle=0):THREE.Group {
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;parent.add(g);const fabric=surface('#ad7551','fabric');
  box(g,[2.7,.42,.94],[0,.40,0],fabric,.12);box(g,[2.7,.83,.27],[0,.73,-.40],fabric,.1);
  for(const xx of [-1.2,1.2])box(g,[.30,.7,.97],[xx,.55,0],fabric,.1);
  for(const xx of [-.6,.6]){box(g,[1.02,.16,.73],[xx,.64,.04],surface('#bb835c','fabric'),.09);box(g,[.47,.48,.14],[xx,.97,-.21],surface(xx<0?'#567b68':'#c5b279','fabric'),.06).rotation.z=xx<0?.17:-.15;}
  for(const xx of [-1,1])for(const zz of [-.3,.3])cylinder(g,.055,.04,.2,[xx,.1,zz],dark);
  return g;
}
export function bottle(parent:THREE.Object3D,x:number,y:number,z:number,color='#87a9a1'):THREE.Group {
  const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);cylinder(g,.06,.065,.25,[0,.125,0],surface(color,undefined,.45));cylinder(g,.046,.055,.045,[0,.27,0],metal);return g;
}
export function backpack(parent:THREE.Object3D,x:number,z:number,color='#ca8754'):THREE.Group {
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=.24;parent.add(g);const fabric=surface(color,'fabric');
  box(g,[.48,.67,.29],[0,.36,0],fabric,.12);box(g,[.34,.28,.11],[0,.26,.18],fabric,.045);
  for(const xx of [-.15,.15])box(g,[.055,.63,.015],[xx,.35,.19],strap,.008);
  lineTube(g,[new THREE.Vector3(-.1,.67,0),new THREE.Vector3(0,.79,0),new THREE.Vector3(.1,.67,0)],.023,strap);return g;
}
export function ropeCoil(parent:THREE.Object3D,x:number,z:number,color='#d3a765'):THREE.Group {
  const g=new THREE.Group();g.position.set(x,.04,z);parent.add(g);const mat=surface(color,'fabric');
  for(let j=0;j<5;j++){const pts=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*(.30+j*.025),j*.014,Math.sin(a)*.48));}lineTube(g,pts,.016,mat);}return g;
}
export function cubbies(parent:THREE.Object3D,x:number,z:number,angle=0):THREE.Group {
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;parent.add(g);
  box(g,[3.2,1.8,.09],[0,.9,-.29],dark);
  for(let i=0;i<=4;i++)box(g,[.07,1.8,.68],[-1.6+i*.8,.9,0],oak);
  for(let i=0;i<=3;i++)box(g,[3.2,.065,.68],[0,i*.6,0],oak);
  const sole=surface('#454c43');
  for(let i=0;i<8;i++) {const x=-1.2+(i%4)*.8,y=.1+Math.floor(i/4)*.6;for(let j=0;j<2;j++){const shoe=box(g,[.18,.12,.34],[x+j*.22-.11,y,.08],surface(i%2?'#b6ad6b':'#7f9593','fabric'),.055);box(shoe,[.19,.025,.35],[0,-.055,0],sole,.01);}}
  sign(g,'Leave your shoes.','Stay a little longer.',2.6,.44,[0,2.10,.05],{background:'#d5c19b',color:'#46594b'});return g;
}
export function coffeeBar(parent:THREE.Object3D,x:number,z:number):THREE.Group {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  box(g,[2.9,.95,.70],[0,.48,0],surface('#7c8f7b','wood'),.025);box(g,[3.04,.10,.81],[0,1.0,0],oak,.025);
  for(const xx of [-.92,0,.92]){box(g,[.86,.77,.035],[xx,.49,.368],surface('#879b83','wood'),.02);box(g,[.2,.035,.05],[xx,.75,.405],metal,.01);}
  box(g,[.54,.42,.37],[.7,1.25,-.02],metal,.04);cylinder(g,.11,.11,.28,[.7,1.25,.22],surface('#d8d2bd',undefined,.27));
  for(let i=0;i<3;i++)cylinder(g,.072,.05,.12,[-.75+i*.21,1.11,.06],surface('#eadbbd',undefined,.35));
  sign(g,'Coffee & company','The best kind of rest day',2.8,.77,[0,2.08,-.19],{background:'#e3d5b6',color:'#3d5948'});return g;
}
