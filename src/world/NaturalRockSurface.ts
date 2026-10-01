import {BufferGeometry, Color, Float32BufferAttribute, MathUtils, Mesh, Vector3} from 'three';
import type {RockSample} from '../climbing/types';
import {seeded, surface} from './materials';

interface Flake {x:number;y:number;w:number;h:number;depth:number;tilt:number;pocket:boolean;}
const clamp=MathUtils.clamp;

/** One continuous granite mesh. Contact samples interpolate its actual triangles. */
export class NaturalRockSurface {
  readonly mesh:Mesh;
  readonly minX=-11.5;readonly maxX=11.5;readonly maxY=27.5;
  private nx=288;private ny=420;
  private dx=(this.maxX-this.minX)/this.nx;private dy=this.maxY/this.ny;
  private heights=new Float32Array((this.nx+1)*(this.ny+1));
  constructor(){
    const random=seeded(413),flakes:Flake[]=[];
    // Bedding is irregular, with smooth stretches between more fractured bands.
    for(let i=0;i<520;i++){
      const x=this.minX+random()*23,y=.2+random()*27;
      if(Math.sin(x*.7+y*.37)>.68&&random()>.18)continue;
      flakes.push({x,y,w:.12+random()*.65,h:.06+random()*.24,depth:.035+random()*.12,tilt:(random()-.5)*.55,pocket:random()<.18});
    }
    // A low broken bedding seam allows a natural start, rather than placed holds.
    flakes.push({x:0,y:1.38,w:1.25,h:.18,depth:.18,tilt:.03,pocket:false});
    flakes.push({x:.1,y:4.18,w:1.6,h:.18,depth:.16,tilt:-.025,pocket:false});
    flakes.push({x:0,y:22.2,w:1.35,h:.2,depth:.17,tilt:-.025,pocket:false});
    const vertices:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
    for(let j=0;j<=this.ny;j++)for(let i=0;i<=this.nx;i++){
      const x=this.minX+i*this.dx,y=j*this.dy;
      let z=-.32+.24*Math.sin(x*.56+y*.22)+.14*Math.cos(x*.91-y*.31)
        +.12*Math.tanh((x-1.3-Math.sin(y*.24)*.7)*2.4)
        +.055*Math.sin(y*1.23+x*.4);
      z+=.22*Math.exp(-((x+2.4)**2/5+(y-12.7)**2/3.2));
      const density=.35+.65*(.5+.5*Math.sin(x*.73+y*.39));
      z+=density*(.018*Math.sin(x*8.7+y*4.6)+.008*Math.sin(x*17.3-y*9.1)+.005*Math.cos(x*26+y*19));
      // Fracture grooves are continuous and wind through the actual surface.
      for(const crack of [-6.8,-2.2,2.7,7.1]){
        const distance=x-crack-Math.sin(y*.53+crack)*.16;
        z-=.085*Math.exp(-distance*distance/.007);
      }
      for(const f of flakes){
        const u=(x-f.x)/f.w,v=y-f.y-(x-f.x)*f.tilt;
        if(Math.abs(u)>2.6||Math.abs(v)>f.h*4)continue;
        const side=Math.exp(-u*u*2);
        if(f.pocket)z-=f.depth*side*Math.exp(-v*v/(f.h*f.h));
        else {
          // Rounded buried root, steeper upper lip: a rail cut from the same rock.
          const lower=.5+.5*Math.tanh((v+f.h)/(.7*f.h));
          const upper=.5-.5*Math.tanh(v/Math.max(.028,f.h*.23));
          z+=f.depth*side*lower*upper;
        }
      }
      this.heights[j*(this.nx+1)+i]=z;
      vertices.push(x,y,z);uv.push(x*.36,y*.36);
      const tint=.9+.04*Math.sin(x*.38+y*.47)+.025*Math.sin(x*2.1-y*.75);
      const color=new Color('#dddcd0').multiplyScalar(tint);
      if(Math.sin(x*.31+y*.13)>.77)color.lerp(new Color('#afb093'),.12);
      colors.push(color.r,color.g,color.b);
      if(i<this.nx&&j<this.ny&&(j+1)*this.dy<=Math.min(this.crest(x),this.crest(x+this.dx))){const a=j*(this.nx+1)+i,b=a+1,c=a+this.nx+1,d=c+1;indices.push(a,b,c,b,d,c);}
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const material=surface('#bebcaf','stone');material.vertexColors=true;material.roughness=.98;
    this.mesh=new Mesh(geometry,material);this.mesh.name='continuous climbable granite';
    this.mesh.receiveShadow=true;this.mesh.castShadow=true;this.mesh.userData.climbableRock=true;
    // The same triangle height sampler avoids scanning 240k faces on each pointer move.
    this.mesh.raycast=(caster,hits)=>{
      const ray=caster.ray,bounds=geometry.boundingBox!,padded=bounds.clone().expandByScalar(.001),entry=ray.intersectBox(bounds,new Vector3());if(!entry)return;
      const start=Math.max(caster.near,bounds.containsPoint(ray.origin)?0:ray.origin.distanceTo(entry));
      const size=bounds.getSize(new Vector3()).length(),end=Math.min(caster.far,start+size);
      const position=new Vector3();let previousT=start,previous:number|null=null;
      for(let t=start;t<=end;t+=.035){
        ray.at(t,position);
        if(!padded.containsPoint(position)){if(previous!==null)break;continue;}
        const delta=position.z-this.height(position.x,position.y);
        if(previous!==null&&previous>=0&&delta<=0){
          let low=previousT,high=t;
          for(let i=0;i<10;i++){const mid=(low+high)*.5;ray.at(mid,position);if(position.z>this.height(position.x,position.y))low=mid;else high=mid;}
          const distance=(low+high)*.5;ray.at(distance,position);const patch=this.sample(position);if(!patch)return;
          hits.push({distance,point:position.clone(),object:this.mesh,face:{a:0,b:1,c:2,normal:patch.normal,materialIndex:0}});return;
        }
        previous=delta;previousT=t;
      }
    };
  }

  private crest(x:number):number {return 26.8+.35*Math.sin(x*1.7)+.35*Math.cos(x*.43);}

  private height(x:number,y:number):number {
    const gx=clamp((x-this.minX)/this.dx,0,this.nx-.000001),gy=clamp(y/this.dy,0,this.ny-.000001);
    const i=Math.floor(gx),j=Math.floor(gy),u=gx-i,v=gy-j,a=j*(this.nx+1)+i;
    const z00=this.heights[a],z10=this.heights[a+1],z01=this.heights[a+this.nx+1],z11=this.heights[a+this.nx+2];
    return u+v<=1?z00+(z10-z00)*u+(z01-z00)*v:z11+(z01-z11)*(1-u)+(z10-z11)*(1-v);
  }

  sample(point:Vector3):RockSample|null {
    const {x,y}=point;if(x<this.minX||x>this.maxX||y<0||y>this.maxY)return null;
    const z=this.height(x,y),r=.065;
    // Face normal matches the triangle used by height interpolation exactly.
    const gx=clamp((x-this.minX)/this.dx,0,this.nx-.000001),gy=clamp(y/this.dy,0,this.ny-.000001);
    const cellX=this.minX+Math.floor(gx)*this.dx;
    if((Math.floor(gy)+1)*this.dy>Math.min(this.crest(cellX),this.crest(cellX+this.dx)))return null;
    const a=Math.floor(gy)*(this.nx+1)+Math.floor(gx),upper=(gx%1)+(gy%1)>1;
    const sx=upper?(this.heights[a+this.nx+2]-this.heights[a+this.nx+1])/this.dx:(this.heights[a+1]-this.heights[a])/this.dx;
    const sy=upper?(this.heights[a+this.nx+2]-this.heights[a+1])/this.dy:(this.heights[a+this.nx+1]-this.heights[a])/this.dy;
    const normal=new Vector3(-sx,-sy,1).normalize();
    const top=this.height(x,y+r),bottom=this.height(x,y-r),left=this.height(x-r,y),right=this.height(x+r,y);
    const edgeDepth=Math.max(0,z-top),underDepth=Math.max(0,z-bottom),sideDepth=Math.max(0,z-Math.min(left,right));
    const curvature=Math.abs(top+bottom-2*z)+Math.abs(left+right-2*z);
    const roughness=clamp(curvature*7,.08,.85),friction=clamp(.50+roughness*.36,.5,.85);
    let grip:RockSample['grip']='sloper',strength=.14+roughness*.12,direction=new Vector3(0,-1,0);
    if(edgeDepth>.025&&normal.y>.15){grip=edgeDepth>.065?'edge':'crimp';strength=clamp(.42+edgeDepth*5,.42,.91);}
    else if(underDepth>.032&&normal.y<-.28){grip='undercling';strength=clamp(.43+underDepth*3,.43,.82);direction.set(0,1,0);}
    else if(sideDepth>.025&&Math.abs(normal.x)>.28){grip='sidepull';strength=clamp(.38+sideDepth*3,.38,.79);direction.set(normal.x>0?-1:1,-.12,0).normalize();}
    else if(normal.y>.22){strength=clamp(.25+normal.y*.44+roughness*.13,.25,.72);}
    return {point:new Vector3(x,y,z),normal,grip,strength,friction,direction,edgeDepth,roughness};
  }

  /** Closest nearby patch, never a route marker. No candidate exceeds the radius. */
  nearby(point:Vector3,radius:number):RockSample|null {
    let best:RockSample|null=null,cost=Infinity;
    for(const x of [-radius*.6,0,radius*.6])for(const y of [-radius*.6,0,radius*.6]){
      const s=this.sample(point.clone().add(new Vector3(x,y,0)));if(!s)continue;
      const d=s.point.distanceTo(point);if(d>radius)continue;
      // Favor a real lip within finger width, without jumping to a remote target.
      const score=d-(s.strength>.32?.018:0);
      if(score<cost){cost=score;best=s;}
    }
    return best;
  }
}
