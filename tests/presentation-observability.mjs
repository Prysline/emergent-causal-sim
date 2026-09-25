import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const CURRENT_VERSION='11.29.1-slot-interaction-egress';
const CROWDING_VERSION='11.28.0-effective-passage-width';
const LOCOMOTION_VERSION='11.24.0-locomotion-objective-burden';
const ROUTE_VERSION='11.24.0-route-locomotion-cost';
const PHYSICAL_VERSION='11.17.0-passage-profile-multimode';
const PASSAGE_VERSION='11.29.0-horizontal-connection-passage';
const files=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js','systems/relationship/state.js','systems/physical.js','spatial-passage.js','systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/relationship/runtime.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js','systems/memory/deliberation.js','systems/memory/social-outcome.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js','validation/rules/memory-deliberation.js','validation/rules/social-outcome-memory.js','validation/rules/relationship.js','validation/rules/physical-profile.js','validation/rules/locomotion-execution.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,W=globalThis.SimWorld,V=globalThis.SimValidator;
E.reset(11700);
let st=E.getState();
assert.equal(W.PRESENTATION_SCHEMA_VERSION,undefined,'headless runtime must not expose a World-owned Presentation schema marker');
assert.equal(W.RELATIONSHIP_SCHEMA_VERSION,'11.15.2-relationship-responder-bias');
assert.equal(W.PHYSICAL_SCHEMA_VERSION,PHYSICAL_VERSION);
assert.equal(W.PHYSICAL_RUNTIME_VERSION,PHYSICAL_VERSION);
assert.equal(globalThis.SimSpatial.PASSAGE_PROFILE_VERSION,PASSAGE_VERSION);
assert.equal(st.version,CURRENT_VERSION);
assert.equal(globalThis.SimSpatial.ROUTE_SEMANTICS_VERSION,ROUTE_VERSION);
assert.equal(W.LOCOMOTION_SCHEMA_VERSION,LOCOMOTION_VERSION);
assert.equal(globalThis.SimLocomotion.VERSION,LOCOMOTION_VERSION);
assert.equal(globalThis.SimCrowding.VERSION,CROWDING_VERSION);
assert.equal(globalThis.SimSpatial.CROWDING_VERSION,CROWDING_VERSION);
const uiObservabilitySource=fs.readFileSync(new URL('../src/ui/observability-controls.js',import.meta.url),'utf8');
assert.doesNotMatch(uiObservabilitySource,/E\.addEvent\s*=/,'UI observability must not replace addEvent');
assert.doesNotMatch(uiObservabilitySource,/E\.actionLabel\s*=/,'UI observability must not replace actionLabel');
assert.doesNotMatch(uiObservabilitySource,/recentSocialByAgent/,'UI observability must not maintain a recent-social lifecycle cache');
assert.equal(E.actionLabel,E.CORE_ACTION_LABEL,'core actionLabel ownership must remain stable before UI resolver registration');
assert.deepEqual(E.listActionLabelResolvers(),[],'headless simulation should start without presentation label resolvers');

const labelsSource=fs.readFileSync(new URL('../src/ui/labels.js',import.meta.url),'utf8');
assert.match(labelsSource,/const VERSION=R\.VERSION;/,'Presentation version must derive from the canonical release owner');
assert.match(labelsSource,/PRESENTATION_VERSION:VERSION/,'Presentation version must be owned by SimUI');
assert.match(labelsSource,/INTERACTION_LABELS/,'interaction labels must move to the semantic UI owner');
const baseUiSource=fs.readFileSync(new URL('../src/ui/core.js',import.meta.url),'utf8');
assert.match(baseUiSource,/registerInspectorDecorator/,'base UI must own explicit Inspector decorator lifecycle');
assert.match(baseUiSource,/kneeling:'跪姿'/,'base UI must render kneeling posture explicitly instead of falling back to standing');
assert.match(baseUiSource,/prone:'俯臥'/,'base UI must render prone posture explicitly instead of falling back to standing');
const residentUiSource=fs.readFileSync(new URL('../src/ui/resident-view.js',import.meta.url),'utf8');
assert.match(residentUiSource,/const VERSION=UI\.PRESENTATION_VERSION;/,'Resident View must inherit the canonical Presentation marker from SimUI');
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

