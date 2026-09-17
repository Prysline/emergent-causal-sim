import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const CURRENT_VERSION='11.17.0-passage-profile-multimode';
const files=[
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js','presentation-schema-v1140.js','relationship-schema-v1150.js','physical-schema-v1160.js','physical-runtime-v1160.js','spatial-passage-v1170.js',
  'engine.js','runtime-hook-pipeline.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','relationship-runtime-v1150.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js','state-validator-v1150.js','state-validator-v1160.js'
];
for(const file of files)vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const E=globalThis.SimEngine,W=globalThis.SimWorld,V=globalThis.SimValidator;
E.reset(11700);
let st=E.getState();
assert.equal(W.PRESENTATION_SCHEMA_VERSION,CURRENT_VERSION);
assert.equal(W.RELATIONSHIP_SCHEMA_VERSION,'11.15.2-relationship-responder-bias');
assert.equal(W.PHYSICAL_SCHEMA_VERSION,CURRENT_VERSION);
assert.equal(W.PHYSICAL_RUNTIME_VERSION,CURRENT_VERSION);
assert.equal(globalThis.SimSpatial.PASSAGE_PROFILE_VERSION,CURRENT_VERSION);
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

const relationshipSource=fs.readFileSync(new URL('../src/relationship-runtime-v1150.js',import.meta.url),'utf8');
assert.match(relationshipSource,/relationship\.consolidate/,'Relationship must consolidate from the episodic-memory lifecycle');
assert.match(relationshipSource,/order:350|,350\)/,'Relationship consolidation must happen after specialized appraisal and before Affect');
assert.match(relationshipSource,/acceptTalk:\{roles:new Set\(\['target'\]\)\}/,'full Human conversation requester evidence must come from acceptTalk rather than double-counting talk');
assert.match(relationshipSource,/talk:\{roles:new Set\(\['target'\]\)\}/,'full Human conversation responder evidence must come from the completed talk outcome');
assert.match(relationshipSource,/function relationshipSignal\(a,counterpartId\)/,'Relationship must expose one directional unitless downstream signal');
assert.doesNotMatch(relationshipSource,/trust|friendshipScore|love|hate/,'Relationship Foundation must not smuggle unsupported semantic dimensions into runtime policy');
const relationshipUiSource=fs.readFileSync(new URL('../src/ui-relationship-v1150.js',import.meta.url),'utf8');
assert.match(relationshipUiSource,/registerInspectorDecorator\('relationship\.view',decorateInspector,1025\)/,'Relationship UI must use explicit Inspector lifecycle after Resident and before Entity readable layers');
assert.match(relationshipUiSource,/熟悉不等於喜歡/,'player-readable relationship copy must preserve familiarity/affinity semantic separation');
assert.match(relationshipUiSource,/Talk responder：base/,'Relationship Debug must expose Human responder score decomposition');
assert.match(relationshipUiSource,/Pet responder：base/,'Relationship Debug must expose animal responder score decomposition');
assert.match(relationshipUiSource,/Responder score 分解為即時計算的 derived Debug/,'Relationship Debug must identify responder decomposition as derived, not persistent truth');
assert.doesNotMatch(relationshipUiSource,/\.relationships\s*=/,'Relationship UI must remain a read-only projection');

