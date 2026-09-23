import * as THREE from 'three';

export function seeded(seed: number): () => number {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function texture(kind: 'wood'|'plywood'|'stone'|'fabric'|'earth'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!; const random = seeded(337 + kind.length);
  ctx.fillStyle = kind === 'wood' ? '#c9bba6' : kind === 'plywood' ? '#cabc9f' : kind === 'stone' ? '#cccfca' : '#c1beb5';
  ctx.fillRect(0,0,256,256);
  for (let i=0; i<5500; i++) {
    const x=random()*256, y=random()*256, light=random()>.5;
    ctx.fillStyle = light ? 'rgba(255,255,245,.065)' : 'rgba(46,46,38,.06)';
    ctx.fillRect(x,y,kind === 'wood' || kind === 'plywood' ? 1+random()*28 : 1+random()*3,.5+random()*2);
  }
  if (kind==='wood'||kind==='plywood') {
    for (let i=0;i<80;i++) {
      const y=random()*256; ctx.strokeStyle='rgba(66,44,21,.075)'; ctx.lineWidth=.3+random()*.8; ctx.beginPath();
      ctx.moveTo(0,y); ctx.bezierCurveTo(70,y+random()*10,160,y-random()*10,256,y); ctx.stroke();
    }
    if(kind==='plywood') for(let y=16;y<256;y+=32)for(let x=16;x<256;x+=32){ctx.fillStyle='rgba(47,49,39,.25)';ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}
  } else if(kind==='stone') {
    for(let i=0;i<90;i++) {ctx.strokeStyle='rgba(72,76,73,.10)'; ctx.lineWidth=.3+random()*1.2;ctx.beginPath();const x=random()*256,y=random()*256;ctx.moveTo(x,y);ctx.lineTo(x+random()*30-15,y+random()*35);ctx.lineTo(x+random()*35,y+40+random()*18);ctx.stroke();}
  } else if(kind==='fabric') {
    ctx.strokeStyle='rgba(25,38,34,.035)';ctx.lineWidth=1;
    for(let i=0;i<256;i+=3){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace=THREE.SRGBColorSpace; map.wrapS=map.wrapT=THREE.RepeatWrapping; map.anisotropy=4; return map;
}

const maps = new Map<string, THREE.Texture>();
export function surface(color: THREE.ColorRepresentation, kind?: 'wood'|'plywood'|'stone'|'fabric'|'earth', roughness=.85): THREE.MeshStandardMaterial {
  if(kind&&!maps.has(kind)) maps.set(kind,texture(kind));
  return new THREE.MeshStandardMaterial({color,map:kind?maps.get(kind)??null:null,roughness,metalness:0});
}
export const colors = { wood: '#b08960', darkWood:'#584b39', cream:'#e1d5bb', sage:'#7d9181', deepGreen:'#314f42', chalk:'#f8efd6', orange:'#de8968', blue:'#7099a5' };
