import * as THREE from 'three';
import {Input} from './Input';
import {ThirdPersonCamera} from './ThirdPersonCamera';
import {GameAudio} from './Audio';
import type {LocationId,RouteData,World,WallSpec} from './contracts';
import {createGym} from '../world/Gym';
import {createOutdoor} from '../world/Outdoor';
import {Character} from '../player/Character';
import {PlayerController} from '../player/PlayerController';
import {ClimbingController} from '../climbing/ClimbingController';
import {OutdoorSession} from '../belay/OutdoorSession';
import type {BelayAction} from '../belay/BelayController';
import {ClimbInput,surfaceForWorld} from '../climbing/ClimbInput';
import {BoulderController} from '../climbing/BoulderController';
import {ClimbFinishController} from '../climbing/ClimbFinishController';
import {nearbyInteraction} from '../systems/WorldInteractions';
import {routeMatchesWall,routeTypeForWall} from '../routes/RouteMode';
import {ClimbDebug} from '../climbing/ClimbDebug';
import {LIMBS} from '../climbing/types';
import {HoldRenderer} from '../routes/HoldRenderer';
import {RouteEditor} from '../routes/RouteEditor';
import {RouteStore,deserializeRoute,serializeRoute,isHoldWithinWall} from '../routes/RouteStore';
import {createDefaultRoute} from '../routes/defaults';
import {UI,type UIAction} from '../ui/UI';

