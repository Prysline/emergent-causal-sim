import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = 'artifacts/spatial-playtest';
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const consoleErrors = [];
const pageErrors = [];
const add = (name, pass, details = '') => results.push({ name, pass, details });
const count = (text, needle) => (text.match(new RegExp(needle, 'g')) || []).length;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => pageErrors.push(String(err)));

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.SimEngine?.getState && window.SimSpatial?.agentObservation);
await page.screenshot({ path: `${outDir}/00-baseline-desktop.png`, fullPage: true });

const version = await page.evaluate(() => window.SimEngine.getState().version);
add('runtime version', version === '11.11.1-spatial-observability', version);

// Covered-floor presentation: put Orange under the table without changing the spatial model.
await page.evaluate(() => {
  const E = window.SimEngine, SP = window.SimSpatial, s = E.getState(), a = s.agents.orange;
  a.position = { ...SP.normalizeNode(s, { x: 5, y: 2 }, 'floor') };
  a.action = { intent: 'groom', phase: 'groom', started: s.tick, wait: 0 };
});
await page.click('#step');
let orangeState = await page.evaluate(() => window.SimSpatial.agentObservation(window.SimEngine.getState(), 'orange'));
add('covered floor is observable', orangeState?.surfaceId === 'floor' && orangeState?.covered === true && orangeState?.clearance === 0.72, JSON.stringify(orangeState));
let mark = await page.locator('[data-entity="agent:orange"] .spatial-node-mark').textContent().catch(() => '');
add('covered-floor map marker', mark === '下', `marker=${mark}`);
let actionLocation = await page.locator('.action-card.agent-orange .action-location').textContent();
add('covered-floor action label is not duplicated', count(actionLocation, '餐桌下') === 1, actionLocation.trim());
await page.locator('[data-entity="agent:orange"]').first().click();
await page.waitForTimeout(50);
let inspectorText = await page.locator('#inspector').textContent();
add('agent Inspector exposes Spatial Node fields', ['Space','Surface','Local Position','Node Key','Spatial Goal','最近路徑'].every(x => inspectorText.includes(x)), inspectorText.replace(/\s+/g, ' ').slice(0, 500));
await page.screenshot({ path: `${outDir}/01-orange-under-table.png`, fullPage: true });

// Actual traversal: floor -> tabletop through the eat path.
await page.click('#reset');
await page.evaluate(() => {
  const E = window.SimEngine, SP = window.SimSpatial, s = E.getState(), a = s.agents.orange;
  a.position = { ...SP.normalizeNode(s, { x: 4, y: 2 }, 'floor') };
  a.needs.hunger = 100;
  a.needs.groomingNeed = 0;
  a.needs.social = 0;
  a.action = { intent: 'eat', phase: 'toDirectFood', started: s.tick, wait: 0, foodSource: 'mealTray' };
});
await page.click('#step');
orangeState = await page.evaluate(() => window.SimSpatial.agentObservation(window.SimEngine.getState(), 'orange'));
add('cat uses traversal edge to reach tabletop', orangeState?.surfaceId === 'diningTable:surface', JSON.stringify(orangeState));
mark = await page.locator('[data-entity="agent:orange"] .spatial-node-mark').textContent().catch(() => '');
add('tabletop map marker', mark === '上', `marker=${mark}`);
actionLocation = await page.locator('.action-card.agent-orange .action-location').textContent();
add('tabletop action label is not duplicated', count(actionLocation, '餐桌桌面') === 1, actionLocation.trim());
await page.locator('[data-entity="agent:orange"]').first().click();
await page.waitForTimeout(50);
inspectorText = await page.locator('#inspector').textContent();
add('Inspector identifies diningTable surface', inspectorText.includes('diningTable:surface') && inspectorText.includes('餐桌桌面'), inspectorText.replace(/\s+/g, ' ').slice(0, 500));
await page.screenshot({ path: `${outDir}/02-orange-on-table.png`, fullPage: true });

// Actual tabletop movement toward food on plateB.
await page.evaluate(() => {
  const E = window.SimEngine, SP = window.SimSpatial, s = E.getState(), a = s.agents.orange;
  a.position = { ...SP.normalizeNode(s, { x: 5, y: 2 }, 'diningTable:surface') };
  s.containers.plateB.contents.food = 8;
  a.action = { intent: 'eat', phase: 'toDirectFood', started: s.tick, wait: 0, foodSource: 'plateB' };
});
await page.click('#step');
orangeState = await page.evaluate(() => window.SimSpatial.agentObservation(window.SimEngine.getState(), 'orange'));
add('cat can traverse within tabletop surface', orangeState?.surfaceId === 'diningTable:surface' && !(orangeState.position.x === 5 && orangeState.position.y === 2), JSON.stringify(orangeState));
await page.screenshot({ path: `${outDir}/03-orange-tabletop-move.png`, fullPage: true });

// Actual descent to adjacent floor through normal move execution.
await page.evaluate(() => {
  const E = window.SimEngine, SP = window.SimSpatial, s = E.getState(), a = s.agents.orange;
  a.position = { ...SP.normalizeNode(s, { x: 6, y: 3 }, 'diningTable:surface') };
  a.action = { intent: 'wander', phase: 'move', started: s.tick, wait: 0, targetTile: { x: 7, y: 3 }, oneShot: true };
});
await page.click('#step');
orangeState = await page.evaluate(() => window.SimSpatial.agentObservation(window.SimEngine.getState(), 'orange'));
add('cat can descend from tabletop to floor', orangeState?.surfaceId === 'floor' && orangeState.position.x === 7 && orangeState.position.y === 3, JSON.stringify(orangeState));
await page.screenshot({ path: `${outDir}/04-orange-descended.png`, fullPage: true });

