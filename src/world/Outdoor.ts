import * as THREE from 'three';
import type { World } from '../core/contracts';
import { loadAsset } from '../assets/AssetLibrary';
import { box, cylinder, sign, lineTube, collision } from './builders';
import { surface, seeded } from './materials';
import { backpack, bottle, ropeCoil } from './props';
import { forest, meadow } from './vegetation';
import { graniteFace, mountain } from './terrain';

export async function createOutdoor():Promise<World> {
  const group=new THREE.Group();group.name='Juniper Ridge • alpine granite';
  const colliders:THREE.Box3[]=[],cameraObstacles:THREE.Object3D[]=[];const random=seeded(172);
  const ground=surface('#a4b18b','earth'),rockMat=surface('#b8bfb7','stone');
  box(group,[180,.5,180],[0,-.35,25],ground);
  // A sandy terrace and approach trail lead from the forest to the foot of the route.
  const trail=new THREE.Mesh(new THREE.PlaneGeometry(5,31),surface('#c4b99b','earth'));trail.rotation.x=-Math.PI/2;trail.position.set(0,-.07,13);trail.rotation.z=-.14;group.add(trail);
  const base=new THREE.Mesh(new THREE.CircleGeometry(8,24),surface('#c1b697','earth'));base.rotation.x=-Math.PI/2;base.position.set(0,-.065,2);base.scale.set(1,.69,1);group.add(base);
  const cliff=graniteFace();group.add(cliff);cameraObstacles.push(cliff);
  colliders.push(new THREE.Box3(new THREE.Vector3(-13,-1,-7),new THREE.Vector3(13,28,-.12)));
  // Side buttresses provide real thickness and a split granite silhouette.
  const rock=await loadAsset('granite-boulder');
  function boulder(x:number,y:number,z:number,sx:number,sy:number,sz:number,collisionEnabled=false):void {
    const b=rock.clone(true);b.position.set(x,y,z);b.scale.set(sx,sy,sz);b.rotation.y=random()*6.28;b.traverse(o=>{if(o instanceof THREE.Mesh)o.material=rockMat;});group.add(b);
    if(collisionEnabled){colliders.push(collision(b));cameraObstacles.push(b);}
  }
  boulder(-10,-1,-4,5.6,16,4.0);boulder(9.5,-1,-5,5.1,18,4.8);boulder(-4,-2,-7,8,18,5);boulder(4,-1,-9,7,17,7);
  for(let i=0;i<19;i++){const side=i%2?-1:1,x=side*(5.4+random()*9),z=random()*16-1;boulder(x,-.15,z,.3+random()*1.3,.3+random()*.65,.3+random(),true);}
  // Sparse fine cracks and ledges suggest climbable granite without hiding holds.
  const seam=surface('#696f67','stone');
  for(let i=0;i<11;i++) {
    const x=-10+i*1.91,points:THREE.Vector3[]=[];for(let j=0;j<7;j++)points.push(new THREE.Vector3(x+Math.sin(j*1.15+i)*.17,2+j*3.5,-.095));
    lineTube(group,points,.009,seam);
  }
  for(let i=0;i<14;i++) {const y=1.9+i*1.8,x=(i%2?-1:1)*(3.7+random()*4);const ledge=box(group,[.4+random()*1.0,.10,.28],[x,y,-.04],rockMat,.025);ledge.rotation.z=(random()-.5)*.2;}
  const lichen=surface('#b4b07b','stone');
  for(let i=0;i<16;i++){const stain=new THREE.Mesh(new THREE.CircleGeometry(.25+random()*.5,7),lichen);stain.position.set((i%2?-1:1)*(4+random()*6),random()*23+1,-.08);stain.scale.y=.4;stain.rotation.z=random()*6.2;group.add(stain);}
  // Continuous alpine skyline, with the open valley visible from belay and orbit views.
  const peaks=[[-55,-48,24,45],[-24,-65,24,57],[14,-68,23,63],[54,-52,26,48],[-78,10,31,47],[72,10,34,54],[-60,71,30,49],[-18,91,33,62],[31,86,29,58],[78,65,30,43]];
  peaks.forEach(([x,z,w,h],i)=>mountain(group,x,z,w,h,i%2?'#809795':'#8f9e92',i*45+12));
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;mountain(group,Math.cos(a)*57,Math.sin(a)*61+25,24,22,'#789478',300+i,false);}
  const positions:Array<[number,number,number,number]>=[];
  for(let i=0;i<95;i++){const a=random()*Math.PI*2,r=18+random()*36;let x=Math.cos(a)*r,z=8+Math.sin(a)*r;if(z<2&&Math.abs(x)<17)continue;positions.push([x,-.08,z,.7+random()*1.1]);}
  for(const side of [-1,1])for(let i=0;i<7;i++)positions.push([side*(12+i*.85),0,6+i*4.2,1+random()*.3]);forest(group,positions);meadow(group);
  // The shared base camp communicates that two climbers arrived together.
  const tarp=new THREE.Mesh(new THREE.CircleGeometry(1,7),surface('#707e6e','fabric'));tarp.rotation.x=-Math.PI/2;tarp.position.set(2.65,-.04,6.3);tarp.scale.set(1.2,.8,1);group.add(tarp);
  backpack(group,3.1,6.7,'#c68c56');backpack(group,3.4,5.8,'#658994');ropeCoil(group,2.5,6.25,'#dfb366');bottle(group,3.55,0,6.55,'#d6b776');
  const wood=surface('#827151','wood');
  const post=box(group,[.13,1.75,.13],[-4.45,.875,7],wood,.02);
  const board=box(group,[2.2,.87,.12],[-4.45,1.48,7],wood,.035);
  sign(group,'Juniper Ridge','THE LONG HELLO  /  5.7',2.08,.73,[-4.45,1.49,7.07],{background:'#425f4c',fontSize:93});colliders.push(collision(post),collision(board));
  sign(group,'Enjoy the climb.','Leave only chalk.',1.0,.34,[-4.45,.78,7.08],{background:'#bdab80',color:'#445b46',fontSize:82});
  // Delicate moving clouds and wind-blown sunlit motes sell depth at little cost.
  const clouds=new THREE.Group();group.add(clouds);const cloudMat=new THREE.MeshBasicMaterial({color:'#fff2d8',transparent:true,opacity:.45,depthWrite:false});
  for(let i=0;i<8;i++){const cloud=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),cloudMat);cloud.position.set(-70+i*21,43+(i%3)*7,-35+(i%2)*92);cloud.scale.set(7+random()*5,.8+random(),2.5);clouds.add(cloud);}
  const particles=new Float32Array(72*3);for(let i=0;i<particles.length;i+=3){particles[i]=(random()-.5)*26;particles[i+1]=random()*11+1;particles[i+2]=random()*22+3;}
  const dust=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(particles,3)),new THREE.PointsMaterial({color:'#f9e5af',size:.035,transparent:true,opacity:.55,depthWrite:false}));group.add(dust);
  const sky=new THREE.HemisphereLight('#e3edf0','#858b7d',2.2);group.add(sky);
  const sun=new THREE.DirectionalLight('#fff0d5',2.6);sun.position.set(-20,38,22);sun.target.position.set(0,10,0);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-23;sun.shadow.camera.right=23;sun.shadow.camera.top=27;sun.shadow.camera.bottom=-17;sun.shadow.normalBias=.04;sun.shadow.bias=-.0001;group.add(sun,sun.target);
  const fill=new THREE.DirectionalLight('#cadfdb',.65);fill.position.set(18,15,-10);group.add(fill);
  colliders.push(new THREE.Box3(new THREE.Vector3(-42,-1,-20),new THREE.Vector3(-40,5,50)),new THREE.Box3(new THREE.Vector3(40,-1,-20),new THREE.Vector3(42,5,50)),new THREE.Box3(new THREE.Vector3(-42,-1,49),new THREE.Vector3(42,5,51)));
  group.userData.background='#cbded5';group.userData.fog={color:'#cbded5',near:45,far:150};
  return {group,colliders,cameraObstacles,wall:{id:'outdoor-main',minX:-3,maxX:3,minY:.3,maxY:23,z:0},spawn:new THREE.Vector3(-1,0,8),belayPosition:new THREE.Vector3(.8,0,6),protection:Array.from({length:7},(_,i)=>new THREE.Vector3(i%2?.5:-.5,(i+1)*3,.35)),update:(dt,time)=>{clouds.position.x=Math.sin(time*.008)*2;dust.rotation.y=time*.004;}};
}
