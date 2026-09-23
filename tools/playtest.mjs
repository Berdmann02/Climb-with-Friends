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
async function advanceClimber(count) {
  for (let i = 0; i < count; i++) {
    const before = await snapshot();
    const moved = await page.evaluate(() => window.__climbDebug.stepClimb());
    assert.notEqual(moved, false, `Reach ${i + 1} should be accepted`);
    await waitFor(s => s.currentHoldId !== before.currentHoldId, 'completed climbing contact', 20_000);
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

  await check('Climb the same edited route and reach its finish', async () => {
    await page.locator('.editor-panel [data-action="test"]').click();
    await waitFor(s => s.climbing && !s.editor, 'test climb entry');
    const before = await snapshot();
    await holdKey('w', 220);
    await waitFor(s => s.currentHoldId !== before.currentHoldId && s.player[1] > before.player[1] + .12, 'first player-directed reach');
    for (let i = 0; i < 12 && !(await snapshot()).finished; i++) await advanceClimber(1);
    assert.equal((await snapshot()).finished, true);
    await shot('04-gym-climbing');
    await page.locator('.session-panel [data-action="reset"]').click();
    await waitFor(s => !s.climbing && s.player[1] < .1, 'ground reset');
  });

  await check('Outdoor lead climb, protection clips, and visible rope', async () => {
    await page.locator('.location-tabs [data-action="outdoor"]').click();
    await waitFor(s => s.location === 'outdoor' && !s.menu, 'outdoor scene');
    await page.waitForTimeout(900);
    await shot('05-outdoor');
    await page.locator('#context-button').click();
    await waitFor(s => s.climbing, 'outdoor climb start');
    for (let i = 0; i < 9; i++) {
      await advanceClimber(1);
      await page.keyboard.press('c');
      await page.waitForTimeout(100);
    }
    const state = await snapshot();
    assert.ok(state.clipped >= 1, 'At least one quickdraw clipped');
    assert.equal(state.ropePoints, state.clipped + 2, 'Rope path passes through every clipped quickdraw');
    await shot('06-outdoor-lead');
  });

  await check('Switch roles, feed and take slack, brake and belayer framing', async () => {
    await page.keyboard.press('Tab');
    await waitFor(s => s.role === 'belayer', 'belayer role');
    await page.waitForTimeout(700);
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
    await page.waitForTimeout(800);
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
