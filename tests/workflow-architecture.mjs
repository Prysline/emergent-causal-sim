import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflowDir=new URL('../.github/workflows/',import.meta.url);
const testDir=new URL('./',import.meta.url);
const workflows=fs.readdirSync(workflowDir).filter(name=>name.endsWith('.yml')).sort();
assert.deepEqual(workflows,['browser-regression.yml','node-regression.yml'],'current workflow ownership must stay consolidated to Node + Browser regression');

const node=fs.readFileSync(new URL('../.github/workflows/node-regression.yml',import.meta.url),'utf8');
const browser=fs.readFileSync(new URL('../.github/workflows/browser-regression.yml',import.meta.url),'utf8');
assert.doesNotMatch(node,/feature\//,'Node regression must not retain historical feature-branch triggers');
assert.doesNotMatch(browser,/feature\//,'Browser regression must not retain historical feature-branch triggers');

const semanticNodeTests=[
  'tests/state-regression.mjs',
  'tests/horizontal-geometry-foundation.mjs',
  'tests/spatial-z-identity.mjs',
  'tests/physical-profile-foundation.mjs',
  'tests/passage-profile-multimode.mjs',
  'tests/route-semantics.mjs',
  'tests/locomotion-execution-posture.mjs',
  'tests/dynamic-congestion.mjs',
  'tests/relationship-foundation.mjs',
  'tests/relationship-target-preference.mjs',
  'tests/relationship-responder-bias.mjs',
  'tests/presentation-observability.mjs'
];
for(const path of semanticNodeTests)assert.ok(node.includes(path),'Node regression must cover '+path);

const browserTests=[
  'tests/browser-social-response-qa.mjs',
  'tests/browser-human-social-response-qa.mjs',
  'tests/browser-memory-salience-qa.mjs',
  'tests/browser-memory-deliberation-qa.mjs',
  'tests/browser-social-outcome-memory-qa.mjs',
  'tests/browser-observability-controls-qa.mjs',
  'tests/browser-resident-view-qa.mjs',
  'tests/browser-world-authoring-editor-qa.mjs',
  'tests/browser-runtime-hook-pipeline-qa.mjs'
];
for(const path of browserTests)assert.ok(browser.includes(path),'Browser regression must cover '+path);

const retiredTests=[
  'browser-resident-view-v1140-qa.mjs',
  'dynamic-congestion-v1200.mjs',
  'locomotion-execution-posture-v1190.mjs',
  'passage-profile-multimode-v1170.mjs',
  'physical-profile-foundation-v1160.mjs',
  'presentation-observability-v1140.mjs',
  'relationship-foundation-v1150.mjs',
  'relationship-responder-bias-v1152.mjs',
  'relationship-target-preference-v1151.mjs',
  'route-semantics-v1180.mjs',
  'spatial-z-identity-v1220.mjs',
  'v11-state-regression.mjs',
  'browser-appraisal-qa.mjs',
  'browser-affect-qa.mjs'
];
const currentTests=new Set(fs.readdirSync(testDir));
for(const name of retiredTests)assert.equal(currentTests.has(name),false,'retired test path must not remain current: '+name);

assert.match(browser,/fail-fast:\s*false/,'Browser matrix must report every current suite rather than stop at the first failure');
assert.match(browser,/suite:\s*resident-view[\s\S]*extra_test:\s*tests\/browser-runtime-hook-pipeline-qa\.mjs/,'Resident View matrix case must retain runtime-hook browser coverage');
console.log('Workflow architecture regression: ok');
