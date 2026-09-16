import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const CURRENT_VERSION='11.14.4-entity-readable-view';
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
E.reset(11404);
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
assert.match(residentUiSource,/REQUIRED_INTENT_LABELS/,'Resident View must verify canonical Intent label coverage');
assert.match(residentUiSource,/drinkWater:'補充水分'/,'drinkWater Intent must describe the goal instead of echoing the Action label');
assert.match(residentUiSource,/drinkAlcohol:'解渴／喝點酒'/,'drinkAlcohol Intent must describe the goal instead of echoing the Action label');
assert.match(residentUiSource,/restockResource:'補充室內資源'/,'restockResource Intent must use the canonical Intent kind');
assert.match(residentUiSource,/removeHazard:'處理濕滑地面'/,'removeHazard Intent must use the canonical Intent kind');
assert.doesNotMatch(residentUiSource,/satisfyThirst:|cleanEnvironment:|restockFood:|restockWater:/,'Resident labels must not keep obsolete/non-canonical Intent keys');
assert.match(residentUiSource,/function residentActionText\(st,a\)/,'Resident View must own a player-readable Action projection');
assert.match(residentUiSource,/replace\(\/・目標 \\?/,'Resident Action projection must remove raw spatial-goal coordinates');
assert.match(residentUiSource,/function playerActionExplanation\(st,a\)/,'Resident View must derive player-readable explanations at render time');
assert.match(residentUiSource,/thought\.tick!==action\.started\|\|pick\.id!==action\.kind/,'player explanation must reject stale or action-mismatched decision evidence');
assert.match(residentUiSource,/activeIntent\?\.kind==='respondSocialBid'\)return ''/,'responder actions must not be mislabeled as autonomous motives');
assert.match(residentUiSource,/case 'eat': return '因為肚子餓了。'/,'hunger explanation should use direct everyday wording');
assert.match(residentUiSource,/case 'drinkWater': return '因為口渴。'/,'thirst explanation should use direct everyday wording');
assert.match(residentUiSource,/case 'rest': return '因為累了。'/,'fatigue explanation should use direct everyday wording');
assert.match(residentUiSource,/case 'sleep': return '因為想睡了。'/,'sleep explanation should use direct everyday wording');
assert.match(residentUiSource,/case 'talk': return '因為想找人說說話。'/,'social explanation should use direct everyday wording');
assert.match(residentUiSource,/case 'wander': return '因為現在沒有更急著要做的事。'/,'wander explanation should state selection pressure without engine terminology');
assert.doesNotMatch(residentUiSource,/飢餓感已經變得明顯|活動疲勞累積得比較明顯|睡眠需求已經變得明顯|社交需求已經變得比較明顯|理毛需求累積得比較明顯/,'Player Explanation must not leak need-threshold wording when a natural reason is available');
assert.match(residentUiSource,/data-v1140-player-explanation/,'trusted explanation must render only as a Resident presentation element');
assert.doesNotMatch(residentUiSource,/\.(?:currentReason|actionExplanation|playerStory|causalTrace)\s*=/,'Resident View must not persist explanation or causal-trace mirror state');

const entityUiSource=fs.readFileSync(new URL('../src/ui-entity-readable-v1141.js',import.meta.url),'utf8');
assert.match(entityUiSource,/const VERSION=W\.PRESENTATION_SCHEMA_VERSION;/,'Entity Readable View must inherit the canonical current runtime marker');
assert.match(entityUiSource,/new Set\(\['container','source','furniture','tile','room','event'\]\)/,'Entity Readable View must explicitly cover all current non-agent Inspector entity types');
assert.match(entityUiSource,/registerInspectorDecorator\('entityReadable\.layer',decorateInspector,1050\)/,'Entity Readable View must use the explicit Inspector decorator lifecycle after the Resident layer');
assert.match(entityUiSource,/selected\?\.type==='agent'/,'Entity Readable View must leave Agent rendering owned by the existing Resident layer');
assert.match(entityUiSource,/slotOccupant/,'Furniture readable projection should use actual occupancy');
assert.doesNotMatch(entityUiSource,/slotReservedBy/,'Furniture readable projection must not expose slot reservation as player-facing state');
assert.doesNotMatch(entityUiSource,/\.(?:playerContents|readableFurnitureState|entityReadableState)\s*=/,'Entity Readable View must not persist player-facing mirror state');
assert.match(entityUiSource,/UI_ENTITY_READABLE_VERSION=VERSION/,'Entity Readable View must expose the canonical presentation version');

const indexSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(indexSource,/v11\.14\.4・Entity Readable View/,'app shell must expose the current short version and feature label');
assert.match(indexSource,/實體檢視 \/ Debug Inspector/,'Inspector panel heading must no longer imply that only residents have a readable view');
assert.match(indexSource,/ui-entity-readable-v1141\.js/,'app shell must load the non-agent readable entity layer');
const readmeSource=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');
assert.ok(readmeSource.includes(CURRENT_VERSION),'README current runtime marker must match the canonical version');
assert.match(readmeSource,/Player-readable Entity View 與 Debug Inspector 共用同一 authoritative simulation state/,'README must record the generalized readable entity boundary');
assert.match(readmeSource,/slot reservation/,'README must document the reservation/debug privacy boundary');
const architectureSource=fs.readFileSync(new URL('../docs/architecture.md',import.meta.url),'utf8');
assert.ok(architectureSource.includes(CURRENT_VERSION),'architecture current runtime marker must match the canonical version');
assert.match(architectureSource,/Action＝角色現在具體在做什麼/,'Architecture must define the Resident Action layer');
assert.match(architectureSource,/Intent＝這個行動服務的短期目的/,'Architecture must define the Resident Intent layer');
assert.match(architectureSource,/Explanation＝為什麼此刻選這個行動/,'Architecture must define the Resident Explanation layer');
assert.match(architectureSource,/Explanation wording 優先自然直接/,'Architecture must record the natural player explanation wording contract');
assert.match(architectureSource,/Entity Readable View/,'Architecture must define the generalized player-readable entity surface');
const versioningSource=fs.readFileSync(new URL('../docs/versioning.md',import.meta.url),'utf8');
assert.ok(versioningSource.includes(CURRENT_VERSION),'versioning contract must identify the current runtime marker');
assert.match(versioningSource,/何時必須升版/,'versioning contract must define a mandatory bump boundary');
const explicitInspectorDecoratorFiles=[
  'ui-intent-v1121.js','ui-memory-v1130.js','ui-appraisal-v1131.js','ui-affect-v1132.js',
  'ui-memory-retention-v1133.js','ui-memory-deliberation-v1134.js','ui-social-outcome-memory-v1135.js',
  'ui-spatial-environment.js','ui-resident-view-v1140.js','ui-entity-readable-v1141.js'
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

const forbiddenState=['residentView','playerSummary','debugInspectorMode','presentationState','playerFacingState','currentReason','actionExplanation','playerStory','causalTrace','entityReadableView','playerContents','readableFurnitureState'];
const forbiddenAgent=['residentView','playerSummary','moodLabel','relationshipLabel','debugMode','presentation','currentReason','actionExplanation','playerStory','causalTrace','entityReadableView'];
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
console.log('v11.14.4 presentation observability + entity readable view regression: ok');
