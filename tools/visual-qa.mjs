import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
const issues=[];page.on('pageerror',e=>issues.push(e.message));page.on('console',e=>{if(['error','warning'].includes(e.type()))issues.push(e.text())});
mkdirSync('test-results',{recursive:true});
try{
 await page.goto(process.env.PLAYTEST_URL??'http://127.0.0.1:5176',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__climbDebug?.snapshot);await page.locator('.loading').waitFor({state:'hidden'});await page.waitForTimeout(1400);
 for(const scene of ['menu','gym','outdoor']) {
  if(scene!=='menu'){await page.evaluate(s=>window.__climbDebug.action(s),scene);await page.waitForTimeout(1800);}
  await page.screenshot({path:`test-results/visual-${scene}.png`});
  console.log(scene,JSON.stringify(await page.evaluate(()=>{const s=window.__climbDebug.snapshot();return {camera:s.camera,draws:s.rendererCalls,holds:s.holds}})));
 }
 writeFileSync('test-results/visual-console.json',JSON.stringify(issues,null,2));
}finally{await browser.close();}
