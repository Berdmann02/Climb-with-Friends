import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const baseURL = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173';
const output = 'test-results';
mkdirSync(output, { recursive: true });
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
const results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.location().url.includes('favicon')) errors.push(`${message.text()} (${message.location().url})`);
});
const snapshot = () => page.evaluate(() => window.__climbDebug.snapshot());
const shot = name => page.screenshot({ path: `${output}/${name}.png` });
async function check(name, operation) {
  await operation();
  results.push(name);
  console.log(`PASS ${name}`);
}
async function waitFor(predicate, label, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate(await snapshot())) return;
    await page.waitForTimeout(80);
  }
  throw new Error(`Timed out: ${label}. Snapshot: ${JSON.stringify(await snapshot())}`);
}
async function project(x, y, z = .12) {
  return page.evaluate(([x, y, z]) => window.__climbDebug.project(x, y, z), [x, y, z]);
}
async function clickWall(x, y) {
  const screen = await project(x, y);
  await page.mouse.click(screen.x, screen.y);
}
async function holdKey(key, milliseconds) {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
}
const limbKeys={leftHand:'q',rightHand:'w',leftFoot:'a',rightFoot:'s'};
async function manualMove(limb,point,expectedHold) {
  const before=await snapshot();
  await page.keyboard.press(limbKeys[limb]);
  await waitFor(s=>s.selectedLimb===limb,'limb selection');
  const screen=await project(...point);await page.mouse.click(screen.x,screen.y);
  await waitFor(s=>s.phase==='prepare'||s.phase==='release'||s.phase==='moving','explicit move begins');
  const during=await snapshot();
  for(const other of Object.keys(limbKeys))if(other!==limb)assert.deepEqual(during.contacts[other].point,before.contacts[other].point,`${other} stays planted during ${limb} move`);
  await waitFor(s=>s.climbing&&s.phase==='selected','explicit move settles');
  const after=await snapshot();
  if(expectedHold)assert.equal(after.contacts[limb].holdId,expectedHold,'Exact clicked hold is used');
  for(const other of Object.keys(limbKeys))if(other!==limb)assert.deepEqual(after.contacts[other].point,before.contacts[other].point,`${other} does not auto-correct`);
}
// An authored playthrough fixture. No route planner or assistance exists in the game.
const manualSequence=[['rightHand',4],['leftFoot',5],['rightFoot',1],['leftHand',6],['rightFoot',7],['leftFoot',0],['leftFoot',9],['rightHand',8],['rightFoot',4],['rightFoot',11],['leftHand',10],['leftFoot',6],['leftFoot',13],['rightHand',12],['rightFoot',8],['rightFoot',15],['leftHand',14],['leftFoot',10],['leftFoot',17],['rightHand',16],['rightFoot',12],['rightFoot',19],['leftHand',18],['leftFoot',14],['leftFoot',21],['rightHand',20],['rightFoot',16],['rightFoot',23],['leftHand',22]];
async function playManualSequence(count=manualSequence.length){
  for(const [limb,index] of manualSequence.slice(0,count)){
    const hold=(await snapshot()).holdData[index];await manualMove(limb,hold.position,hold.id);
  }
}
async function storedRoute(name) {
  return page.evaluate(name => JSON.parse(localStorage.getItem('climb-with-friends.routes.v1') ?? '[]').find(route => route.name === name), name);
}
const routeName = 'Playtest · Coffee first';
try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__climbDebug?.snapshot === 'function');
  await page.locator('.loading').waitFor({ state: 'hidden' });
  await page.waitForTimeout(900);
  await check('Menu and gym scene boot', async () => {
    assert.equal((await snapshot()).menu, true);
    await shot('01-menu');
    await page.locator('.welcome [data-action="gym"]').click();
    await waitFor(s => s.location === 'gym' && !s.menu, 'gym entry');
    await page.waitForTimeout(1200);
    assert.ok((await snapshot()).holds > 4);
    await shot('02-gym');
  });

  await check('Ground movement and mouse camera', async () => {
    const before = await snapshot();
    await page.keyboard.down('w');
    await waitFor(s => Math.hypot(...s.player.map((n, i) => n - before.player[i])) > .6, 'forward movement');
    await page.keyboard.up('w');
    const forward = await snapshot();
    assert.ok(Math.hypot(...forward.player.map((n, i) => n - before.player[i])) > .4, 'W should move the player');
    await page.keyboard.down('s');
    await waitFor(s => Math.hypot(...s.player.map((n, i) => n - forward.player[i])) > .6, 'backward movement');
    await page.keyboard.up('s');
    const backward = await snapshot();
    assert.ok(Math.hypot(...backward.player.map((n, i) => n - forward.player[i])) > .4, 'S should move the player');
    await page.waitForTimeout(450);
    const cameraBefore = (await snapshot()).camera;
    await page.mouse.move(1010, 410);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(1170, 360, { steps: 12 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(400);
    const cameraAfter = (await snapshot()).camera;
    assert.ok(cameraBefore && cameraAfter, 'Debug camera coordinates are exposed');
    assert.notDeepEqual(cameraAfter, cameraBefore, 'Right drag should orbit the camera');
  });

  let savedCount;
  await check('Route workshop: choose, place, drag, rotate, mark, resize, delete and undo', async () => {
    await page.locator('#edit-button').click();
    await waitFor(s => s.editor, 'route editor entry');
    await page.waitForTimeout(1200);
    const initial = (await snapshot()).holds;
    await page.locator('[data-hold="pinch"]').click();
    await page.locator('[data-color="#7dada5"]').click();
    await clickWall(2.05, 2.6);
    await waitFor(s => s.holds === initial + 1 && s.selectedHold, 'hold placement');
    const from = await project(2.05, 2.6);
    const to = await project(2.35, 2.9);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 15 });
    await page.mouse.up();
    await page.keyboard.press('r');
    await page.locator('#start-hold').check();
    await page.locator('#start-hold').uncheck();
    await page.locator('#finish-hold').check();
    await page.locator('[data-action="undo"]').click();
    await clickWall(2.35, 2.9);
    await page.locator('#hold-scale').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.locator('#route-name').fill(routeName);
    await page.locator('[data-action="save"]').click();
    const saved = await storedRoute(routeName);
    assert.ok(saved, 'Named route persisted');
    const edited = saved.holds.find(h => h.position[0] === 2.35 && h.position[1] === 2.9);
    assert.ok(edited, 'Dragging stores the new wall coordinates');
    assert.equal(edited.type, 'pinch');
    assert.equal(edited.color, '#7dada5');
    assert.notEqual(edited.rotation, 0, 'Rotate changes serialized orientation');
    assert.ok(edited.scale > 1, 'Size control updates selected hold');
    assert.equal(saved.holds.filter(h => h.finish).length, 1, 'Undo restored the original finish');

    await page.locator('[data-hold="sloper"]').click();
    await clickWall(3.25, 3.4);
    await waitFor(s => s.holds === initial + 2, 'second hold placement');
    await page.keyboard.press('Delete');
    await waitFor(s => s.holds === initial + 1, 'hold deletion');
    await page.locator('[data-action="undo"]').click();
    await waitFor(s => s.holds === initial + 2, 'deletion undo');
    await clickWall(3.25, 3.4);
    await page.locator('[data-action="delete"]').click();
    await waitFor(s => s.holds === initial + 1, 'button deletion');
    await page.locator('[data-action="save"]').click();
    savedCount = initial + 1;
    await shot('03-route-workshop');
  });

  await check('Route save, load and reload persistence', async () => {
    await page.locator('[data-action="new"]').click();
    await waitFor(s => s.holds === 0, 'new route clears holds');
    await page.locator('#saved-routes').selectOption({ label: routeName });
    await waitFor(s => s.holds === savedCount && s.routeName === routeName, 'saved route load');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__climbDebug?.snapshot === 'function');
    await page.locator('.loading').waitFor({ state: 'hidden' });
    await page.locator('.welcome [data-action="gym"]').click();
    await page.locator('#edit-button').click();
    await page.locator('#saved-routes').selectOption({ label: routeName });
    await waitFor(s => s.holds === savedCount && s.routeName === routeName, 'reload persistence');
  });

  await check('Manual limb selection and removal of W-to-auto-climb', async () => {
    await page.locator('.editor-panel [data-action="test"]').click();
    await waitFor(s => s.climbing && !s.editor, 'test climb entry');
    await page.waitForTimeout(1000);
    const before=await snapshot();
    for(const [limb,key] of Object.entries(limbKeys)){
      await page.keyboard.press(key);await waitFor(s=>s.selectedLimb===limb,`${key} selects ${limb}`);
    }
    await holdKey('w',1500);await holdKey('Space',400);
    const after=await snapshot();
    assert.equal(after.selectedLimb,'rightHand');assert.equal(after.debugVisible,false);
    assert.deepEqual(after.contacts,before.contacts,'Keys alone never move a limb or solve the route');
    assert.ok(Math.abs(after.player[1]-before.player[1])<.01,'No upward progress from holding W');
    const far=after.holdData[10];const screen=await project(...far.position);await page.mouse.click(screen.x,screen.y);
    await page.waitForTimeout(400);
    assert.deepEqual((await snapshot()).contacts,before.contacts,'Impossible hand reach leaves all contacts unchanged');
  });

  await check('Manual smears, fixed supporting limbs and climbing the saved route',async()=>{
    const before=await snapshot();
    await manualMove('leftFoot',[-.22,.68,.012]);
    assert.equal((await snapshot()).contacts.leftFoot.kind,'smear','Bare wall click establishes an explicit smear');
    const foot=(await snapshot()).holdData[2];await manualMove('leftFoot',foot.position,foot.id);
    await playManualSequence();
    const after=await snapshot();
    assert.equal(after.finished,true,'Explicit player limb choices reach the finish');
    assert.ok(after.player[1]>before.player[1]+4,'Body follows player contacts upward');
    assert.ok(['smear','hold'].includes(after.contacts.leftFoot.kind));
    await shot('04-manual-climbing');
    await page.locator('.session-panel [data-action="reset"]').click();
    await waitFor(s=>!s.climbing&&s.player[1]<.1,'ground reset');
  });

  await check('Outdoor manual lead climb, protection clips and rope path',async()=>{
    await page.locator('.location-tabs [data-action="outdoor"]').click();
    await waitFor(s=>s.location==='outdoor'&&!s.menu,'outdoor entry');await page.waitForTimeout(900);await shot('05-outdoor');
    await page.locator('#context-button').click();await waitFor(s=>s.climbing,'outdoor attachment');await page.waitForTimeout(900);
    await playManualSequence(11);await page.keyboard.press('c');
    await waitFor(s=>s.clipped>=1,'explicit quickdraw clip');
    assert.equal((await snapshot()).ropePoints,(await snapshot()).clipped+2,'Rope uses each clipped anchor');
    await page.waitForTimeout(900);await shot('06-manual-lead');
  });

  await check('Switch roles, feed and take slack, brake and belayer framing', async () => {
    await page.keyboard.press('Tab');
    await waitFor(s => s.role === 'belayer', 'belayer role');
    await page.waitForTimeout(700);
    const heldContacts=(await snapshot()).contacts;
    const before = (await snapshot()).slack;
    await holdKey('f', 550);
    const afterFeed = (await snapshot()).slack;
    assert.ok(afterFeed > before, 'Feeding adds slack');
    await holdKey('g', 550);
    assert.ok((await snapshot()).slack < afterFeed, 'Taking removes slack');
    await page.keyboard.down('Space');
    await waitFor(s => s.belayState === 'locked', 'brake control');
    await page.keyboard.up('Space');
    await page.mouse.move(1100, 400);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(1110, 480, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(700);
    assert.deepEqual((await snapshot()).contacts,heldContacts,'Belayer role never auto-climbs for the player');
    await shot('07-belayer-view');
  });

  await check('Lead fall, rope catch, and controlled lowering', async () => {
    await page.keyboard.press('Tab');
    await waitFor(s => s.role === 'climber', 'climber role');
    await page.keyboard.press('x');
    await waitFor(s => s.belayState === 'caught', 'fall caught', 8000);
    await page.keyboard.press('Tab');
    await waitFor(s => s.role === 'belayer', 'belayer lowering role');
    await page.keyboard.down('l');
    await waitFor(s => s.belayState === 'lowering', 'lower control');
    await page.waitForTimeout(300);
    await page.keyboard.up('l');
    await shot('08-catch-lowering');
  });

  await check('Pause, controls and clean browser console', async () => {
    await page.keyboard.press('Escape');
    await page.locator('#pause-dialog').waitFor({ state: 'visible' });
    await page.locator('#pause-dialog [data-action="pause"]').click();
    await page.locator('[aria-label="Controls"]').click();
    await page.locator('#help-dialog').waitFor({ state: 'visible' });
    await page.locator('.dialog-close-bottom').click();
    assert.deepEqual(errors, [], 'No browser runtime/console errors');
    assert.ok((await snapshot()).rendererCalls < 1800, 'Scene draw-call budget remains bounded');
  });
  writeFileSync(`${output}/playtest-report.json`, JSON.stringify({ status: 'passed', checks: results, errors, final: await snapshot() }, null, 2));
  console.log(`\n${results.length} end-to-end checks passed. Screenshots: ${output}/`);
} catch (error) {
  await shot('failure').catch(() => {});
  writeFileSync(`${output}/playtest-report.json`, JSON.stringify({ status: 'failed', checks: results, errors, failure: String(error), snapshot: await snapshot().catch(() => null) }, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
