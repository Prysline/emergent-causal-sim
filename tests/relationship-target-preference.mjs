import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js','systems/relationship/state.js','systems/physical.js','systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/relationship/runtime.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js','systems/memory/deliberation.js','systems/memory/social-outcome.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js','validation/rules/memory-deliberation.js','validation/rules/social-outcome-memory.js','validation/rules/relationship.js','validation/rules/physical-profile.js','validation/rules/locomotion-execution.js','validation/manifest.js'
];
loadRuntimeProfile(files);

const APP_VERSION='11.24.0-locomotion-traversal-cost';
const RELATIONSHIP_VERSION='11.15.2-relationship-responder-bias';
const E=globalThis.SimEngine,W=globalThis.SimWorld,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const clone=x=>structuredClone(x);
const near=(actual,expected,eps=.001,msg='')=>assert.ok(Math.abs(actual-expected)<=eps,`${msg} expected ${expected}, got ${actual}`);
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
function calm(a,{social=70}={}){Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:8,social});a.action=null;a.activeIntent=null;a.offMap=false;a.episodicMemories=[];a.relationships={};}

E.reset(11510);let st=E.getState();
assert.equal(st.version,APP_VERSION);
assert.equal(W.RELATIONSHIP_SCHEMA_VERSION,RELATIONSHIP_VERSION);
assert.equal(W.RELATIONSHIP_TARGET_CAP,8);
assert.equal(E.RELATIONSHIP_TARGET_CAP,8);
assert.equal(E.INTENT_BY_ACTION.petAnimal,'interactWithAnimal');
assert.equal(Object.prototype.hasOwnProperty.call(E.INTENT_BY_ACTION,'petCat'),false,'removed cat-specific action must not remain as a canonical alias');
assert.equal(E.intentKindForAction('petAnimal'),'interactWithAnimal');
noIssues('reset');

// Pure Relationship target delta: familiarity is a confidence/history gate, affinity provides direction.
const zhen=st.agents.zhen,zhou=st.agents.zhou;
calm(zhen);calm(zhou);
assert.equal(E.relationshipTargetDelta(zhen,'zhou'),0);
zhen.relationships.zhou={familiarity:0,affinity:.8,lastUpdatedTick:0};
assert.equal(E.relationshipTargetDelta(zhen,'zhou'),0);
zhen.relationships.zhou={familiarity:.9,affinity:0,lastUpdatedTick:0};
assert.equal(E.relationshipTargetDelta(zhen,'zhou'),0);
zhen.relationships.zhou={familiarity:.8,affinity:.5,lastUpdatedTick:0};
near(E.relationshipTargetDelta(zhen,'zhou'),3.2);
zhen.relationships.zhou={familiarity:.8,affinity:-.5,lastUpdatedTick:0};
near(E.relationshipTargetDelta(zhen,'zhou'),-3.2);
zhen.relationships.zhou={familiarity:99,affinity:99,lastUpdatedTick:0};
assert.equal(E.relationshipTargetDelta(zhen,'zhou'),8,'derived target preference must remain bounded even before validator enforcement');

// Counterfactual: Relationship changes targetPreference exactly, but not social action finalUtility.
E.reset(11511);st=E.getState();const actor=st.agents.zhen,target=st.agents.zhou;calm(actor);calm(target);
actor.position={x:5,y:5};target.position={x:5,y:6};
const base=E.baseUtilityForAction(actor,'talk');
const neutral=E.targetEvaluation(st,actor,target,'socialize',base);
actor.relationships.zhou={familiarity:.8,affinity:.5,lastUpdatedTick:st.tick};
const positive=E.targetEvaluation(st,actor,target,'socialize',base);
near(positive.relationshipTargetDelta,3.2);
near(positive.targetPreference-neutral.targetPreference,3.2);
assert.equal(positive.finalUtility,neutral.finalUtility,'Relationship target preference must not increase the action-level utility');
assert.equal(positive.memoryUtilityDelta,neutral.memoryUtilityDelta,'Relationship must not mutate Memory influence');

// Spatially identical targets: Relationship is the only changed cause and may reorder who is chosen without changing action utility.
const mei=clone(target);mei.id='mei';mei.name='阿梅';mei.position={...target.position};mei.action=null;mei.activeIntent=null;mei.relationships={};mei.episodicMemories=[];st.agents.mei=mei;
actor.relationships={mei:{familiarity:.8,affinity:.5,lastUpdatedTick:st.tick}};
const ranked=E.targetEvaluations(st,actor,'socialize',base);
const meiEval=ranked.find(e=>e.targetAgent==='mei'),zhouEval=ranked.find(e=>e.targetAgent==='zhou');
assert.ok(meiEval&&zhouEval,'both counterfactual targets must remain eligible');
assert.equal(meiEval.pathDistance,zhouEval.pathDistance,'counterfactual target distances must be identical');
assert.equal(ranked[0].targetAgent,'mei','positive long-term Relationship should win an otherwise equivalent target ranking');
assert.ok(ranked.every(e=>e.memoryUtilityDelta===0),'Relationship-only fixture must contain no Memory utility contribution');
assert.ok(ranked.every(e=>e.finalUtility===neutral.finalUtility),'Relationship-only fixture must leave action utility unchanged for every target');
delete st.agents.mei;