export class Game {
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,260);
  readonly ui:UI;readonly input:Input;readonly cameraRig:ThirdPersonCamera;readonly audio=new GameAudio();
  readonly player=new Character('#cb7655');readonly partner=new Character('#638e8a',true);
  readonly climb=new ClimbingController(this.player);readonly store=new RouteStore();readonly holds=new HoldRenderer();
  readonly movement:PlayerController;
  private readonly boulder=new BoulderController();
  private readonly finish=new ClimbFinishController();
  private readonly climbDebug=new ClimbDebug();
  private readonly climbInput:ClimbInput;
  private manualBelayAction:BelayAction='neutral';
  private worlds=new Map<LocationId,World>();private routes=new Map<string,RouteData>();
  world!:World;route!:RouteData;editor!:RouteEditor;outdoor!:OutdoorSession;
  location:LocationId='gym';menu=true;paused=false;private loading=false;private time=0;private last=0;private hudTick=0;private stepTimer=0;private wallMood=0;
  constructor(root:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    root.append(this.renderer.domElement);this.ui=new UI(root);this.input=new Input(this.renderer.domElement);this.cameraRig=new ThirdPersonCamera(this.camera,this.input);this.movement=new PlayerController(this.player,this.input);this.cameraRig.snap();
    this.scene.add(this.player.group,this.partner.group,this.holds.group,this.climbDebug.group);
    this.climbInput=new ClimbInput(this.renderer.domElement,this.camera,this.input);
    this.ui.onAction=a=>this.action(a);this.ui.onHold=t=>this.editor.choose(t);this.ui.onColor=c=>{this.route.color=c;this.editor.setColor(c);this.syncRouteUI();};
    this.ui.onLimb=limb=>{if(this.climb.active&&!this.player.isClipping&&this.outdoor.role==='climber')this.climb.selectLimb(limb);};
    this.ui.onMood=index=>this.applyWallMood(index);
    this.ui.onGrip=grip=>this.editor.mutate(h=>{h.grip=grip;});
    this.ui.onName=name=>{this.route.name=name;this.syncRouteUI();};this.ui.onMark=(k,v)=>this.editor.mark(k,v);this.ui.onScale=s=>this.editor.resize(s);this.ui.onLoad=id=>this.loadRoute(id);
    this.ui.el<HTMLInputElement>('route-file').addEventListener('change',e=>{const file=(e.target as HTMLInputElement).files?.[0];if(file)void this.importRoute(file);(e.target as HTMLInputElement).value='';});
    this.renderer.domElement.addEventListener('click',e=>this.pickHold(e));
    document.addEventListener('pointerdown',()=>this.audio.unlock(),{once:true});
    window.addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);});
    for(const dialog of this.ui.root.querySelectorAll('dialog'))dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close();this.paused=false;this.input.clear();});
    window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!this.menu){e.preventDefault();const dialog=this.ui.root.querySelector<HTMLDialogElement>('dialog[open]');if(dialog){dialog.close();this.paused=false;this.input.clear();}else this.action('pause');}});
    this.exposeDebug();
  }
  async start(){await this.changeLocation('gym',true);await this.holds.load();this.ui.loading(false);this.renderer.setAnimationLoop(t=>this.frame(t));}
  private async changeLocation(location:LocationId,menu=false){
    if(this.loading)return;this.loading=true;this.ui.loading(true);this.climb.stop();this.boulder.reset();this.finish.reset();this.editor?.dispose();this.input.clear();this.movement.reset();
    if(this.world)this.scene.remove(this.world.group);
    let world=this.worlds.get(location);if(!world){world=await (location==='gym'?createGym():createOutdoor());this.worlds.set(location,world);}
    this.world=world;this.location=location;this.menu=menu;this.paused=false;this.ui.el<HTMLDialogElement>('pause-dialog').close();this.scene.add(world.group);
    this.scene.background=new THREE.Color(world.group.userData.background);const fog=world.group.userData.fog;this.scene.fog=new THREE.Fog(fog.color,fog.near,fog.far);
    for(const wall of world.walls??[world.wall])if(!this.routes.has(wall.id))this.routes.set(wall.id,createDefaultRoute(location,wall));
    this.activateWall((world.walls??[world.wall])[0]);
    this.player.group.position.copy(world.spawn);this.player.group.rotation.set(0,0,0);
    this.player.group.visible=!menu;this.partner.group.visible=!menu&&this.routeType!=='BOULDER';
    this.outdoor.rope.group.visible=false;this.manualBelayAction='neutral';
    this.cameraRig.reset(location==='outdoor');this.finish.reset();this.syncRouteUI();this.syncMode();this.ui.loading(false);this.loading=false;
  }
  private get routeType(){return this.route.routeType??routeTypeForWall(this.route.wallId);}
  private activateWall(wall:WallSpec){
    this.editor?.dispose();this.climb.stop();this.boulder.reset();this.finish.reset();
    this.world.wall=wall;this.route=this.routes.get(wall.id)??createDefaultRoute(this.location,wall);this.routes.set(wall.id,this.route);
    this.holds.setCompanionRoutes((this.world.walls??[wall]).filter(w=>w.id!==wall.id).map(w=>this.routes.get(w.id)!).filter(Boolean));
    this.holds.setRoute(this.route);this.climb.setRoute(this.route);this.climb.setSurface(surfaceForWorld(this.world));
    this.editor=new RouteEditor(this.renderer.domElement,this.camera,this.route,wall,this.holds,()=>this.syncRouteUI());
    this.editor.color=this.route.color;
    this.cameraRig.editorFocus.set((wall.minX+wall.maxX)/2-.65,wall.maxY*.52,wall.z);
    this.cameraRig.editorDistance=Math.max(6.8,wall.maxY*1.6);
    if(this.outdoor){this.scene.remove(this.outdoor.rope.group);this.outdoor.rope.dispose();for(const draw of this.outdoor.draws){this.scene.remove(draw.group);draw.dispose();}}
    const anchor=this.routeType==='TOP_ROPE'?new THREE.Vector3(...(wall.topAnchor??[(wall.minX+wall.maxX)/2,wall.maxY+.3,.25] as [number,number,number])):null;
    this.outdoor=new OutdoorSession(this.player,this.partner,this.climb,this.routeType==='LEAD'?this.world.protection:[],this.world.belayPosition,this.audio,()=>{},anchor);
    this.outdoor.setWallDepth(wall.z);if(this.routeType!=='BOULDER')this.scene.add(this.outdoor.rope.group);this.outdoor.rope.group.visible=false;
    for(const draw of this.outdoor.draws)this.scene.add(draw.group);
    this.partner.group.rotation.set(0,0,0);this.partner.group.visible=!this.menu&&this.routeType!=='BOULDER';
    this.manualBelayAction='neutral';
  }
  private interaction(){return !this.menu&&!this.editor.active&&!this.climb.active&&!this.outdoor.suspended&&!this.boulder.active?nearbyInteraction(this.player.group,this.world):null;}
  private beginFall(){
    if(this.routeType==='BOULDER'){
      if(!this.climb.active&&!this.climb.didFall)return;
      this.climb.stop();this.boulder.begin(this.player,surfaceForWorld(this.world).normal);this.movement.reset();
    }else this.outdoor.fall(this.climb.didFall);
  }
  private applyWallMood(index:number){
    if(this.location!=='gym'||!this.ui.el<HTMLDialogElement>('mood-dialog').open)return;
    this.wallMood=THREE.MathUtils.clamp(Math.round(index),0,2);
    this.world.group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.customizableWall)(o.material as THREE.MeshStandardMaterial).color.set(['#e0cfad','#a9b7a2','#c5ada0'][this.wallMood]);});
  }
  private syncMode(){this.ui.mode(this.menu,this.editor.active,this.location==='outdoor');this.holds.select(this.editor.active?this.editor.selected:null);}
  private syncRouteUI(){if(!this.editor)return;this.ui.route(this.route,this.location);this.ui.editor(this.route,this.editor.getSelected(),this.editor.type);this.ui.library(this.store.list().filter(r=>r.wallId===this.world.wall.id));}
  action(action:UIAction){
    if(this.loading)return;this.audio.unlock();
    switch(action){
      case 'gym':case 'outdoor':void this.changeLocation(action);break;
      case 'home':void this.changeLocation('gym',true);break;
      case 'edit':if(this.location==='gym'){
        if(this.editor.active){this.editor.active=false;this.syncMode();break;}
        const interaction=this.interaction();if(interaction?.kind!=='wall')break;
        this.activateWall(interaction.wall);this.editor.active=true;this.syncMode();this.syncRouteUI();
      }break;
      case 'test':this.editor.active=false;this.climb.setRoute(this.route);this.syncMode();this.startClimb();break;
      case 'climb':{
        if(this.outdoor.hanging){this.finish.reset();this.outdoor.continueClimbing();break;}
        const interaction=this.interaction();
        if(interaction?.kind==='desk'){this.ui.mood();this.input.clear();}
        else if(interaction?.kind==='wall'){if(interaction.wall.id!==this.route.wallId)this.activateWall(interaction.wall);this.startClimb();}
        break;
      }
      case 'save':try{if(!this.route.name.trim())throw new Error('Give your route a name first.');this.store.save(this.route);this.syncRouteUI();this.audio.play('save');this.ui.toast(this.store.storageAvailable?'Route saved to your shelf.':'Saved for this session. Export a copy to keep it.');}catch(e){this.ui.toast((e as Error).message);}break;
      case 'new':this.replaceRoute({...createDefaultRoute('gym',this.world.wall),id:crypto.randomUUID(),name:'My little project',creator:'You',grade:'Your creation',holds:[],createdAt:new Date().toISOString()});break;
      case 'undo':this.editor.undo();break;case 'rotate':this.editor.rotate(Math.PI/12);break;case 'delete':this.editor.remove();break;
      case 'clip':if(this.location==='outdoor')this.outdoor.clip();break;case 'fall':this.beginFall();break;
      case 'role':if(this.routeType!=='BOULDER'&&(this.climb.active||this.outdoor.suspended)){
        this.outdoor.role=this.outdoor.role==='climber'?'belayer':'climber';this.cameraRig.yaw=.05;this.cameraRig.pitch=.25;
      }break;
      case 'lower':if(this.routeType!=='BOULDER'){this.manualBelayAction='neutral';this.outdoor.lower();}break;case 'feed':case 'take':case 'lock':case 'neutral':this.manualBelayAction=this.manualBelayAction===action?'neutral':action;this.outdoor.setAction(this.manualBelayAction);break;
      case 'reset':this.reset();break;
      case 'export':try{const url=URL.createObjectURL(new Blob([serializeRoute(this.route)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${this.route.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.ui.toast('Route exported. A little something to share.');}catch(e){this.ui.toast((e as Error).message);}break;
      case 'import':this.ui.el<HTMLInputElement>('route-file').click();break;
      case 'help':this.input.clear();this.ui.help();break;
      case 'pause':{this.paused=!this.paused;this.input.clear();const d=this.ui.el<HTMLDialogElement>('pause-dialog');if(this.paused)d.showModal();else d.close();break;}
      case 'audio':this.audio.muted=!this.audio.muted;this.ui.root.querySelector('[data-action=audio]')?.setAttribute('aria-pressed',String(!this.audio.muted));this.ui.toast(this.audio.muted?'Sound off. A quiet moment.':'Sound on.');break;
      case 'wallColor':if(this.interaction()?.kind==='desk'){this.ui.mood();this.input.clear();}break;
      case 'look':break;
    }
  }
  private startClimb(){
    if(!this.route.holds.some(h=>h.start)){this.ui.toast('Mark at least one hand hold as a start in the workshop.');return;}
    this.outdoor.reset();this.finish.reset();this.outdoor.belay.resumeClimbing();this.outdoor.suspended=false;
    if(this.climb.start()){this.movement.reset();this.finish.reset();this.audio.play('hold');this.cameraRig.yaw=.18;this.cameraRig.pitch=.15;}

  }
  private reset(){this.manualBelayAction='neutral';this.boulder.reset();this.outdoor.reset();this.player.group.position.copy(this.world.spawn);this.player.group.rotation.set(0,0,0);this.movement.reset();this.cameraRig.reset(this.location==='outdoor');this.finish.reset();}
  private replaceRoute(route:RouteData){if(!routeMatchesWall(route,this.world.wall))throw new Error('This route belongs to a different wall or climbing mode.');if(route.holds.some(h=>!isHoldWithinWall(h,this.world.wall,0)))throw new Error('Some holds are outside this wall.');this.route=route;this.routes.set(route.wallId,route);this.climb.setRoute(route);this.editor.replace(route);this.syncRouteUI();}
  private loadRoute(id:string){try{const r=this.store.load(id);if(r){this.replaceRoute(r);this.ui.toast(`Loaded “${r.name}”.`);}}catch(e){this.ui.toast((e as Error).message);}}
  private async importRoute(file:File){try{if(file.size>500000)throw new Error('Choose a route JSON smaller than 500 KB.');const r=deserializeRoute(await file.text());if(r.wallId!==this.world.wall.id)throw new Error('This route belongs to a different wall.');if(r.holds.some(h=>!isHoldWithinWall(h,this.world.wall,0)))throw new Error('Some holds are outside this wall.');this.replaceRoute(r);this.ui.toast('Route imported. Save it to keep it on your shelf.');}catch(e){this.ui.toast((e as Error).message);}}
  private pickHold(e:MouseEvent){
    if(!this.climb.active||this.editor.active||this.menu||this.paused||this.outdoor.role==='belayer'||this.player.isClipping||!!this.ui.root.querySelector('dialog[open]'))return;
    const request=this.climbInput.hit(e,this.world,this.route,this.holds);
    if(!request)return;
    if(this.climb.requestMove(request).accepted)this.audio.play('hold');
  }
  private controls(){
    const input=this.input;if(input.typing())return;
    if(input.consume('F3')){this.climbDebug.toggle();this.ui.toast(this.climbDebug.group.visible?'Developer contact overlay enabled.':'Developer overlay off.');}
    if(this.editor.active){if(input.consume('KeyR'))this.editor.rotate(Math.PI/12);if(input.consume('Delete')||input.consume('Backspace'))this.editor.remove();if(input.consume('KeyZ')&&(input.down('ControlLeft')||input.down('MetaLeft')))this.editor.undo();return;}
    if(input.consume('KeyR')&&this.location==='gym')this.action('edit');
    if(input.consume('KeyE'))this.action('climb');
    if(input.consume('Tab'))this.action('role');
    if(input.consume('KeyC'))this.action('clip');
    if(input.consume('KeyX'))this.action('fall');
    if(input.consume('KeyL'))this.action('lower');
    if(this.outdoor.role==='belayer'){
      if(input.down('Space'))this.outdoor.setAction('lock');else if(input.down('KeyF'))this.outdoor.setAction('feed');else if(input.down('KeyG'))this.outdoor.setAction('take');
      else if(this.outdoor.belay.action!=='lower'&&!this.outdoor.belay.caught)this.outdoor.setAction(this.manualBelayAction);
    }else if(this.climb.active&&!this.player.isClipping){
      this.climbInput.update(this.climb,this.world,this.route,this.holds);
    }
  }
  private frame(ms:number){
    const dt=Math.min((ms-this.last)/1000||.016,.05);this.last=ms;
    if(!this.loading&&this.world){
      const modal=!!this.ui.root.querySelector('dialog[open]');
      if(!this.paused&&!modal){this.time+=dt;
        if(!this.menu)this.controls();
        if(!this.menu&&!this.editor.active){
          if(this.climb.active){
            this.climb.update(dt,this.time);
            if(this.climb.didFall)this.beginFall();else this.player.update(dt,this.time,'climb');
          }
          else if(this.boulder.active)this.boulder.update(dt,this.time,this.player,()=>this.movement.reset());
          else if(!this.outdoor.suspended&&this.outdoor.role==='climber'){this.movement.update(dt,this.time,this.cameraRig.yaw,this.world.colliders,this.location==='outdoor');if(this.movement.velocity.length()>.4){this.stepTimer+=dt;if(this.stepTimer>.46){this.audio.play('step');this.stepTimer=0;}}}
          if(this.routeType!=='BOULDER'){
            this.outdoor.update(dt,this.time);
            if(this.outdoor.takeGrounded()){this.movement.reset();this.outdoor.role='climber';}
          }else this.outdoor.rope.group.visible=false;
          this.finish.update(dt,this.climb,this.routeType,()=>this.audio.play('save'),()=>this.outdoor.finishLower(this.world.wall.topAnchor?new THREE.Vector3(...this.world.wall.topAnchor):undefined));
        }
        const role=this.outdoor.role,mode=this.menu?'menu':this.editor.active?'editor':role==='belayer'?'belay':this.climb.active||this.outdoor.suspended||this.boulder.active?'climb':'explore';
        const followed=role==='belayer'?this.partner.group.position:this.player.group.position;
        this.cameraRig.update(dt,mode,followed,this.player.group.position,this.world.cameraObstacles,this.location==='outdoor');
        this.world.update?.(dt,this.time);
      }
      this.hudTick+=dt;if(this.hudTick>.15){this.hudTick=0;this.updateHUD();}
      this.climbDebug.update(this.climb);this.renderer.render(this.scene,this.camera);
    }
    this.input.endFrame();
  }
  private updateHUD(){
    if(this.menu){this.ui.climbing(false,0);this.ui.prompt([]);this.ui.root.classList.remove('climbing-mode');return;}
    const belaying=this.outdoor.role==='belayer',busy=this.climb.active||this.outdoor.suspended||this.boulder.active;
    this.ui.root.classList.toggle('climbing-mode',busy);this.ui.root.classList.toggle('belaying',belaying);
    this.ui.climbing(this.climb.active&&!belaying,this.climb.height);
    this.ui.limbs(this.climb.active&&!belaying,this.climb.selectedLimb,this.climb.controlling);
    this.ui.show('.belay-actions',belaying&&busy);
    this.ui.root.querySelectorAll<HTMLElement>('.belay-actions button').forEach(b=>{const active=b.dataset.action===this.outdoor.belay.action;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    if(this.editor.active||this.paused||this.ui.root.querySelector('dialog[open]')){this.ui.prompt([]);return;}
    if(this.outdoor.hanging){this.ui.show('.belay-actions',false);this.ui.prompt([{key:'E',label:'Continue Climbing'},{key:'L',label:'Lower Down'}]);}
    else if(belaying&&busy)this.ui.prompt([{key:'Tab',label:'Climber'}]);
    else if(this.climb.active&&this.routeType==='LEAD'&&this.outdoor.canClip)this.ui.prompt([{key:'C',label:'Clip'}]);
    else if(this.climb.active&&this.routeType==='BOULDER'&&this.finish.boulderFinished)this.ui.prompt([{key:'X',label:'Drop to mat'}]);
    else {
      const interaction=this.interaction();
      this.ui.prompt(interaction?.kind==='desk'?[{key:'E',label:'Wall Mood'}]:interaction?.kind==='wall'?
        [{key:'E',label:'Climb'},...(this.location==='gym'?[{key:'R',label:'Edit Route'}]:[])]:[]);
    }
  }
  private exposeDebug(){
    const api={snapshot:()=>({location:this.location,menu:this.menu,editor:this.editor?.active??false,role:this.outdoor?.role??'climber',player:this.player.group.position.toArray(),camera:this.camera.position.toArray(),climbing:this.climb.active,currentHoldId:this.climb.currentHoldId,finished:this.climb.finished,holds:this.route?.holds.length??0,holdData:this.route?.holds,selectedHold:this.editor?.selected,routeName:this.route?.name,routeType:this.route?.routeType,boulderingFall:this.boulder.active,ropeSupported:this.climb.ropeSupported,clipped:this.outdoor?.clipped??0,belayState:this.outdoor?.belay.state,slack:this.outdoor?.belay.slack,ropePoints:this.outdoor?.ropePoints??0,clipping:this.player.isClipping,selectedLimb:this.climb.selectedLimb,controlling:this.climb.controlling,phase:this.climb.phase,stability:this.climb.active?{...this.climb.stability}:null,contacts:this.climb.active?Object.fromEntries(LIMBS.map(limb=>{const c=this.climb.contacts[limb];return [limb,{point:c.point.toArray(),kind:c.kind,state:c.state,holdId:c.holdId,quality:c.quality,load:c.load,orientation:c.orientation.toArray(),planted:c.planted}];})):null,debugVisible:this.climbDebug.group.visible,rendererCalls:this.renderer.info.render.calls}),project:(x:number,y:number,z:number)=>{const p=new THREE.Vector3(x,y,z).project(this.camera);return {x:(p.x+1)/2*innerWidth,y:(1-p.y)/2*innerHeight};},action:(a:UIAction)=>this.action(a)};
    (window as unknown as {__climbDebug:typeof api}).__climbDebug=api;
  }
}