// Human cross-surface direct eating should not require climbing when already at a valid table edge.
await page.click('#reset');
const beforeFood = await page.evaluate(() => {
  const E = window.SimEngine, SP = window.SimSpatial, s = E.getState(), a = s.agents.zhen;
  a.position = { ...SP.normalizeNode(s, { x: 4, y: 2 }, 'floor') };
  a.needs.hunger = 100;
  a.action = { intent: 'eat', phase: 'toDirectFood', started: s.tick, wait: 0, foodSource: 'mealTray' };
  return s.containers.mealTray.contents.food;
});
await page.click('#step');
await page.click('#step');
await page.click('#step');
const humanContact = await page.evaluate((before) => {
  const E = window.SimEngine, SP = window.SimSpatial, s = E.getState(), a = s.agents.zhen;
  return { obs: SP.agentObservation(s, a), foodBefore: before, foodAfter: s.containers.mealTray.contents.food };
}, beforeFood);
add('human adjacent cross-surface eat keeps human on floor', humanContact.obs?.surfaceId === 'floor' && humanContact.obs.position.x === 4 && humanContact.obs.position.y === 2, JSON.stringify(humanContact));
add('human adjacent cross-surface eat actually consumes food', humanContact.foodAfter < humanContact.foodBefore, JSON.stringify(humanContact));
await page.locator('[data-entity="agent:zhen"]').first().click();
await page.waitForTimeout(50);
await page.screenshot({ path: `${outDir}/05-human-cross-surface-eat.png`, fullPage: true });

// Source Inspector should receive the same Spatial Node observability section as Agent / Container.
await page.locator('[data-entity="source:tap"]').first().click();
await page.waitForTimeout(50);
const sourceSpatialSections = await page.locator('#inspector .spatial-observability-section').count();
const sourceInspector = (await page.locator('#inspector').textContent()).replace(/\s+/g, ' ').trim();
add('Source Inspector exposes Spatial Node section', sourceSpatialSections === 1 && sourceInspector.includes('Node Key'), `sections=${sourceSpatialSections}; ${sourceInspector.slice(0, 450)}`);
await page.screenshot({ path: `${outDir}/06-tap-inspector.png`, fullPage: true });

// Supported objects should not show a contradictory legacy floor description in their base inspector block.
await page.locator('[data-entity="container:plateA"]').first().click();
await page.waitForTimeout(50);
const plateInspector = (await page.locator('#inspector').textContent()).replace(/\s+/g, ' ').trim();
add('supported object base location agrees with Spatial Node', plateInspector.includes('位置餐桌桌面') && !plateInspector.includes('位置餐桌下'), plateInspector.slice(0, 500));

// Furniture observability must remain directly reachable even when objects cover every tabletop cell.
const tableHandle = page.locator('.spatial-furniture-handle[data-furniture-id="diningTable"]').first();
const tableHandleCount = await tableHandle.count();
let tableClickable = tableHandleCount === 1;
let tableClickError = tableHandleCount === 1 ? '' : `handles=${tableHandleCount}`;
if(tableClickable){
  try { await tableHandle.click({ timeout: 1500 }); }
  catch(err){ tableClickable=false; tableClickError=String(err).split('\n').slice(0,6).join(' '); }
}
add('Dining table can be selected directly on the map', tableClickable, tableClickError || 'dedicated furniture handle clicked');
await page.waitForTimeout(50);
const furnitureInspector = (await page.locator('#inspector').textContent()).replace(/\s+/g, ' ').trim();
add('Dining table Inspector exposes spatial geometry', furnitureInspector.includes('Furniture・diningTable') && furnitureInspector.includes('Spatial Geometry') && furnitureInspector.includes('diningTable:surface') && furnitureInspector.includes('0.72 m'), furnitureInspector.slice(0, 500));
await page.screenshot({ path: `${outDir}/07-table-inspector.png`, fullPage: true });

// Mobile sanity: map and inspector must remain within viewport.
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.SimEngine?.getState && window.SimSpatial?.agentObservation);
const mobileOverflowBefore = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
add('mobile initial view has no horizontal overflow', mobileOverflowBefore.scroll <= mobileOverflowBefore.width + 1, JSON.stringify(mobileOverflowBefore));
await page.locator('[data-entity="agent:orange"]').first().click();
await page.waitForTimeout(80);
const mobileOverflowInspector = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, active: document.querySelector('.view-panel.mobile-active')?.dataset.view }));
add('mobile Inspector opens without horizontal overflow', mobileOverflowInspector.active === 'inspector' && mobileOverflowInspector.scroll <= mobileOverflowInspector.width + 1, JSON.stringify(mobileOverflowInspector));
await page.screenshot({ path: `${outDir}/08-mobile-inspector.png`, fullPage: true });

add('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
add('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

const report = {
  generatedAt: new Date().toISOString(),
  version,
  passed: results.filter(x => x.pass).length,
  failed: results.filter(x => !x.pass).length,
  results,
  consoleErrors,
  pageErrors
};
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${outDir}/report.txt`, results.map(x => `${x.pass ? 'PASS' : 'FAIL'} | ${x.name}${x.details ? ` | ${x.details}` : ''}`).join('\n') + '\n');
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (report.failed) process.exitCode = 1;
