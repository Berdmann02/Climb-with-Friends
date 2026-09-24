import * as THREE from 'three';
import {Input} from './Input';
import {ThirdPersonCamera} from './ThirdPersonCamera';
import {GameAudio} from './Audio';
import type {LocationId,RouteData,World} from './contracts';
import {createGym} from '../world/Gym';
import {createOutdoor} from '../world/Outdoor';
import {Character} from '../player/Character';
import {PlayerController} from '../player/PlayerController';
import {ClimbingController} from '../climbing/ClimbingController';
import {OutdoorSession} from '../belay/OutdoorSession';
import type {BelayAction} from '../belay/BelayController';
import {ClimbInput,LIMB_LABELS,surfaceForWorld} from '../climbing/ClimbInput';
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
  private readonly climbDebug=new ClimbDebug();
  private readonly climbInput:ClimbInput;
  private manualBelayAction:BelayAction='neutral';
  private worlds=new Map<LocationId,World>();private routes=new Map<LocationId,RouteData>();
  world!:World;route!:RouteData;editor!:RouteEditor;outdoor!:OutdoorSession;
  location:LocationId='gym';menu=true;paused=false;private loading=false;private time=0;private last=0;private hudTick=0;private finishShown=false;private stepTimer=0;private wallMood=0;
  constructor(root:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    root.append(this.renderer.domElement);this.ui=new UI(root);this.input=new Input(this.renderer.domElement);this.cameraRig=new ThirdPersonCamera(this.camera,this.input);this.movement=new PlayerController(this.player,this.input);this.cameraRig.snap();
    this.scene.add(this.player.group,this.partner.group,this.holds.group,this.climbDebug.group);
    this.climbInput=new ClimbInput(this.renderer.domElement,this.camera,this.input);
    this.ui.onAction=a=>this.action(a);this.ui.onHold=t=>this.editor.choose(t);this.ui.onColor=c=>{this.route.color=c;this.editor.setColor(c);this.syncRouteUI();};
    this.ui.onLimb=limb=>{if(this.climb.active&&this.outdoor.role==='climber')this.climb.selectLimb(limb);};
    this.climb.setAutoSequence(true);
    this.ui.onGrip=grip=>this.editor.mutate(h=>{h.grip=grip;});
    this.ui.onName=name=>{this.route.name=name;this.syncRouteUI();};this.ui.onMark=(k,v)=>this.editor.mark(k,v);this.ui.onScale=s=>this.editor.resize(s);this.ui.onLoad=id=>this.loadRoute(id);
    this.ui.el<HTMLInputElement>('route-file').addEventListener('change',e=>{const file=(e.target as HTMLInputElement).files?.[0];if(file)void this.importRoute(file);(e.target as HTMLInputElement).value='';});
    this.renderer.domElement.addEventListener('click',e=>this.pickHold(e));
    document.addEventListener('pointerdown',()=>this.audio.unlock(),{once:true});
    window.addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);});
    for(const dialog of this.ui.root.querySelectorAll('dialog'))dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close();this.paused=false;this.input.clear();});
    window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!this.menu){e.preventDefault();if(this.ui.el<HTMLDialogElement>('help-dialog').open){this.ui.el<HTMLDialogElement>('help-dialog').close();this.input.clear();}else this.action('pause');}});
    this.exposeDebug();
  }
  async start(){await this.changeLocation('gym',true);await this.holds.load();this.ui.loading(false);this.renderer.setAnimationLoop(t=>this.frame(t));}
  private async changeLocation(location:LocationId,menu=false){
    if(this.loading)return;this.loading=true;this.ui.loading(true);this.climb.stop();this.editor?.dispose();this.input.clear();this.movement.reset();
    if(this.world)this.scene.remove(this.world.group);if(this.outdoor){this.scene.remove(this.outdoor.rope.group);this.outdoor.rope.dispose();for(const d of this.outdoor.draws){this.scene.remove(d.group);d.dispose();}}
    let world=this.worlds.get(location);if(!world){world=await (location==='gym'?createGym():createOutdoor());this.worlds.set(location,world);}
    this.world=world;this.location=location;this.menu=menu;this.paused=false;this.ui.el<HTMLDialogElement>('pause-dialog').close();this.scene.add(world.group);
    this.scene.background=new THREE.Color(world.group.userData.background);const fog=world.group.userData.fog;this.scene.fog=new THREE.Fog(fog.color,fog.near,fog.far);
    this.route=this.routes.get(location)??createDefaultRoute(location);this.routes.set(location,this.route);this.holds.setRoute(this.route);this.climb.setRoute(this.route);this.climb.setSurface(surfaceForWorld(world));
    this.editor=new RouteEditor(this.renderer.domElement,this.camera,this.route,world.wall,this.holds,()=>this.syncRouteUI());
    this.player.group.position.copy(world.spawn);this.player.group.rotation.set(0,0,0);this.partner.group.position.copy(world.belayPosition);this.partner.group.rotation.set(0,0,0);
    this.outdoor=new OutdoorSession(this.player,this.partner,this.climb,world.protection,world.belayPosition,this.audio,m=>this.ui.toast(m),location==='gym'?new THREE.Vector3(0,7.9,.35):null);
    this.scene.add(this.outdoor.rope.group);for(const d of this.outdoor.draws)this.scene.add(d.group);
    this.player.group.visible=!menu;this.partner.group.visible=!menu;this.outdoor.rope.group.visible=location==='outdoor'&&!menu;this.manualBelayAction='neutral';
    this.cameraRig.reset(location==='outdoor');this.finishShown=false;this.syncRouteUI();this.syncMode();this.ui.loading(false);this.loading=false;
  }
  private syncMode(){this.ui.mode(this.menu,this.editor.active,this.location==='outdoor');this.holds.select(this.editor.active?this.editor.selected:null);}
  private syncRouteUI(){if(!this.editor)return;this.ui.route(this.route,this.location);this.ui.editor(this.route,this.editor.getSelected(),this.editor.type);this.ui.library(this.store.list().filter(r=>r.wallId===this.world.wall.id));}
  action(action:UIAction){
    if(this.loading)return;this.audio.unlock();
    switch(action){
      case 'gym':case 'outdoor':void this.changeLocation(action);break;
      case 'home':void this.changeLocation('gym',true);break;
      case 'edit':if(this.location==='gym'){this.climb.stop();this.editor.active=!this.editor.active;if(!this.editor.active)this.reset();this.syncMode();}break;
      case 'test':this.editor.active=false;this.climb.setRoute(this.route);this.syncMode();this.startClimb();break;
      case 'climb':if(this.climb.active){this.reset();}else this.startClimb();break;
      case 'save':try{if(!this.route.name.trim())throw new Error('Give your route a name first.');this.store.save(this.route);this.syncRouteUI();this.audio.play('save');this.ui.toast(this.store.storageAvailable?'Route saved to your shelf.':'Saved for this session. Export a copy to keep it.');}catch(e){this.ui.toast((e as Error).message);}break;
      case 'new':this.replaceRoute({...createDefaultRoute('gym'),id:crypto.randomUUID(),name:'My little project',creator:'You',grade:'Your creation',holds:[],createdAt:new Date().toISOString()});this.ui.toast('A blank wall. Start with two low hand holds and a few feet.');break;
      case 'undo':this.editor.undo();break;case 'rotate':this.editor.rotate(Math.PI/12);break;case 'delete':this.editor.remove();break;
      case 'clip':if(this.location==='outdoor')this.outdoor.clip();break;case 'fall':this.outdoor.fall();break;
      case 'role':if(this.location==='outdoor'){
        if(!this.climb.active&&!this.outdoor.suspended)this.startClimb();this.outdoor.role=this.outdoor.role==='climber'?'belayer':'climber';
        this.cameraRig.yaw=.05;this.cameraRig.pitch=.25;this.ui.toast(this.outdoor.role==='belayer'?'You have the rope. Your partner holds their position.':'You’re on the wall. Your partner has the rope.');
      }break;
      case 'lower':this.manualBelayAction='neutral';this.outdoor.lower();break;case 'feed':case 'take':case 'lock':case 'neutral':this.manualBelayAction=this.manualBelayAction===action?'neutral':action;this.outdoor.setAction(this.manualBelayAction);break;
      case 'reset':this.reset();break;
      case 'export':try{const url=URL.createObjectURL(new Blob([serializeRoute(this.route)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${this.route.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.ui.toast('Route exported. A little something to share.');}catch(e){this.ui.toast((e as Error).message);}break;
      case 'import':this.ui.el<HTMLInputElement>('route-file').click();break;
      case 'help':this.input.clear();this.ui.help();break;
      case 'pause':{this.paused=!this.paused;this.input.clear();const d=this.ui.el<HTMLDialogElement>('pause-dialog');if(this.paused)d.showModal();else d.close();break;}
      case 'audio':this.audio.muted=!this.audio.muted;this.ui.root.querySelector('[data-action=audio]')?.setAttribute('aria-pressed',String(!this.audio.muted));this.ui.toast(this.audio.muted?'Sound off. A quiet moment.':'Sound on.');break;
      case 'wallColor':this.wallMood=(this.wallMood+1)%3;this.world.group.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry instanceof THREE.BoxGeometry&&o.position.z===-.10&&o.position.x>=-5&&o.position.x<=5){const mat=o.material as THREE.MeshStandardMaterial;mat.color.set(['#e0cfad','#a9b7a2','#c5ada0'][this.wallMood]);}});this.ui.toast(['Warm plywood','Sage afternoon','Rose clay'][this.wallMood]);break;
      case 'look':break;
    }
  }
  private startClimb(){
    if(!this.route.holds.some(h=>h.start)){this.ui.toast('Mark at least one hand hold as a start in the workshop.');return;}
    this.outdoor.belay.resumeClimbing();this.outdoor.suspended=false;
    if(this.climb.start()){this.movement.reset();this.finishShown=false;this.audio.play('hold');this.cameraRig.yaw=.18;this.cameraRig.pitch=.15;this.ui.toast('Q/W release hands · A/S release feet · Move mouse · Click to grip.');}

  }
  private reset(){this.manualBelayAction='neutral';this.outdoor.reset();this.player.group.position.copy(this.world.spawn);this.player.group.rotation.set(0,0,0);this.movement.reset();this.cameraRig.reset(this.location==='outdoor');this.finishShown=false;}
  private replaceRoute(route:RouteData){this.route=route;this.routes.set(this.location,route);this.climb.setRoute(route);this.editor.replace(route);this.syncRouteUI();}
  private loadRoute(id:string){try{const r=this.store.load(id);if(r){this.replaceRoute(r);this.ui.toast(`Loaded “${r.name}”.`);}}catch(e){this.ui.toast((e as Error).message);}}
  private async importRoute(file:File){try{if(file.size>500000)throw new Error('Choose a route JSON smaller than 500 KB.');const r=deserializeRoute(await file.text());if(r.wallId!==this.world.wall.id)throw new Error('This route belongs to a different wall.');if(r.holds.some(h=>!isHoldWithinWall(h,this.world.wall,0)))throw new Error('Some holds are outside this wall.');this.replaceRoute(r);this.ui.toast('Route imported. Save it to keep it on your shelf.');}catch(e){this.ui.toast((e as Error).message);}}
  private pickHold(e:MouseEvent){
    if(!this.climb.active||this.editor.active||this.menu||this.paused||this.outdoor.role==='belayer')return;
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
      const modal=this.ui.el<HTMLDialogElement>('help-dialog').open;
      if(!this.paused&&!modal){this.time+=dt;
        if(!this.menu)this.controls();
        if(!this.menu&&!this.editor.active){
          if(this.climb.active){
            this.climb.update(dt,this.time);
            if(this.climb.didFall)this.outdoor.fall(true);else this.player.update(dt,this.time,'climb');
          }
          else if(!this.outdoor.suspended&&this.outdoor.role==='climber'){this.movement.update(dt,this.time,this.cameraRig.yaw,this.world.colliders,this.location==='outdoor');if(this.movement.velocity.length()>.4){this.stepTimer+=dt;if(this.stepTimer>.46){this.audio.play('step');this.stepTimer=0;}}}
          this.outdoor.update(dt,this.time);
          if(this.climb.active&&this.climb.finished&&!this.finishShown){this.finishShown=true;this.audio.play('save');this.ui.toast('Top! A little higher, together. Beautifully done.');}
        }
        const role=this.outdoor.role,mode=this.menu?'menu':this.editor.active?'editor':role==='belayer'?'belay':this.climb.active||this.outdoor.suspended?'climb':'explore';
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
    if(this.menu)return;const outdoor=this.location==='outdoor',belaying=this.outdoor.role==='belayer';
    this.ui.el('role-label').textContent=belaying?'YOU / BELAYER':'YOU / CLIMBER';
    this.ui.el('state-label').textContent=this.outdoor.suspended?(this.outdoor.belay.caught?'Caught. Take a breath.':this.outdoor.belay.state==='lowering'?'Coming down gently':'Rope catching…'):this.climb.active?(this.climb.finished?'A lovely little send':`${this.climb.height.toFixed(1)} m · finding the flow`):'Make yourself at home';
    this.ui.show('.belay-actions',belaying);
    this.ui.root.querySelectorAll<HTMLElement>('.belay-actions button').forEach(b=>{const active=b.dataset.action===this.outdoor.belay.action;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    this.ui.el('rope-label').textContent=`${this.outdoor.clipped} / 7 clipped · ${this.outdoor.belay.slack.toFixed(1)} m slack`;
    this.ui.el('rope-meter').style.width=`${Math.max(5,this.outdoor.belay.slack/2.8*100)}%`;
    if(this.editor.active)this.ui.context('Make a move worth sharing','Place reachable holds, mark a start and finish, then test.','Test your route','test');
    else if(this.outdoor.suspended)this.ui.context(this.outdoor.belay.caught?'Your partner has you.':'Easy does it.','Space to brake · L to lower · Switch roles with Tab','Lower gently','lower');
    else if(belaying)this.ui.context('You have the rope.','F feed · G take · Space brake · L lower · Partner holds position','Switch to climber','role');
    else if(this.climb.active&&this.climb.finished)this.ui.context('A little higher, together.','You reached the finish. Take in the view.',outdoor?'Lower to the ground':'Back to the lounge',outdoor?'lower':'reset');
    else if(this.climb.active&&outdoor&&this.outdoor.canClip)this.ui.context('A good place to clip.','C clips the rope · Mouse reaches · Click grips · Arrows orbit','Clip quickdraw','clip');
    else if(this.climb.active)this.ui.context(this.climb.controlling?`${LIMB_LABELS[this.climb.selectedLimb]}${this.climb.autoSequencing&&this.climb.suggestedLimb===this.climb.selectedLimb?' · chosen for you':' · direct control'}`:'Your contacts are planted.','Mouse reaches · Click grips · Arrows orbit · Wheel or -/= zooms','Back to the ground','reset');
    else this.ui.context(outdoor?'The long way home.':'Your next idea starts here.',outdoor?'E to climb · Tab to belay your partner':'WASD to wander · R to set a route · E to climb','Start climbing','climb');
    this.ui.el('objective').textContent=outdoor?'Seven clips, one rope, and a friend below. Follow the golden holds.':'A shared wall, a warm corner, and a route that could be yours.';
    this.ui.limbs(this.climb.active&&!belaying,this.climb.selectedLimb,this.climb.controlling);
    this.ui.root.classList.toggle('belaying',belaying);
  }
  private exposeDebug(){
    const api={snapshot:()=>({location:this.location,menu:this.menu,editor:this.editor?.active??false,role:this.outdoor?.role??'climber',player:this.player.group.position.toArray(),camera:this.camera.position.toArray(),climbing:this.climb.active,currentHoldId:this.climb.currentHoldId,finished:this.climb.finished,holds:this.route?.holds.length??0,holdData:this.route?.holds,selectedHold:this.editor?.selected,routeName:this.route?.name,clipped:this.outdoor?.clipped??0,belayState:this.outdoor?.belay.state,slack:this.outdoor?.belay.slack,ropePoints:this.outdoor?.ropePoints??0,clipping:this.player.isClipping,selectedLimb:this.climb.selectedLimb,controlling:this.climb.controlling,phase:this.climb.phase,stability:this.climb.active?{...this.climb.stability}:null,contacts:this.climb.active?Object.fromEntries(LIMBS.map(limb=>{const c=this.climb.contacts[limb];return [limb,{point:c.point.toArray(),kind:c.kind,state:c.state,holdId:c.holdId,quality:c.quality,load:c.load,orientation:c.orientation.toArray(),planted:c.planted}];})):null,debugVisible:this.climbDebug.group.visible,rendererCalls:this.renderer.info.render.calls}),project:(x:number,y:number,z:number)=>{const p=new THREE.Vector3(x,y,z).project(this.camera);return {x:(p.x+1)/2*innerWidth,y:(1-p.y)/2*innerHeight};},action:(a:UIAction)=>this.action(a)};
    (window as unknown as {__climbDebug:typeof api}).__climbDebug=api;
  }
}
