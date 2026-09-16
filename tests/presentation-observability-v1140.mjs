import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const CURRENT_VERSION='11.14.1-player-readable-action-explanations';
const files=[
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js','presentation-schema-v1140.js',
  'engine.js','runtime-hook-pipeline.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js'
];
for(const file of files)vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const E=globalThis.SimEngine,W=globalThis.SimWorld,V=globalThis.SimValidator;
E.reset(11401);
let st=E.getState();
assert.equal(W.PRESENTATION_SCHEMA_VERSION,CURRENT_VERSION);
assert.equal(st.version,CURRENT_VERSION);
const uiObservabilitySource=fs.readFileSync(new URL('../src/ui-observability-controls-v1133a.js',import.meta.url),'utf8');
assert.doesNotMatch(uiObservabilitySource,/E\.addEvent\s*=/,'UI observability must not replace addEvent');
assert.doesNotMatch(uiObservabilitySource,/E\.actionLabel\s*=/,'UI observability must not replace actionLabel');
assert.doesNotMatch(uiObservabilitySource,/recentSocialByAgent/,'UI observability must not maintain a recent-social lifecycle cache');
assert.equal(E.actionLabel,E.CORE_ACTION_LABEL,'core actionLabel ownership must remain stable before UI resolver registration');
assert.deepEqual(E.listActionLabelResolvers(),[],'headless simulation should start without presentation label resolvers');

const baseUiSource=fs.readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
assert.match(baseUiSource,/registerInspectorDecorator/,'base UI must own explicit Inspector decorator lifecycle');
const residentUiSource=fs.readFileSync(new URL('../src/ui-resident-view-v1140.js',import.meta.url),'utf8');
assert.match(residentUiSource,/const VERSION=W\.PRESENTATION_SCHEMA_VERSION;/,'Resident View must inherit the canonical current runtime marker instead of hardcoding a second version');
assert.match(residentUiSource,/function playerActionExplanation\(st,a\)/,'Resident View must derive player-readable explanations at render time');
assert.match(residentUiSource,/thought\.tick!==action\.started\|\|pick\.id!==action\.kind/,'player explanation must reject stale or action-mismatched decision evidence');
assert.match(residentUiSource,/activeIntent\?\.kind==='respondSocialBid'\)return ''/,'responder actions must not be mislabeled as autonomous motives');
assert.match(residentUiSource,/data-v1140-player-explanation/,'trusted explanation must render only as a Resident presentation element');
assert.doesNotMatch(residentUiSource,/\.(?:currentReason|actionExplanation|playerStory|causalTrace)\s*=/,'Resident View must not persist explanation or causal-trace mirror state');
const indexSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(indexSource,/v11\.14\.1・Player-readable Action Explanations/,'app shell must expose the current short version and feature label');
const readmeSource=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');
assert.ok(readmeSource.includes(CURRENT_VERSION),'README current runtime marker must match the canonical version');
const architectureSource=fs.readFileSync(new URL('../docs/architecture.md',import.meta.url),'utf8');
assert.ok(architectureSource.includes(CURRENT_VERSION),'architecture current runtime marker must match the canonical version');
const versioningSource=fs.readFileSync(new URL('../docs/versioning.md',import.meta.url),'utf8');
assert.ok(versioningSource.includes(CURRENT_VERSION),'versioning contract must identify the current runtime marker');
assert.match(versioningSource,/何時必須升版/,'versioning contract must define a mandatory bump boundary');
const explicitInspectorDecoratorFiles=[
  'ui-intent-v1121.js','ui-memory-v1130.js','ui-appraisal-v1131.js','ui-affect-v1132.js',
  'ui-memory-retention-v1133.js','ui-memory-deliberation-v1134.js','ui-social-outcome-memory-v1135.js',
  'ui-spatial-environment.js','ui-resident-view-v1140.js'
];
for(const file of explicitInspectorDecoratorFiles){
  const source=fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
  assert.match(source,/registerInspectorDecorator/,`${file} must use explicit Inspector lifecycle`);
  assert.doesNotMatch(source,/new MutationObserver/,`${file} must not infer Inspector render completion from MutationObserver`);
}
const spatialUiSource=fs.readFileSync(new URL('../src/ui-spatial-observability.js',import.meta.url),'utf8');
assert.match(spatialUiSource,/registerInspectorDecorator\('spatial\.observability'/,'spatial Inspector must use explicit decorator lifecycle');
assert.doesNotMatch(spatialUiSource,/\['inspector','map','actions'\]/,'spatial DOM observer must no longer own Inspector rendering');
const probeEventId=E.addEvent('presentation event tick probe','system',[],{action:'presentationProbe'});
assert.equal(st.causes[probeEventId]?.tick,st.tick,'canonical events must preserve creation tick for derived presentation recency');
E.registerActionLabelResolver('qa.presentation-label',(state,a)=>a?.id==='qa-probe'?'QA presentation label':null,10);
assert.deepEqual(E.listActionLabelResolvers(),[{id:'qa.presentation-label',order:10}]);
assert.equal(E.actionLabel({id:'qa-probe',action:null}),'QA presentation label');
assert.equal(E.actionLabel,E.CORE_ACTION_LABEL,'registering a resolver must not replace core actionLabel');
assert.throws(()=>E.registerActionLabelResolver('qa.presentation-label',()=>null,20),/duplicate action label resolver/);

const forbiddenState=['residentView','playerSummary','debugInspectorMode','presentationState','playerFacingState','currentReason','actionExplanation','playerStory','causalTrace'];
const forbiddenAgent=['residentView','playerSummary','moodLabel','relationshipLabel','debugMode','presentation','currentReason','actionExplanation','playerStory','causalTrace'];
for(const key of forbiddenState)assert.equal(Object.prototype.hasOwnProperty.call(st,key),false,`state persisted presentation field ${key}`);
for(const a of Object.values(st.agents))for(const key of forbiddenAgent)assert.equal(Object.prototype.hasOwnProperty.call(a,key),false,`${a.id} persisted presentation field ${key}`);
assert.equal(V.validateState(st).issueCount,0);

for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  assert.equal(st.version,CURRENT_VERSION);
  for(const key of forbiddenState)assert.equal(Object.prototype.hasOwnProperty.call(st,key),false,`tick ${i+1}: state persisted ${key}`);
  for(const a of Object.values(st.agents))for(const key of forbiddenAgent)assert.equal(Object.prototype.hasOwnProperty.call(a,key),false,`tick ${i+1}: ${a.id} persisted ${key}`);
  if(i%25===0){const v=V.validateState(st);assert.equal(v.issueCount,0,`tick ${i+1}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);}
}
assert.equal(V.validateState(st).issueCount,0);
console.log('v11.14.1 presentation observability + version consistency regression: ok');