const relationshipSource=fs.readFileSync(new URL('../src/systems/relationship/runtime.js',import.meta.url),'utf8');
assert.match(relationshipSource,/relationship\.consolidate/,'Relationship must consolidate from the episodic-memory lifecycle');
assert.match(relationshipSource,/order:350|,350\)/,'Relationship consolidation must happen after specialized appraisal and before Affect');
assert.match(relationshipSource,/acceptTalk:\{roles:new Set\(\['target'\]\)\}/,'full Human conversation requester evidence must come from acceptTalk rather than double-counting talk');
assert.match(relationshipSource,/talk:\{roles:new Set\(\['target'\]\)\}/,'full Human conversation responder evidence must come from the completed talk outcome');
assert.match(relationshipSource,/function relationshipSignal\(a,counterpartId\)/,'Relationship must expose one directional unitless downstream signal');
assert.doesNotMatch(relationshipSource,/trust|friendshipScore|love|hate/,'Relationship Foundation must not smuggle unsupported semantic dimensions into runtime policy');
const relationshipUiSource=fs.readFileSync(new URL('../src/ui/inspectors/relationship.js',import.meta.url),'utf8');
assert.match(relationshipUiSource,/registerInspectorDecorator\('relationship\.view',decorateInspector,1025\)/,'Relationship UI must use explicit Inspector lifecycle after Resident and before Entity readable layers');
assert.match(relationshipUiSource,/熟悉不等於喜歡/,'player-readable relationship copy must preserve familiarity/affinity semantic separation');
assert.match(relationshipUiSource,/Talk responder：base/,'Relationship Debug must expose Human responder score decomposition');
assert.match(relationshipUiSource,/Pet responder：base/,'Relationship Debug must expose animal responder score decomposition');
assert.match(relationshipUiSource,/Responder score 分解為即時計算的 derived Debug/,'Relationship Debug must identify responder decomposition as derived, not persistent truth');
assert.doesNotMatch(relationshipUiSource,/\.relationships\s*=/,'Relationship UI must remain a read-only projection');