const physicalSource=fs.readFileSync(new URL('../src/physical-runtime-v1160.js',import.meta.url),'utf8');
assert.match(physicalSource,/function getMovementEnvelope\(agent,mode='walk'\)/,'Physical runtime must own the canonical walk-first derived MovementEnvelope interface');
assert.match(physicalSource,/function requiredClearance\(agent,mode='walk'\)/,'Physical runtime must expose canonical walk clearance to Spatial');
assert.match(physicalSource,/function supportedLocomotionModes\(agent\)/,'Physical runtime must expose supported locomotion modes without choosing one');
const passageSource=fs.readFileSync(new URL('../src/spatial-passage-v1170.js',import.meta.url),'utf8');
assert.match(passageSource,/function getPassageProfile\(st,from,to\)/,'Spatial must own the canonical derived PassageProfile query');
assert.match(passageSource,/function traversalFeasibility\(st,agent,from,to\)/,'Spatial must expose multi-mode physical traversal feasibility');
assert.doesNotMatch(passageSource,/bestMode|recommendedMode|relationship|memory|affinity|goalPressure/i,'Passage feasibility must not choose modes or read psychological state');
const physicalUiSource=fs.readFileSync(new URL('../src/ui-physical-v1160.js',import.meta.url),'utf8');
assert.match(physicalUiSource,/registerInspectorDecorator\('physical\.view',decorateInspector,1026\)/,'Physical Debug must use the explicit Inspector lifecycle');
assert.match(physicalUiSource,/MovementEnvelope 由 locomotion mode 即時計算/,'Physical Debug must identify MovementEnvelope as derived truth');
assert.match(physicalUiSource,/posture 的 standing 與 locomotion 的 walk 是不同語意/,'Physical Debug must preserve posture/locomotion terminology separation');
assert.doesNotMatch(physicalUiSource,/\.physical\s*=/,'Physical UI must remain a read-only projection');

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
assert.match(indexSource,/v11\.17\.0・Passage Profile \+ Multi-mode Feasibility/,'app shell must expose the current short version and feature label');
assert.match(indexSource,/實體檢視 \/ Debug Inspector/,'Inspector panel heading must remain generalized beyond residents');
assert.match(indexSource,/Physical Profile \/ multi-mode MovementEnvelopes/,'app shell must expose current Physical Debug observability');
assert.match(indexSource,/relationship-schema-v1150\.js/,'app shell must load Relationship schema');
assert.match(indexSource,/relationship-runtime-v1150\.js/,'app shell must load Relationship runtime');
assert.match(indexSource,/ui-relationship-v1150\.js/,'app shell must load player/debug Relationship projection');
assert.match(indexSource,/physical-schema-v1160\.js/,'app shell must load Physical schema');
assert.match(indexSource,/physical-runtime-v1160\.js/,'app shell must load Physical runtime');
assert.match(indexSource,/spatial-passage-v1170\.js/,'app shell must load Passage Profile runtime');
assert.match(indexSource,/state-validator-v1160\.js/,'app shell must load Physical validator');
assert.match(indexSource,/ui-physical-v1160\.js/,'app shell must load Physical Debug projection');
assert.match(indexSource,/ui-entity-readable-v1141\.js/,'app shell must keep the non-agent readable entity layer');
const readmeSource=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');
assert.ok(readmeSource.includes(CURRENT_VERSION),'README current runtime marker must match the canonical version');
assert.match(readmeSource,/Relationship Foundation/,'README must document the long-term dyadic state foundation');
assert.match(readmeSource,/Responder Bias/,'README must retain current Relationship responder influence');
assert.match(readmeSource,/Physical Profile Foundation/,'README must retain the Physical Foundation boundary');
assert.match(readmeSource,/Passage Profile/,'README must document the current multi-mode traversal-feasibility slice');
assert.match(readmeSource,/Player-readable Entity View 與 Debug Inspector 共用同一 authoritative simulation state/,'README must retain the generalized readable entity boundary');
assert.match(readmeSource,/slot reservation/,'README must document the reservation/debug privacy boundary');
const architectureSource=fs.readFileSync(new URL('../docs/architecture.md',import.meta.url),'utf8');
assert.ok(architectureSource.includes(CURRENT_VERSION),'architecture current runtime marker must match the canonical version');
assert.match(architectureSource,/Action＝角色現在具體在做什麼/,'Architecture must define the Resident Action layer');
assert.match(architectureSource,/Intent＝這個行動服務的短期目的/,'Architecture must define the Resident Intent layer');
assert.match(architectureSource,/Explanation＝為什麼此刻選擇這個行動/,'Architecture must define the Resident Explanation layer');
assert.match(architectureSource,/Explanation wording 優先自然直接/,'Architecture must record the natural player explanation wording contract');
assert.match(architectureSource,/Entity Readable View/,'Architecture must define the generalized player-readable entity surface');
assert.match(architectureSource,/Relationship Foundation/,'Architecture must define Relationship ownership and truth boundaries');
assert.match(architectureSource,/Relationship → Responder Bias/,'Architecture must retain responder-bias boundary');
assert.match(architectureSource,/Physical Profile Foundation/,'Architecture must define Physical Profile ownership');
assert.match(architectureSource,/MovementEnvelope/,'Architecture must define the derived locomotion geometry boundary');
assert.match(architectureSource,/PassageProfile/,'Architecture must define the derived passage geometry boundary');
assert.match(architectureSource,/traversalFeasibility/,'Architecture must define the physical multi-mode feasibility boundary');
const versioningSource=fs.readFileSync(new URL('../docs/versioning.md',import.meta.url),'utf8');
assert.ok(versioningSource.includes(CURRENT_VERSION),'versioning contract must identify the current runtime marker');
assert.match(versioningSource,/何時必須升版/,'versioning contract must define a mandatory bump boundary');
const explicitInspectorDecoratorFiles=[
  'ui-intent-v1121.js','ui-memory-v1130.js','ui-appraisal-v1131.js','ui-affect-v1132.js',
  'ui-memory-retention-v1133.js','ui-memory-deliberation-v1134.js','ui-social-outcome-memory-v1135.js',
  'ui-spatial-environment.js','ui-resident-view-v1140.js','ui-relationship-v1150.js','ui-physical-v1160.js','ui-entity-readable-v1141.js'
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

const forbiddenState=['residentView','playerSummary','debugInspectorMode','presentationState','playerFacingState','currentReason','actionExplanation','playerStory','causalTrace','entityReadableView','playerContents','readableFurnitureState','pairRelationships','relationshipRegistry','responderEvaluation'];
const forbiddenAgent=['residentView','playerSummary','moodLabel','relationshipLabel','debugMode','presentation','currentReason','actionExplanation','playerStory','causalTrace','entityReadableView','friendshipScore','relationshipScore','relationshipResponseDelta','talkResponseScore','petResponseScore','movementEnvelope'];
for(const key of forbiddenState)assert.equal(Object.prototype.hasOwnProperty.call(st,key),false,`state persisted presentation field ${key}`);
for(const a of Object.values(st.agents)){
  for(const key of forbiddenAgent)assert.equal(Object.prototype.hasOwnProperty.call(a,key),false,`${a.id} persisted presentation field ${key}`);
  assert.equal(Object.prototype.hasOwnProperty.call(a.physical||{},'movementEnvelope'),false,`${a.id} persisted derived MovementEnvelope cache`);
}
assert.equal(V.validateState(st).issueCount,0);

for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  assert.equal(st.version,CURRENT_VERSION);
  for(const key of forbiddenState)assert.equal(Object.prototype.hasOwnProperty.call(st,key),false,`tick ${i+1}: state persisted ${key}`);
  for(const a of Object.values(st.agents)){
    for(const key of forbiddenAgent)assert.equal(Object.prototype.hasOwnProperty.call(a,key),false,`tick ${i+1}: ${a.id} persisted ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(a.physical||{},'movementEnvelope'),false,`tick ${i+1}: ${a.id} persisted derived MovementEnvelope cache`);
  }
  if(i%25===0){const v=V.validateState(st);assert.equal(v.issueCount,0,`tick ${i+1}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);}
}
assert.equal(V.validateState(st).issueCount,0);
console.log('v11.17.0 presentation observability + Passage Profile multi-mode feasibility regression: ok');