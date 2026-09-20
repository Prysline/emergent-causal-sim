import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','memory-retention-schema-v1133.js','memory-deliberation-schema-v1134.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','affect-runtime-v1132.js','systems/social/animal-response.js','memory-retention-runtime-v1133.js','systems/social/human-response.js','memory-deliberation-runtime-v1134.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const source=file=>fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');

// Architecture guard: core initial deliberation has one construction switch and every extension caller delegates to E.buildAction.
const engineSource=source('engine.js');
assert.match(engineSource,/function startAction\(a,choice\)\{a\.action=buildAction\(a,choice\)/,'core startAction must delegate to the canonical builder');
assert.equal((engineSource.match(/switch\(choice\.id\)/g)||[]).length,1,'engine should contain one choice→Action construction switch');
const replanSource=source('systems/intent/replanning.js');
const softSource=source('systems/intent/deliberation.js');
const memorySource=source('memory-deliberation-runtime-v1134.js');
assert.match(replanSource,/return E\.buildAction\(a,choice\)/,'hard replan must delegate construction to core');
assert.doesNotMatch(replanSource,/switch\(actionKindValue\)/,'hard replan must not keep a parallel Action construction switch');
assert.match(softSource,/return E\.buildAction\(a,choice\)/,'soft reconsideration must delegate construction to core');
assert.doesNotMatch(softSource,/switch\(c\.actionKind\)/,'soft reconsideration must not keep a parallel Action construction switch');
assert.match(memorySource,/E\.buildAction\?\.\(a,pick\)/,'Memory→Deliberation correction must delegate construction to core');
assert.doesNotMatch(memorySource,/function buildCoreAction/,'Memory→Deliberation must not keep its old parallel builder');

E.reset(20260911);
let st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
assert.equal(typeof E.buildAction,'function','canonical Action builder must be exported');
noIssues('reset');

// Factory responsibility: build an Action shape only. It must not bind an Intent, mutate the Agent, or emit a plan event.
const beforeEvents=st.events.length,beforeAction=human.action,beforeIntent=human.activeIntent;
const eat=E.buildAction(human,{id:'eat'});
assert.equal(E.actionKind(eat),'eat');
assert.equal(eat.phase,'prepare');
assert.equal(Object.prototype.hasOwnProperty.call(eat,'intentId'),false,'pure construction must not invent Intent linkage');
assert.equal(human.action,beforeAction,'factory must not assign Agent.action');
assert.equal(human.activeIntent,beforeIntent,'factory must not create or switch Active Intent');
assert.equal(st.events.length,beforeEvents,'factory must not emit plan/response events');
assert.equal(Object.prototype.hasOwnProperty.call(eat,'intent'),false,'constructed Action must use canonical kind directly');

// Explicit target semantics: an explicit target is preserved; if it is invalid, do not silently fall back to another target.
const fallbackTalk=E.buildAction(human,{id:'talk'});
assert.ok(fallbackTalk?.targetAgent,'talk without explicit target may use its legacy nearest-awake fallback');
const explicitTalk=E.buildAction(human,{id:'talk',targetAgent:fallbackTalk.targetAgent});
assert.equal(explicitTalk?.targetAgent,fallbackTalk.targetAgent);
assert.equal(E.buildAction(human,{id:'talk',targetAgent:'missing-agent'}),null,'invalid explicit target must not silently retarget to nearest human');
const explicitTile={x:1,y:1};
assert.deepEqual(E.buildAction(human,{id:'cleanFloor',targetTile:explicitTile})?.targetTile,explicitTile,'explicit targetTile must survive construction');
assert.deepEqual(E.buildAction(human,{id:'wander',targetTile:explicitTile})?.targetTile,explicitTile,'explicit wander target must survive construction');
const explicitUpperTile={x:1,y:1,z:1};
assert.deepEqual(E.buildAction(human,{id:'cleanFloor',targetTile:explicitUpperTile})?.targetTile,explicitUpperTile,'cleanFloor construction must preserve non-zero target z');
assert.deepEqual(E.buildAction(human,{id:'wander',targetTile:explicitUpperTile})?.targetTile,explicitUpperTile,'wander construction must preserve non-zero target z');
st.containers.cupB.contents.water=Math.max(8,st.containers.cupB.contents.water||0);
assert.equal(E.buildAction(cat,{id:'drinkWater',targetObject:'cupB'})?.targetObject,'cupB','explicit drink targetObject must survive construction');

// Logistics fields also use the same factory rather than a separate core-only schema.
const restockChoice={id:'restockContainer',job:{destinationId:'mealTray',sourceId:'foodPantry',sourceKind:'object',resource:'food',strategy:'logisticsContainer',carrierId:'carryBasket'}};
const restock=E.buildAction(human,restockChoice);
assert.equal(E.actionKind(restock),'restockContainer');
assert.equal(restock.destinationId,restockChoice.job.destinationId);
assert.equal(restock.sourceId,restockChoice.job.sourceId);
assert.equal(restock.resource,'food');
assert.equal(restock.strategy,'logisticsContainer');
assert.equal(restock.carrierId,'carryBasket');
noIssues('direct factory contract');

// Spy the exported factory so the focused regression proves the three extension callers really share it.
const canonicalBuild=E.buildAction;
const buildCalls=[];
E.buildAction=(agent,choice)=>{buildCalls.push({agentId:agent?.id||null,choice:structuredClone(choice)});return canonicalBuild(agent,choice);};

// Hard replan: an open social Intent plans through E.buildAction and then binds the existing Intent id.
E.reset(11230);st=E.getState();human=st.agents.zhen;
human.needs.social=80;human.action=null;human.activeIntent={id:'intent:zhen:0:socialize:factory-test',kind:'socialize',createdTick:0,lifecycle:'open',source:{type:'test'}};
let before=buildCalls.length;
assert.equal(E.planOpenIntent(st,human),true,'hard replan should find a concrete Action');
assert.equal(buildCalls.length,before+1,'hard replan should call the canonical exported factory exactly once');
assert.equal(buildCalls.at(-1).choice.id,'talk');
assert.equal(human.action?.kind,'talk');
assert.equal(human.action?.intentId,human.activeIntent?.id,'Intent binding remains the replan layer responsibility');
noIssues('hard replan factory caller');

// Soft reconsideration: candidate/utility policy stays local, but concrete Action construction goes through E.buildAction.
E.reset(11240);st=E.getState();st.tick=2;human=st.agents.zhen;
Object.assign(human.needs,{hunger:80,thirst:0,fatigue:0,sleepNeed:0,social:0});
human.action={kind:'wander',phase:'move',started:0,wait:0,targetTile:{x:2,y:6},oneShot:true};
human.activeIntent={id:'intent:zhen:0:explore:factory-test',kind:'explore',createdTick:0,lifecycle:'actionBound',source:{type:'test'}};human.action.intentId=human.activeIntent.id;
before=buildCalls.length;
assert.equal(E.applySoftReconsideration(st,human),true,'strong hunger should soft-switch from wander to eat');
assert.equal(buildCalls.length,before+1,'soft reconsideration should call the canonical exported factory exactly once');
assert.equal(buildCalls.at(-1).choice.id,'eat');
assert.equal(human.action?.kind,'eat');
assert.equal(human.action?.intentId,human.activeIntent?.id,'soft layer still owns new Intent binding');
noIssues('soft reconsideration factory caller');

// Memory→Deliberation correction: target-aware option correction replaces the core Action through the same factory.
E.reset(11340);st=E.getState();st.tick=10;human=st.agents.zhen;
human.action=canonicalBuild(human,{id:'wander',targetTile:{x:2,y:6}});human.activeIntent=null;
st.thoughts[human.id]={tick:st.tick,options:[{id:'wander',score:1,why:['test']},{id:'talk',score:100,why:['test']}],pick:{id:'wander',score:1,why:['test']}};
before=buildCalls.length;
E.adjustInitialDeliberation(st,[human.id]);
assert.equal(buildCalls.length,before+1,'Memory→Deliberation correction should call the canonical exported factory exactly once');
assert.equal(buildCalls.at(-1).choice.id,'talk');
assert.equal(human.action?.kind,'talk');
assert.ok(human.action?.targetAgent,'corrected social Action should retain the selected target');
assert.equal(human.action?.intentId,human.activeIntent?.id,'Intent foundation binds the replacement after pure construction');
noIssues('memory correction factory caller');

E.buildAction=canonicalBuild;
console.log('canonical Action construction regression: ok');
