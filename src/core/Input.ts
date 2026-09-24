export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  private drag = false;
  deltaX = 0; deltaY = 0; zoom = 0;
  constructor(public canvas:HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if (this.typing()) return;
      if (['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace','F3'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('pointerdown', e => {if(e.button===2) {this.drag=true;canvas.setPointerCapture(e.pointerId);}});
    window.addEventListener('pointerup', ()=>this.drag=false);
    window.addEventListener('pointermove', e => {if(this.drag || document.pointerLockElement===canvas){this.deltaX+=e.movementX;this.deltaY+=e.movementY;}});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom+=Math.sign(e.deltaY);},{passive:false});
  }
  typing(){return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName??'');}
  down(code:string){return this.keys.has(code);}
  consume(code:string){const had=this.pressed.has(code);this.pressed.delete(code);return had;}
  endFrame(){this.pressed.clear();this.deltaX=this.deltaY=this.zoom=0;}
  clear(){this.keys.clear();this.pressed.clear();this.drag=false;}
}