// Negative Relationship is a preference penalty, not a hard ban.
actor.relationships={zhou:{familiarity:.9,affinity:-.6,lastUpdatedTick:st.tick}};
const negativeList=E.targetEvaluations(st,actor,'socialize',base);
assert.ok(negativeList.some(e=>e.targetAgent==='zhou'),'negative Relationship must not remove an otherwise legal social target');
near(negativeList.find(e=>e.targetAgent==='zhou').relationshipTargetDelta,-4.32);

// Recent Memory and slow Relationship coexist additively in target ranking; Memory still owns finalUtility.
actor.episodicMemories=[{
  id:'memory:zhen:test-negative',kind:'episodic',episodeKind:'observedWorldEvent',sourceEventId:'test-negative',observedTick:st.tick,lastObservedTick:st.tick,
  observed:{actorId:'zhou',targetId:'zhen',action:'declineTalk'},
  appraisal:{appraisedTick:st.tick,ruleId:'fixture',relevance:1,goalCongruence:-1,agency:{kind:'other',agentId:'zhou'},factors:[]}
}];
actor.relationships.zhou={familiarity:.8,affinity:.5,lastUpdatedTick:st.tick};
const coexist=E.targetEvaluation(st,actor,target,'socialize',base);
assert.ok(coexist.memoryUtilityDelta<0);
near(coexist.relationshipTargetDelta,3.2);
near(coexist.targetPreference,coexist.memoryUtilityDelta+coexist.relationshipTargetDelta-coexist.accessPenalty);
near(coexist.finalUtility,base+coexist.memoryUtilityDelta);

// Generic animal affordance: current cat works, a future pettable species works, and an explicit no-pet profile is excluded.
E.reset(11512);st=E.getState();const human=st.agents.zhen,cat=st.agents.orange;calm(human);calm(cat);human.position={x:5,y:5};cat.position={x:5,y:6};
assert.equal(E.isAnimalAgent(cat),true);
assert.equal(E.canPetAnimal(human,cat),true);
assert.equal(E.buildAction(human,{id:'petAnimal',targetAgent:'orange'})?.kind,'petAnimal');
W.SPECIES_PROFILES.dog={...clone(W.SPECIES_PROFILES.cat),socialClass:'animal',interactionAffordances:{pet:true}};
W.SPECIES_PROFILES.turtle={...clone(W.SPECIES_PROFILES.cat),socialClass:'animal',interactionAffordances:{pet:false}};
const dog=clone(cat);dog.id='dog';dog.name='小狗';dog.kind='dog';dog.position={...cat.position};dog.relationships={};dog.episodicMemories=[];
const turtle=clone(cat);turtle.id='turtle';turtle.name='陸龜';turtle.kind='turtle';turtle.position={...cat.position};turtle.relationships={};turtle.episodicMemories=[];
st.agents.dog=dog;st.agents.turtle=turtle;
assert.equal(E.isAnimalAgent(dog),true);
assert.equal(E.canPetAnimal(human,dog),true,'pet feasibility must not be hardcoded to cat');
assert.equal(E.canPetAnimal(human,turtle),false,'species affordance may explicitly disable petting without creating a new Action kind');
assert.ok(Number.isFinite(SP.pathDistance(st,human,dog.position)),'future animal fixture must be spatially reachable before target-ranking eligibility is tested');
const animalTargets=E.targetEvaluations(st,human,'interactWithAnimal',E.baseUtilityForAction(human,'petAnimal')).map(e=>e.targetAgent);
assert.ok(animalTargets.includes('orange'));
assert.ok(animalTargets.includes('dog'));
assert.ok(!animalTargets.includes('turtle'));
delete st.agents.dog;delete st.agents.turtle;delete W.SPECIES_PROFILES.dog;delete W.SPECIES_PROFILES.turtle;

// v11.15.1 target-preference boundary remains intact in v11.15.2: base/no-counterpart responder helpers do not feed back into target ranking.
// Explicit responder→requester Relationship influence is tested separately in relationship-responder-bias.mjs.
E.reset(11513);st=E.getState();const requester=st.agents.zhen,responder=st.agents.zhou,animal=st.agents.orange;calm(requester);calm(responder);calm(animal);
const talkBefore=E.talkEngagementScore(responder),petBefore=E.petResponseScore(animal);
responder.relationships.zhen={familiarity:1,affinity:1,lastUpdatedTick:st.tick};
animal.relationships.zhen={familiarity:1,affinity:-1,lastUpdatedTick:st.tick};
assert.equal(E.talkEngagementScore(responder),talkBefore,'no-counterpart Human base helper remains neutral');
assert.equal(E.petResponseScore(animal),petBefore,'no-counterpart animal base helper remains neutral');
noIssues('target preference boundary remains isolated');

console.log('v11.15.1 relationship target preference regression remains valid under v11.20.0');
