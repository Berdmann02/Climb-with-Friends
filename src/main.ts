import './ui/styles.css';
import {Game} from './core/Game';
const root=document.querySelector<HTMLElement>('#app')!;
async function start(){
  // Canvas signs need the bundled display font before the worlds are built.
  await Promise.all([document.fonts.load('16px Anton'),document.fonts.load('16px "Nunito Sans"')]);
  const game=new Game(root);await game.start();
}
void start().catch(showError);
function showError(error:unknown){console.error(error);root.replaceChildren();const panel=document.createElement('div');panel.className='error-screen';const heading=document.createElement('h1');heading.textContent='A little snag.';const text=document.createElement('p');text.textContent='The climbing scene could not start. Check that WebGL is available and reload the page.';const detail=document.createElement('pre');detail.textContent=error instanceof Error?error.message:String(error);panel.append(heading,text,detail);root.append(panel);}
