import * as THREE from 'three';
import type { World } from '../core/contracts';
import { loadAsset } from '../assets/AssetLibrary';
import { box, cylinder, sign, collision, lineTube } from './builders';
import { colors, surface, seeded } from './materials';
import { bench, bottle, coffeeBar, cubbies, plant, sofa, backpack, ropeCoil } from './props';
import { forest } from './vegetation';

export async function createGym():Promise<World> {
  const group=new THREE.Group();group.name='The Hearth • modular gym';
  const colliders:THREE.Box3[]=[],cameraObstacles:THREE.Object3D[]=[];
  const wood=surface(colors.wood,'wood'), beam=surface(colors.darkWood,'wood'), cream=surface(colors.cream,'plywood');
  const sage=surface('#8b9c8c','plywood'), floor=surface('#d0bea0','wood'), pad=surface('#778781','fabric'), padEdge=surface('#596a63','fabric');
  floor.map=floor.map!.clone();floor.map.repeat.set(8,7);floor.map.needsUpdate=true;
  const fixed=(m:THREE.Object3D)=>{colliders.push(collision(m));cameraObstacles.push(m);};
  box(group,[24,.22,21],[0,-.15,9.8],floor);
  // Plywood seams and regular T-nut texture make the route surface read at scale.
  for(let x=0;x<4;x++)for(let y=0;y<4;y++){
    const m=box(group,[2.485,1.995,.20],[-3.75+x*2.5,1+y*2,-.10],cream);m.name='customizable-wall-panel';m.userData.customizableWall=true;cameraObstacles.push(m);
  }
  colliders.push(new THREE.Box3(new THREE.Vector3(-12,-1,-1),new THREE.Vector3(12,10,-.02)));
  box(group,[10.12,.12,.30],[0,8.08,-.03],wood);
  box(group,[10.12,.18,.12],[0,.1,.04],beam);
  for(let x=-4.6;x<5;x+=.82) {
    // Subtle chalk shadows around previous routes, applied to the panel surface.
    const chalk=new THREE.Mesh(new THREE.CircleGeometry(.08,12),new THREE.MeshBasicMaterial({color:'#faf6e9',transparent:true,opacity:.09,depthWrite:false}));chalk.position.set(x,1.1+Math.abs(Math.sin(x*9))*5.4,.006);chalk.scale.set(1,1.5,1);group.add(chalk);
  }
  // Modular neighboring faces provide slab and overhang silhouettes.
  const holdMaterials=['#d78668','#c9af61','#708f96','#ced3ba'].map(color=>surface(color,undefined,.8));
  for(const side of [-1,1]) {
    const wing=new THREE.Group();wing.position.set(side*8.0,0,.7);wing.rotation.y=side*-.18;group.add(wing);
    const mat=side<0?sage:surface('#bc9780','plywood');
    const face=box(wing,[5.8,7.35,.2],[0,3.65,-.10],mat);face.rotation.x=side<0?.14:-.10;cameraObstacles.push(face);
    fixed(box(group,[.30,8.8,.38],[side*11.6,4.4,.55],beam));
    const [jug,crimp,sloper,volume]=await Promise.all([loadAsset('hold-jug'),loadAsset('hold-crimp'),loadAsset('hold-sloper'),loadAsset('wall-volume')]);
    for(let i=0;i<34;i++) {
      const h=[jug,crimp,sloper][i%3].clone(true);const y=.7+(i%9)*.69;
      h.position.set(Math.sin(i*2.39)*2.4,y,(y-3.65)*Math.sin(side<0?.14:-.1)+.10);h.rotation.z=Math.sin(i*12)*1.6;
      h.traverse(o=>{if(o instanceof THREE.Mesh)o.material=holdMaterials[Math.floor(i/9)];});wing.add(h);
    }
    for(let i=0;i<3;i++){const v=volume.clone(true);v.position.set(-1.6+i*1.45,2.6+i*1.35,.26);v.rotation.z=i*.7;v.traverse(o=>{if(o instanceof THREE.Mesh)o.material=surface(i%2?'#6d8078':'#d9c5a0','plywood');});wing.add(v);}
  }
  // Low mats with stitched seams leave the walkway level for the controller.
  for(let x=0;x<8;x++)for(let z=0;z<3;z++) box(group,[2.97,.13,1.94],[-10.5+x*3,.0,1.0+z*1.95],pad,.025);
  box(group,[23.9,.13,.15],[0,.005,5.90],padEdge,.02);
  sign(group,'THE HEARTH','A little higher, together.',5.4,.80,[0,8.85,.08],{background:'#d7c6a6',color:'#385248',fontSize:97});
  sign(group,'01   /   your next idea','Set a line. Give it a name. Make it yours.',3.5,.50,[-3.05,7.35,.015],{background:'#ccc0a4',color:'#4f6358',fontSize:75});
  // Tall side windows with warm framing; mountains and trees beyond the glass.
  const windowMat=new THREE.MeshBasicMaterial({color:'#b7d8d5',transparent:true,opacity:.11,side:THREE.DoubleSide,depthWrite:false});
  for(const side of [-1,1]) {
    fixed(box(group,[.24,2.0,20],[side*12,1,9.5],surface('#d9ccb3','wood')));
    for(let z=2;z<21;z+=3.8){box(group,[.28,6.8,.20],[side*12,5.35,z],beam);const glass=box(group,[.04,5.7,3.53],[side*12,5.0,z+1.88],windowMat);glass.castShadow=false;}
    for(const y of [2.2,5.0,8.3])box(group,[.30,.14,20],[side*12,y,10],wood);
  }
  const trees:Array<[number,number,number,number]>=[];
  for(let i=0;i<18;i++)trees.push([i%2?-17:17,-1,Math.floor(i/2)*4-4,.85+(i%4)*.15]);forest(group,trees);
  box(group,[80,.1,55],[0,-.25,5],surface('#9ca887','earth'));
  // Timber trusses define a lodge-like interior without hiding the camera.
  const ceiling=box(group,[24,.12,21],[0,9.62,9.5],surface('#e3dbcb'));ceiling.castShadow=false;
  for(const z of [1.2,7.5,14.0,20]) {
    box(group,[24,.32,.32],[0,9.25,z],beam);
    for(const side of [-1,1]){const diagonal=box(group,[7.2,.20,.20],[side*8.7,8.37,z],wood);diagonal.rotation.z=side*.24;}
  }
  box(group,[.22,.2,21],[-7.5,9.4,9.5],wood);box(group,[.22,.2,21],[7.5,9.4,9.5],wood);
  const glow=new THREE.MeshBasicMaterial({color:'#ffdda0'});
  for(const x of [-6,6])for(const z of [4,12,19]) {
    cylinder(group,.015,.015,1.10,[x,8.65,z],beam);cylinder(group,.10,.45,.27,[x,8.02,z],surface('#425b4e'));
    cylinder(group,.36,.36,.025,[x,7.87,z],glow);
    const light=new THREE.PointLight('#ffe2a8',22,13,2);light.position.set(x,7.55,z);group.add(light);
  }
  // A compact social edge: seating, coffee, shared gear, shoes and plants.
  fixed(sofa(group,8.8,10.7,-Math.PI/2));fixed(sofa(group,8.1,14.4,Math.PI));
  const rug=box(group,[5.5,.025,4.6],[8.5,-.005,12.8],surface('#a6a78a','fabric'));rug.castShadow=false;
  const table=box(group,[1.8,.10,1.2],[7.75,.52,12.1],wood,.08);for(const x of [7.1,8.4])for(const z of [11.75,12.45])cylinder(group,.035,.035,.49,[x,.245,z],beam);fixed(table);
  bottle(group,7.3,.58,12.1);cylinder(group,.08,.06,.14,[8.3,.64,12.18],surface('#e6d5b7'));
  fixed(coffeeBar(group,9.5,18.9));fixed(cubbies(group,-9.0,18.9));
  fixed(bench(group,-8.8,8.15));fixed(bench(group,-8.8,12.2));
  for(const [x,z,s] of [[11.1,8.0,1.2],[5.6,15.5,1.1],[-11.1,15.9,1.5],[-5.6,7.0,.9],[10.7,17.0,1.0]]) plant(group,x,z,s);
  backpack(group,-10,8.9);backpack(group,10,14.9,'#718891');bottle(group,-8.6,.64,8.2,'#c29765');ropeCoil(group,-7.1,10.3);
  // A freestanding community board and route-setting cart.
  const board=new THREE.Group();board.position.set(-6.1,0,15.4);group.add(board);for(const x of [-.68,.68])box(board,[.07,2.6,.08],[x,1.3,0],beam);
  box(board,[1.6,1.75,.10],[0,1.7,0],wood,.025);sign(board,'On the board','NEW ROUTES • GOOD COMPANY',1.48,.6,[0,2.16,.06]);
  sign(board,'Sunday / slow sends','Coffee at 9. Everyone welcome.',1.25,.52,[0,1.51,.06],{background:'#eadcbd',color:'#576757'});
  sign(board,'Made by you','Set something worth sharing.',1.25,.42,[0,.95,.06],{background:'#b5c1a2',color:'#385b4a'});fixed(board);
  const cart=new THREE.Group();cart.position.set(-5.8,0,3);group.add(cart);box(cart,[.62,.1,.5],[0,.74,0],wood);
  for(const x of [-.25,.25])for(const z of [-.2,.2]){box(cart,[.025,.7,.025],[x,.37,z],beam);cylinder(cart,.07,.07,.04,[x,.07,z],beam).rotation.z=Math.PI/2;}
  box(cart,[.54,.05,.45],[0,.25,0],sage);box(cart,[.3,.17,.22],[0,.86,0],surface('#c99757'),.025);
  // Fixed rope lanes frame the customizable wall without crossing its routes.
  const ropeMat=surface('#d9ae70','fabric');
  for(const x of [-4.65,4.65]) {
    lineTube(group,[new THREE.Vector3(x,.15,.45),new THREE.Vector3(x,4,.17),new THREE.Vector3(x,7.85,.24),new THREE.Vector3(x+.25,4.2,.34),new THREE.Vector3(x+.36,.18,.62)],.016,ropeMat);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.085,.02,6,12),surface('#90988e',undefined,.24));ring.position.set(x,7.85,.17);group.add(ring);
  }
  const ambient=new THREE.HemisphereLight('#fff1d0','#7a8877',2.0);group.add(ambient);
  const sun=new THREE.DirectionalLight('#ffe2af',3.0);sun.position.set(-12,18,9);sun.target.position.set(1,1,2);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-17;sun.shadow.camera.right=17;sun.shadow.camera.top=16;sun.shadow.camera.bottom=-16;sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;group.add(sun,sun.target);
  // Invisible broad collision edges keep exploration within the architectural room.
  colliders.push(new THREE.Box3(new THREE.Vector3(-13,-1,20),new THREE.Vector3(13,4,21)));
  group.userData.background='#d8e2d5';group.userData.fog={color:'#d8e2d5',near:38,far:90};
  return {group,colliders,cameraObstacles,wall:{id:'gym-main',minX:-5,maxX:5,minY:.3,maxY:7.6,z:0},spawn:new THREE.Vector3(0,0,8),belayPosition:new THREE.Vector3(.8,0,6),protection:[]};
}
