import {routeTypeForWall} from '../routes/RouteMode';
import type {LimbId} from '../climbing/types';
import type {GripStyle,HoldType,LocationId,RouteData} from '../core/contracts';
import {hearthIcon,ridgeIcon,arrowIcon,soundIcon} from './icons';
export type UIAction='gym'|'outdoor'|'home'|'edit'|'test'|'save'|'new'|'undo'|'delete'|'rotate'|'climb'|'role'|'clip'|'fall'|'reset'|'lower'|'feed'|'take'|'lock'|'neutral'|'export'|'import'|'help'|'pause'|'audio'|'look'|'wallColor';
export class UI {
  root:HTMLDivElement; private toastTimer=0;
  onAction:(action:UIAction)=>void=()=>{};
  onMood:(index:number)=>void=()=>{};
  onLimb:(limb:LimbId)=>void=()=>{};onGrip:(grip:GripStyle|undefined)=>void=()=>{};
  onHold:(type:HoldType)=>void=()=>{}; onColor:(color:string)=>void=()=>{};
  onName:(name:string)=>void=()=>{};onMark:(kind:'start'|'finish',value:boolean)=>void=()=>{};
  onScale:(value:number)=>void=()=>{};onLoad:(id:string)=>void=()=>{};
  constructor(parent:HTMLElement){
    this.root=document.createElement('div');this.root.id='interface';parent.append(this.root);
    this.root.innerHTML=`
    <div class="menu-art" aria-hidden="true"><div class="menu-art-hearth"></div><div class="menu-art-ridge"></div></div>
    <header class="topbar"><button class="brand" data-action="home" aria-label="Home"><img src="/assets/brand/climb-with-friends.svg" alt="Climb with Friends" width="260" height="145"/></button><div class="location-tabs" hidden><button data-action="gym" class="active">The Hearth <span>GYM</span></button><button data-action="outdoor">Juniper Ridge <span>OUTDOORS</span></button></div><div class="top-right"><button class="icon-btn" data-action="audio" aria-label="Toggle sound" aria-pressed="true">${soundIcon}</button><button class="icon-btn" data-action="help" aria-label="Controls">?</button></div></header>
    <section class="welcome" aria-labelledby="welcome-title"><h1 id="welcome-title">Pick a place to climb</h1><div class="menu-cards"><button class="destination selected" data-action="gym"><span class="destination-icon">${hearthIcon}</span><strong>The Hearth</strong><span class="destination-arrow">${arrowIcon}</span></button><button class="destination" data-action="outdoor"><span class="destination-icon">${ridgeIcon}</span><strong>Juniper Ridge</strong><span class="destination-arrow">${arrowIcon}</span></button></div></section>
    <div class="menu-scene-label"><span>A little higher, together.</span></div>
    <section class="editor-panel" hidden><div class="panel-heading"><span class="eyebrow">ROUTE WORKSHOP</span><button data-action="edit" class="close" aria-label="Close route editor">×</button></div><h2>A route of your own.</h2><span id="editor-route-type" class="field-label"></span><label class="field-label" for="route-name">ROUTE NAME</label><input id="route-name" maxlength="60" value="First light"/><div class="field-row"><label class="field-label" for="route-color">ROUTE COLOR</label><input id="route-color" type="color" value="#dd795f"/></div><div class="swatches"><button style="--swatch:#dd795f" data-color="#dd795f" aria-label="Clay"></button><button style="--swatch:#d7ad57" data-color="#d7ad57" aria-label="Ochre"></button><button style="--swatch:#7dada5" data-color="#7dada5" aria-label="Sage"></button><button style="--swatch:#8495c1" data-color="#8495c1" aria-label="Blue"></button><button style="--swatch:#b992b0" data-color="#b992b0" aria-label="Heather"></button></div><span class="field-label">PICK A HOLD</span><div class="hold-palette">${(['jug','crimp','sloper','pinch','foothold'] as HoldType[]).map((t,i)=>`<button data-hold="${t}" class="${i===0?'active':''}"><span class="hold-shape ${t}"></span>${t}</button>`).join('')}</div><label class="field-label" for="hold-grip">GRIP CHARACTER</label><select id="hold-grip"><option value="">Follow hold shape & rotation</option><option value="jug">Jug</option><option value="crimp">Crimp / edge</option><option value="sloper">Sloper</option><option value="pinch">Pinch</option><option value="sidepull">Sidepull</option><option value="undercling">Undercling</option><option value="pocket">Pocket</option></select><div class="selection-box"><span id="selection-label">Click the wall to place a hold</span><div class="selection-tools"><button data-action="rotate" title="Rotate selected hold (R)">↻ Rotate</button><button data-action="delete" title="Delete selected hold">× Delete</button></div><div class="marker-row"><label><input type="checkbox" id="start-hold"/> Start</label><label><input type="checkbox" id="finish-hold"/> Finish</label></div><label class="scale-row">Size<input id="hold-scale" type="range" min="0.65" max="1.5" step="0.05" value="1"/></label></div><div class="editor-primary"><button data-action="save" class="primary">Save route <span>↓</span></button><button data-action="test" class="outline">Test climb <span>↗</span></button></div><div class="editor-secondary"><button data-action="new">New</button><button data-action="undo">Undo</button><button data-action="export">Export</button><button data-action="import">Import</button></div><label class="field-label" for="saved-routes">YOUR ROUTE SHELF</label><select id="saved-routes"><option value="">Load a saved route…</option></select><p class="editor-hint">Click to place · Drag to move<br>R to rotate · Delete to remove · ⌘Z undo</p></section>
    <section class="climbing-hud" hidden aria-label="Climbing controls"><span id="climb-height">0.0 m</span><div id="limb-controls" class="limb-wheel" hidden><span class="wheel-center" aria-hidden="true"></span><button data-limb="leftHand" aria-label="Left hand Q"><kbd>Q</kbd></button><button data-limb="rightHand" aria-label="Right hand W"><kbd>W</kbd></button><button data-limb="leftFoot" aria-label="Left foot A"><kbd>A</kbd></button><button data-limb="rightFoot" aria-label="Right foot S"><kbd>S</kbd></button></div></section>
    <div class="interaction-prompt" id="interaction-prompt" hidden role="status"></div>
    <div class="belay-actions" hidden><button data-action="feed">Feed <kbd>F</kbd></button><button data-action="take">Take <kbd>G</kbd></button><button data-action="lock">Brake <kbd>Space</kbd></button><button data-action="lower">Lower <kbd>L</kbd></button></div>
    <div class="toast" role="status" hidden></div><div class="loading" role="status"><img src="/assets/brand/climb-with-friends.svg" alt="Climb with Friends" width="220" height="123"/><p>Finding a little sunlight</p><span></span></div>
    <dialog id="help-dialog"><div class="guide-art" aria-hidden="true"></div><button class="dialog-close" aria-label="Close">×</button><div class="eyebrow">A LITTLE FIELD GUIDE</div><h2>Find your rhythm.</h2><p>Release a limb with Q/W/A/S, move it with the mouse, then click to grip. The body follows your movement; your other contacts stay planted.</p><div class="help-grid"><div><h3>Wander</h3><p><kbd>W A S D</kbd> Walk<br><kbd>Shift</kbd> Jog<br><kbd>Right drag</kbd> Look around<br><kbd>Wheel</kbd> Camera distance<br><kbd>E</kbd> Wall mood at reception</p></div><div><h3>Climb</h3><p><kbd>E</kbd> Climb near a wall / continue from rope rest<br><kbd>Q / W</kbd> Release left / right hand<br><kbd>A / S</kbd> Release left / right foot<br><kbd>Mouse</kbd> Move the free limb<br><kbd>Click</kbd> Grip or plant the foot<br><kbd>Backspace</kbd> Release selected limb<br><kbd>C</kbd> Clip quickdraw<br><kbd>X</kbd> Let go / drop to mat<br><kbd>L</kbd> Lower on rope</p></div><div><h3>Build</h3><p><kbd>R</kbd> Edit near a gym wall / rotate<br><kbd>Click</kbd> Place or select<br><kbd>Drag</kbd> Move hold<br><kbd>Delete</kbd> Remove<br><kbd>⌘ / Ctrl Z</kbd> Undo</p></div><div><h3>Belay</h3><p><kbd>Tab</kbd> Switch roles<br><kbd>F / G</kbd> Feed / take slack<br><kbd>Space</kbd> Brake / catch<br><kbd>L</kbd> Lower partner<br>After a catch: E continues, L lowers.<br>Match both hands on the finish to complete.</p></div></div><p class="fineprint">A playful approximation of climbing, designed for a game. Saved routes stay in this browser; export JSON to keep or share them.</p><button class="primary dialog-close-bottom">Let’s climb ↗</button></dialog>
    <dialog id="pause-dialog"><div class="eyebrow">A MOMENT TO BREATHE</div><h2>No rush.</h2><p>The mountain will still be here.</p><button class="primary" data-action="pause">Keep climbing ↗</button><button class="outline" data-action="home">Back to the hearth menu</button></dialog>
    <dialog id="mood-dialog"><button class="dialog-close mood-close" aria-label="Close">×</button><h2>Wall mood</h2><div class="mood-presets"><button data-mood="0">Warm plywood</button><button data-mood="1">Sage afternoon</button><button data-mood="2">Rose clay</button></div></dialog>
    <input id="route-file" type="file" accept="application/json,.json" hidden/>`;
    this.root.addEventListener('click',e=>{const target=(e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-hold],[data-color],[data-limb],[data-mood]');if(!target)return;if(target.dataset.action)this.onAction(target.dataset.action as UIAction);if(target.dataset.hold)this.onHold(target.dataset.hold as HoldType);if(target.dataset.color)this.onColor(target.dataset.color);if(target.dataset.limb)this.onLimb(target.dataset.limb as LimbId);if(target.dataset.mood!==undefined)this.onMood(Number(target.dataset.mood));});
    this.el<HTMLInputElement>('route-name').addEventListener('input',e=>this.onName((e.target as HTMLInputElement).value));
    this.el<HTMLInputElement>('route-color').addEventListener('input',e=>this.onColor((e.target as HTMLInputElement).value));
    for(const kind of ['start','finish'] as const)this.el<HTMLInputElement>(`${kind}-hold`).addEventListener('change',e=>this.onMark(kind,(e.target as HTMLInputElement).checked));
    this.el<HTMLSelectElement>('hold-grip').addEventListener('change',e=>this.onGrip(((e.target as HTMLSelectElement).value||undefined) as GripStyle|undefined));
    this.el<HTMLInputElement>('hold-scale').addEventListener('input',e=>this.onScale(Number((e.target as HTMLInputElement).value)));
    this.el<HTMLSelectElement>('saved-routes').addEventListener('change',e=>{const id=(e.target as HTMLSelectElement).value;if(id)this.onLoad(id);});
    this.root.querySelectorAll('.dialog-close,.dialog-close-bottom').forEach(b=>b.addEventListener('click',()=>b.closest('dialog')?.close()));
  }
  el<T extends HTMLElement=HTMLElement>(id:string){return this.root.querySelector<T>(`#${id}`)!;}
  show(selector:string,visible:boolean){const e=this.root.querySelector<HTMLElement>(selector);if(e)e.hidden=!visible;}
  mode(menu:boolean,editor:boolean,outdoor:boolean){
    this.root.classList.toggle('menu-mode',menu);this.root.classList.toggle('editing',editor);this.root.classList.toggle('outdoor-mode',outdoor);
    this.show('.welcome',menu);this.show('.menu-scene-label',menu);this.show('.location-tabs',!menu);this.show('.editor-panel',editor);
    if(menu||editor){this.show('.climbing-hud',false);this.show('.interaction-prompt',false);this.show('.belay-actions',false);}

    this.root.querySelectorAll('.location-tabs button').forEach(b=>{const active=(b as HTMLElement).dataset.action===(outdoor?'outdoor':'gym');b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  route(route:RouteData,_location:LocationId){const type=route.routeType??routeTypeForWall(route.wallId);this.el('editor-route-type').textContent=type==='BOULDER'?'BOULDER':type==='TOP_ROPE'?'TOP ROPE':'LEAD';}
  editor(route:RouteData,selected:ReturnType<import('../routes/RouteEditor').RouteEditor['getSelected']>,type:HoldType){
    if(document.activeElement!==this.el('route-name'))this.el<HTMLInputElement>('route-name').value=route.name;
    this.el<HTMLInputElement>('route-color').value=selected?.color??route.color;
    this.el<HTMLSelectElement>('hold-grip').value=selected?.grip??'';
    this.el<HTMLSelectElement>('hold-grip').disabled=!selected;
    this.el('selection-label').textContent=selected?`${selected.type[0].toUpperCase()+selected.type.slice(1)} selected`:'Click the wall to place a hold';
    this.el<HTMLInputElement>('start-hold').checked=selected?.start??false;this.el<HTMLInputElement>('finish-hold').checked=selected?.finish??false;this.el<HTMLInputElement>('hold-scale').value=String(selected?.scale??1);
    this.root.querySelectorAll<HTMLElement>('[data-hold]').forEach(b=>b.classList.toggle('active',b.dataset.hold===type));
  }
  limbs(visible:boolean,selected:LimbId|null,controlling=false){this.show('#limb-controls',visible);this.root.querySelectorAll<HTMLElement>('[data-limb]').forEach(b=>{const active=controlling&&b.dataset.limb===selected;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
  library(routes:RouteData[]){const select=this.el<HTMLSelectElement>('saved-routes');select.replaceChildren(new Option('Load a saved route…',''));for(const route of routes)select.add(new Option(route.name,route.id));}
  toast(message:string){const e=this.root.querySelector<HTMLElement>('.toast')!;e.textContent=message;e.hidden=false;clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>e.hidden=true,3600);}
  prompt(items:Array<{key:string;label:string}>){
    const el=this.el('interaction-prompt');el.replaceChildren();el.hidden=!items.length;
    for(const item of items){const span=document.createElement('span'),key=document.createElement('kbd');key.textContent=item.key;span.append(key,document.createTextNode(item.label));el.append(span);}
  }
  climbing(visible:boolean,height:number){this.show('.climbing-hud',visible);this.el('climb-height').textContent=`${Math.max(0,height).toFixed(1)} m`;}
  mood(){this.el<HTMLDialogElement>('mood-dialog').showModal();}

  help(){this.el<HTMLDialogElement>('help-dialog').showModal();}
  loading(show:boolean){this.show('.loading',show);}
}
