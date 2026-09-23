import {Plane,Raycaster,Vector2,Vector3,type PerspectiveCamera} from 'three';
import type {HoldData,HoldType,RouteData,WallSpec} from '../core/contracts';
import type {HoldRenderer} from './HoldRenderer';
export class RouteEditor {
  active=false; type:HoldType='jug'; color='#dd795f'; selected:string|null=null;
  rotation=0; scale=1; private downPoint=new Vector2();private dragging=false;private changed=false;
  private ray=new Raycaster();private plane=new Plane(new Vector3(0,0,1),-.12);
  private history:RouteData[]=[];
  constructor(private canvas:HTMLCanvasElement,private camera:PerspectiveCamera,public route:RouteData,private wall:WallSpec,private holds:HoldRenderer,private onChange:()=>void){
    canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);window.addEventListener('pointerup',this.pointerUp);
  }
  dispose(){this.canvas.removeEventListener('pointerdown',this.pointerDown);this.canvas.removeEventListener('pointermove',this.pointerMove);window.removeEventListener('pointerup',this.pointerUp);}
  private point(e:PointerEvent){const rect=this.canvas.getBoundingClientRect();this.ray.setFromCamera(new Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);return this.ray.ray.intersectPlane(this.plane,new Vector3());}
  private inside(p:Vector3){return p.x>=this.wall.minX&&p.x<=this.wall.maxX&&p.y>=this.wall.minY&&p.y<=this.wall.maxY;}
  private pointerDown=(e:PointerEvent)=>{
    if(!this.active||e.button!==0)return;const p=this.point(e);if(!p||!this.inside(p))return;
    this.downPoint.set(e.clientX,e.clientY);this.changed=false;
    const hit=this.route.holds.filter(h=>new Vector3(...h.position).distanceTo(p)<.25*h.scale).sort((a,b)=>new Vector3(...a.position).distanceTo(p)-new Vector3(...b.position).distanceTo(p))[0];
    if(hit){this.selected=hit.id;this.dragging=true;this.remember();}
    else{if(this.route.holds.length>=600)return;this.remember();const hold:HoldData={id:crypto.randomUUID(),type:this.type,asset:`hold-${this.type}`,position:[Math.round(p.x*20)/20,Math.round(p.y*20)/20,.12],rotation:this.rotation,scale:this.scale,color:this.color,start:false,finish:false,wallId:this.wall.id};this.route.holds.push(hold);this.selected=hold.id;this.changed=true;this.refresh();}
    this.holds.select(this.selected);this.onChange();
  };
  private pointerMove=(e:PointerEvent)=>{
    if(!this.active||!this.dragging||!this.selected)return;
    if(new Vector2(e.clientX,e.clientY).distanceTo(this.downPoint)<4)return;
    const p=this.point(e),hold=this.getSelected();if(p&&hold&&this.inside(p)){hold.position=[Math.round(p.x*20)/20,Math.round(p.y*20)/20,.12];this.changed=true;this.refresh();}
  };
  private pointerUp=()=>{if(this.dragging&&!this.changed)this.history.pop();this.dragging=false;};
  getSelected(){return this.route.holds.find(h=>h.id===this.selected);}
  private remember(){this.history.push(structuredClone(this.route));if(this.history.length>40)this.history.shift();}
  refresh(){this.holds.setRoute(this.route);this.holds.select(this.selected);this.onChange();}
  choose(type:HoldType){this.type=type;this.selected=null;this.holds.select(null);this.onChange();}
  mutate(change:(h:HoldData)=>void){const h=this.getSelected();if(h){this.remember();change(h);this.refresh();}}
  rotate(amount:number){this.rotation+=amount;this.mutate(h=>h.rotation+=amount);}
  resize(scale:number){this.scale=scale;this.mutate(h=>h.scale=scale);}
  remove(){if(!this.selected)return;this.remember();this.route.holds=this.route.holds.filter(h=>h.id!==this.selected);this.selected=null;this.refresh();}
  mark(kind:'start'|'finish',value:boolean){this.mutate(h=>{if(kind==='finish'&&value)for(const other of this.route.holds)other.finish=false;h[kind]=value;});}
  setColor(color:string){this.color=color;this.mutate(h=>h.color=color);}
  undo(){const previous=this.history.pop();if(previous){Object.assign(this.route,previous);this.selected=null;this.refresh();}}
  replace(route:RouteData){this.route=route;this.history=[];this.selected=null;this.color=route.color;this.refresh();}
}
