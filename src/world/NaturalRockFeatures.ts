import * as THREE from 'three';
import type {HoldData} from '../core/contracts';
import {seeded,surface} from './materials';

/** Authored grip categories embedded in irregular, cliff-colored rock meshes. */
export class NaturalRockFeatures {
  private templates=new Map<string,THREE.Group>();
  private rock=surface('#b9bdb4','stone');
  private recess=surface('#747c70','stone');
  constructor(){this.rock.flatShading=true;}
  make(hold:HoldData):THREE.Group {
    const variant=Array.from(hold.asset).reduce((sum,c)=>sum+c.charCodeAt(0),0)%4;
    const key=`${hold.type}-${hold.grip??'edge'}-${variant}`;
    let template=this.templates.get(key);
    if(!template){
      template=new THREE.Group();
      const random=seeded(217+variant*43+key.length*13);
      const foot=hold.type==='foothold',flake=hold.grip==='sidepull'||hold.grip==='pinch';
      const width=foot?.20:flake?.18:.32, height=foot?.065:flake?.30:hold.grip==='sloper'?.23:.14;
      const geo=new THREE.SphereGeometry(1,12,8);
      const p=geo.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        const erosion=1+Math.sin(x*7+y*5+variant)*.09+Math.sin(y*11-z*6)*.06;
        // Buried, wide root merges into the cliff; the exposed lip remains readable.
        const spread=z<0?1.55:1;
        const hollow=hold.grip==='pocket'&&z>0?Math.exp(-((x-.12)**2/.16+(y-.25)**2/.15))*.08:0;
        p.setXYZ(i,x*width*erosion*spread,y*height*erosion+(x*.025),z*(z<0?.68:.19)*erosion-.005-hollow);
      }
      geo.computeVertexNormals();
      const rock=new THREE.Mesh(geo,this.rock);rock.castShadow=true;rock.receiveShadow=true;template.add(rock);
      if(hold.grip==='pocket'){
        // A recessed opening cut visually between two irregular lips, not a colored marker.
        const cavity=new THREE.Mesh(new THREE.SphereGeometry(.065,10,6),this.recess);
        cavity.scale.set(1.3,.68,.12);cavity.position.set(.025,.035,.098);cavity.userData.nonContact=true;cavity.raycast=()=>{};template.add(cavity);
      }
      // Small bedding seams share the cliff material and have no gameplay targets.
      for(let i=0;i<2;i++){
        const seam=new THREE.Mesh(new THREE.BoxGeometry(width*(1.3+random()*.5),.009,.012),this.recess);
        seam.position.set((random()-.5)*width,(-.6+i*.8)*height,.018);seam.rotation.z=(random()-.5)*.18;
        seam.userData.nonContact=true;seam.raycast=()=>{};template.add(seam);
      }
      this.templates.set(key,template);
    }
    return template.clone(true);
  }
}