const physicalSource=fs.readFileSync(new URL('../src/systems/physical.js',import.meta.url),'utf8');
assert.match(physicalSource,/function getMovementEnvelope\(agent,mode='walk'\)/,'Physical runtime must own the canonical walk-first derived MovementEnvelope interface');
assert.match(physicalSource,/function requiredClearance\(agent,mode='walk'\)/,'Physical runtime must expose canonical walk clearance to Spatial');
assert.match(physicalSource,/function supportedLocomotionModes\(agent\)/,'Physical runtime must expose supported locomotion modes without choosing one');
assert.doesNotMatch(physicalSource,/PRESENTATION_SCHEMA_VERSION|currentReleaseVersion|W\.VERSION\s*=|st\.version\s*=/,'Physical schema must keep its generation marker independent from current release ownership');
const passageSource=fs.readFileSync(new URL('../src/spatial-passage.js',import.meta.url),'utf8');
assert.match(passageSource,/function getPassageProfile\(st,from,to\)/,'Spatial must own the canonical derived PassageProfile query');
assert.match(passageSource,/function traversalFeasibility\(st,agent,from,to\)/,'Spatial must expose multi-mode physical traversal feasibility');
assert.doesNotMatch(passageSource,/bestMode|recommendedMode|relationship|memory|affinity|goalPressure/i,'Passage feasibility must not choose modes or read psychological state');
const routeSource=fs.readFileSync(new URL('../src/spatial-traversal.js',import.meta.url),'utf8');
assert.match(routeSource,/ROUTE_SEMANTICS_VERSION:'11\.24\.0-route-locomotion-cost'/,'Spatial must expose the Route Semantics contract marker');
assert.match(routeSource,/function planRoute\(st,aOrId,goal/,'Spatial must expose canonical planRoute');
assert.match(routeSource,/function traversalCost\(st,aOrId,p\)/,'Spatial must expose standalone traversalCost');
assert.match(routeSource,/function pathDistance\(st,aOrId,p\)/,'Spatial must keep pathDistance distinct from traversalCost');
assert.match(routeSource,/function routeStateKey\(st,node,mode\)/,'current routing must include locomotion mode in route state');
assert.match(routeSource,/function nodeLocomotionAccessible\(st,p,a=null\)/,'Spatial must separate structural locomotion occupancy from walk-only node entry');
assert.match(routeSource,/step\.transitionTicks\+step\.moveTicks/,'travelTime must sum real transition and movement timing');
const spatialValidatorSource=fs.readFileSync(new URL('../src/validation/rules/spatial-node.js',import.meta.url),'utf8');
assert.match(spatialValidatorSource,/SP\.nodeLocomotionAccessible\?\.\(st,node,a\)/,'Spatial validator must validate current occupancy without reusing walk-only node feasibility');
const memoryDeliberationSource=fs.readFileSync(new URL('../src/systems/memory/deliberation.js',import.meta.url),'utf8');
assert.match(memoryDeliberationSource,/accessPenalty/,'target ranking must expose accessPenalty');
assert.match(memoryDeliberationSource,/SP\.planRoute\(st,a,target\.position,\{mode:'auto',objective:'traversalCost'\}\)/,'target ranking must read canonical traversal-cost route facts');
assert.doesNotMatch(memoryDeliberationSource,/distancePenalty/,'current target-ranking decomposition must not retain the stale distancePenalty field');
const memoryDeliberationUiSource=fs.readFileSync(new URL('../src/ui/inspectors/memory-deliberation.js',import.meta.url),'utf8');
assert.match(memoryDeliberationUiSource,/path distance/,'Debug target ranking must show real path distance');
assert.match(memoryDeliberationUiSource,/traversal cost/,'Debug target ranking must show traversal cost');
assert.match(memoryDeliberationUiSource,/travel time/,'Debug target ranking must show travel time');
assert.match(memoryDeliberationUiSource,/access penalty/,'Debug target ranking must show access penalty');
const physicalUiSource=fs.readFileSync(new URL('../src/ui/inspectors/physical.js',import.meta.url),'utf8');
assert.match(physicalUiSource,/registerInspectorDecorator\('physical\.view',decorateInspector,1026\)/,'Physical Debug must use the explicit Inspector lifecycle');
assert.match(physicalUiSource,/MovementEnvelope 由 locomotion mode 即時計算/,'Physical Debug must identify MovementEnvelope as derived truth');
assert.match(physicalUiSource,/posture 與 locomotion mode 是不同語意/,'Physical Debug must preserve posture/locomotion terminology separation');
assert.doesNotMatch(physicalUiSource,/\.physical\s*=/,'Physical UI must remain a read-only projection');

const locomotionSource=fs.readFileSync(new URL('../src/systems/locomotion.js',import.meta.url),'utf8');
assert.match(locomotionSource,/function transitionTicks\(fromMode,toMode\)/,'Locomotion runtime must own posture-transition timing');
assert.match(locomotionSource,/Math\.ceil\(1\/speed\)/,'Locomotion runtime must derive real edge timing from speedFactor');
const locomotionUiSource=fs.readFileSync(new URL('../src/ui/inspectors/locomotion.js',import.meta.url),'utf8');
assert.match(locomotionUiSource,/registerInspectorDecorator\('locomotion\.view',decorateInspector,1027\)/,'Locomotion Debug must use explicit Inspector lifecycle');
assert.match(locomotionUiSource,/speedFactor 已影響實際 edge movement timing/,'Locomotion Debug must state actual timing ownership');
const crowdingSource=fs.readFileSync(new URL('../src/crowding-runtime-v1200.js',import.meta.url),'utf8');
assert.match(crowdingSource,/function getCrowdingProfile\(st,aOrId,from,to,mode='walk'\)/,'Crowding must expose a derived edge profile');
assert.match(crowdingSource,/hardBlocked:false/,'Dynamic Congestion must remain soft in Slice 5');
assert.match(crowdingSource,/directionWeight:Object\.freeze\(\{same:\.65,stationary:1,unknown:1,opposite:1\.7\}\)/,'Crowding direction severity must remain deterministic');
assert.doesNotMatch(crowdingSource,/st\.(?:crowding|congestion)\s*=/,'Crowding runtime must not persist a parallel crowding cache');
const entityUiSource=fs.readFileSync(new URL('../src/ui/entity-readable.js',import.meta.url),'utf8');
assert.match(entityUiSource,/const VERSION=UI\.PRESENTATION_VERSION;/,'Entity Readable View must inherit the canonical Presentation marker from SimUI');
assert.match(entityUiSource,/new Set\(\['container','source','furniture','tile','room','event'\]\)/,'Entity Readable View must explicitly cover all current non-agent Inspector entity types');
assert.match(entityUiSource,/registerInspectorDecorator\('entityReadable\.layer',decorateInspector,1050\)/,'Entity Readable View must use the explicit Inspector decorator lifecycle after the Resident layer');
assert.match(entityUiSource,/selected\?\.type==='agent'/,'Entity Readable View must leave Agent rendering owned by the existing Resident layer');
assert.match(entityUiSource,/slotOccupant/,'Furniture readable projection should use actual occupancy');
assert.match(entityUiSource,/SP\.clonePos\?\.\(cell\)/,'Furniture readable surface projection must preserve non-zero z');
assert.doesNotMatch(entityUiSource,/slotReservedBy/,'Furniture readable projection must not expose slot reservation as player-facing state');
assert.doesNotMatch(entityUiSource,/\.(?:playerContents|readableFurnitureState|entityReadableState)\s*=/,'Entity Readable View must not persist player-facing mirror state');
assert.match(entityUiSource,/UI_ENTITY_READABLE_VERSION=VERSION/,'Entity Readable View must expose the canonical presentation version');

const environmentUiSource=fs.readFileSync(new URL('../src/ui/spatial/environment.js',import.meta.url),'utf8');
assert.match(environmentUiSource,/SP\.clonePos\(cell\)/,'Surface Environment UI must preserve non-zero z when projecting surface cells');

const indexSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(indexSource,/<title>因果湧現模擬器｜Emergent Causal Sim<\/title>/,'browser document title must remain a stable product name without release ownership');
assert.doesNotMatch(indexSource,/<title>[^<]*v\d+\.\d+/,'browser document title must not duplicate the runtime version truth');
assert.match(indexSource,/v11\.27\.0・Furniture Orientation/,'app shell must expose the current short version and feature label');
assert.match(indexSource,/實體檢視 \/ Debug Inspector/,'Inspector panel heading must remain generalized beyond residents');
assert.match(indexSource,/href="editor\.html"/,'app shell must expose a direct World Editor entry point');
assert.match(indexSource,/Physical Profile \/ multi-mode MovementEnvelopes/,'app shell must expose current Physical Debug observability');
assert.match(indexSource,/systems\/relationship\/state\.js/,'app shell must load Relationship state owner');
assert.match(indexSource,/systems\/relationship\/runtime\.js/,'app shell must load Relationship runtime owner');
assert.match(indexSource,/ui\/inspectors\/relationship\.js/,'app shell must load player/debug Relationship projection');
assert.match(indexSource,/systems\/physical\.js/,'app shell must load the Physical semantic owner');
assert.match(indexSource,/spatial-passage\.js/,'app shell must load Passage Profile runtime');
assert.match(indexSource,/validation\/rules\/physical-profile\.js/,'app shell must load Physical validator');
assert.match(indexSource,/ui\/inspectors\/physical\.js/,'app shell must load Physical Debug projection');
assert.match(indexSource,/systems\/locomotion\.js/,'app shell must load the Locomotion semantic owner');
assert.match(indexSource,/crowding-runtime-v1200\.js/,'app shell must load Dynamic Congestion runtime');
assert.match(indexSource,/validation\/rules\/locomotion-execution\.js/,'app shell must load Locomotion validator');
assert.match(indexSource,/ui\/inspectors\/locomotion\.js/,'app shell must load Locomotion Debug projection');
assert.match(indexSource,/ui\/entity-readable\.js/,'app shell must keep the non-agent readable entity layer');
const coreUiSource=fs.readFileSync(new URL('../src/ui/core.js',import.meta.url),'utf8');
assert.match(coreUiSource,/s\.map\.boundaries/,'Simulator map presentation must read canonical runtime boundary truth');
assert.match(coreUiSource,/Object\.values\(s\.doors\|\|\{\}\)/,'Simulator map Door presentation must read root runtime Door truth');
assert.match(coreUiSource,/boundary\.kind!==['"]wall['"]/,'ordinary openings must not be rendered as solid wall edges');

const readmeSource=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');
assert.ok(readmeSource.includes(CURRENT_VERSION),'README current runtime marker must match the canonical version');
assert.match(readmeSource,/Relationship Foundation/,'README must document the long-term dyadic state foundation');
assert.match(readmeSource,/Responder Bias/,'README must retain current Relationship responder influence');
assert.match(readmeSource,/Physical Profile Foundation/,'README must retain the Physical Foundation boundary');
assert.match(readmeSource,/Passage Profile/,'README must retain the multi-mode traversal-feasibility boundary');
assert.match(readmeSource,/Route Semantics Split/,'README must retain the Route Semantics contract');
assert.match(readmeSource,/Locomotion Execution/,'README must retain locomotion execution and posture transitions');
assert.match(readmeSource,/Dynamic Congestion/,'README must document the current Dynamic Congestion contract');
assert.match(readmeSource,/accessPenalty/,'README must document the target access-penalty migration');
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
assert.match(architectureSource,/Physical Profile \+ Passage Profile \/ Multi-mode Feasibility/,'Architecture must define the current Physical / Passage ownership boundary');
assert.match(architectureSource,/MovementEnvelope/,'Architecture must define the derived locomotion geometry boundary');
assert.match(architectureSource,/PassageProfile/,'Architecture must define the derived passage geometry boundary');
assert.match(architectureSource,/traversalFeasibility/,'Architecture must define the physical multi-mode feasibility boundary');
assert.match(architectureSource,/### Route Semantics Split/,'Architecture must define the current Route Semantics ownership boundary');
assert.match(architectureSource,/pathDistance/,'Architecture must define topology distance');
assert.match(architectureSource,/traversalCost/,'Architecture must define objective traversal burden');
assert.match(architectureSource,/travelTime/,'Architecture must define executable travel time');
assert.match(architectureSource,/accessPenalty/,'Architecture must define accessPenalty instead of stale distancePenalty');
assert.match(architectureSource,/### Locomotion Execution \+ Posture Transition/,'Architecture must retain locomotion execution ownership');
assert.match(architectureSource,/### Dynamic Congestion/,'Architecture must define current Dynamic Congestion ownership');
const versioningSource=fs.readFileSync(new URL('../docs/versioning.md',import.meta.url),'utf8');
assert.ok(versioningSource.includes(CURRENT_VERSION),'versioning contract must identify the current runtime marker');
assert.match(versioningSource,/何時必須升版/,'versioning contract must define a mandatory bump boundary');
const explicitInspectorDecoratorFiles=[
  'ui/inspectors/intent.js','ui/inspectors/memory.js','ui/inspectors/appraisal.js','ui/inspectors/affect.js',
  'ui/inspectors/memory-retention.js','ui/inspectors/memory-deliberation.js','ui/inspectors/social-outcomes.js',
  'ui/spatial/environment.js','ui/resident-view.js','ui/inspectors/relationship.js','ui/inspectors/physical.js','ui/inspectors/locomotion.js','ui/entity-readable.js'
];
for(const file of explicitInspectorDecoratorFiles){
  const source=fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
  assert.match(source,/registerInspectorDecorator/,`${file} must use explicit Inspector lifecycle`);
  assert.doesNotMatch(source,/new MutationObserver/,`${file} must not infer Inspector render completion from MutationObserver`);
}
const spatialUiSource=fs.readFileSync(new URL('../src/ui/spatial/observability.js',import.meta.url),'utf8');
assert.match(spatialUiSource,/registerInspectorDecorator\('spatial\.observability'/,'spatial Inspector must use explicit decorator lifecycle');
assert.match(spatialUiSource,/Dynamic Congestion/,'Spatial Debug must expose current next-edge congestion');
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
console.log('v11.20.0 presentation observability + Dynamic Congestion regression: ok');