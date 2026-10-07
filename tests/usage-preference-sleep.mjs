import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage;

assert.equal(A.VERSION,'world-authoring-v11');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.MEMORY_SCHEMA_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.48.1-sleep-perception-approach');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
authored.claimEligibility=[{id:'sleep-right-claimable',activity:'sleep',target:{kind:'slot',id:'bed:right'}}];
assert.equal(A.validateAuthoring(authored).ok,true);

const duplicate=A.cloneAuthoring(authored);
duplicate.usageAssignments.push({...duplicate.usageAssignments[0],id:'duplicate-assignment'});
assert.ok(A.validateAuthoring(duplicate).errors.some(x=>x.code==='authoring_usage_assignment_duplicate'),'exact duplicate assignment must be rejected');
const missing=A.cloneAuthoring(authored);
missing.claimEligibility=[{id:'missing-slot',activity:'sleep',target:{kind:'slot',id:'missing:slot'}}];
assert.ok(A.validateAuthoring(missing).errors.some(x=>x.code==='authoring_usage_target_missing'),'claim eligibility must reject missing Slot references');

let st=W.createInitialStateFromAuthoring(authored,4040),a=st.agents.zhen,b=st.agents.zhou;
const target=(id,score)=>{const slot=SP.getSlot(st,id);return {kind:'slot',id,position:{...slot.position},slotPosition:{...slot.position},quality:1,posture:'lying',score};};
let ranked=U.rankSleepTargets(st,a,[target('bed:left',7),target('bed:right',2)]);
assert.equal(ranked[0].id,'bed:left','assignment should beat a small objective disadvantage');
assert.ok(ranked[0].preferenceDelta>0);
ranked=U.rankSleepTargets(st,a,[target('bed:left',30),target('bed:right',0)]);
assert.equal(ranked[0].id,'bed:right','bounded preference must not beat a huge objective disadvantage');
ranked=U.rankSleepTargets(st,a,[target('bed:right',4),target('bed:left',4)]);
assert.equal(ranked[0].id,'bed:left','stable canonical target identity must settle a full tie deterministically');

const left=SP.getSlot(st,'bed:left');
b.position={...left.position};b.posture={kind:'lying',slotId:left.id,furnitureId:left.furnitureId};
assert.equal(SP.sleepTargets(st,a).some(x=>x.id==='bed:left'),false,'occupied assigned bed must stay physically unavailable');
assert.ok(U.associationReasons(st,a,'sleep',{kind:'slot',id:'bed:left'}).some(x=>x.key==='assignedToSelf'),'association reason must remain queryable after occupancy removes the legal candidate');
b.posture={kind:'standing',slotId:null,furnitureId:null};

const claimAuth=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
claimAuth.claimEligibility=[{id:'left-claimable',activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('usage-claim-fixture',seed=>W.createInitialStateFromAuthoring(claimAuth,seed));
E.reset(4041);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;
assert.equal(U.agentClaimDecision(st,a,'sleep',{kind:'slot',id:'bed:right'}).reason,'worldIneligible','missing World eligibility must default to not claimable');
assert.equal(U.acquireUsageClaimForSuccessfulUse(st,a,'sleep',{kind:'slot',id:'bed:left'},{successfulUse:false}),null,'claim acquisition must require successful use');
const claim=U.acquireUsageClaimForSuccessfulUse(st,a,'sleep',{kind:'slot',id:'bed:left'},{successfulUse:true,sourceEventId:'e-proof'});
assert.ok(claim,'eligible successful use should create a World claim');
assert.equal(U.acquireUsageClaimForSuccessfulUse(st,b,'sleep',{kind:'slot',id:'bed:left'},{successfulUse:true}),null,'one Slot cannot gain a second primary claimant');
a.offMap=true;
assert.equal(U.activeClaims(st,'sleep').length,1,'temporary offMap must not release a Runtime Claim');

E.reset(4042);st=E.getState();a=st.agents.zhen;
const sleepUtilityBefore=E.baseUtilityForAction(a,'sleep');
st.usageAssignments.push({id:'extra-right',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:right'}});
assert.equal(E.baseUtilityForAction(a,'sleep'),sleepUtilityBefore,'target preference must not feed back into action-level sleep utility');
st.usageAssignments.pop();
assert.equal(E.usageHabit(st,a,'sleep',{kind:'slot',id:'bed:left'}),null);
const ev1=E.addEvent('usage proof','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(a.position)});
const h1=E.usageHabit(st,a,'sleep',{kind:'slot',id:'bed:left'});
assert.ok(h1?.strength>0,'actor sleep-start memory must consolidate a private Usage Habit');
assert.equal(h1.lastSourceMemoryId,`memory:zhen:${ev1}`);
const usageMemory=a.episodicMemories.find(m=>m.sourceEventId===ev1);
assert.equal(usageMemory?.observed?.slotId,'bed:left','sleep usage memory must retain the observed Slot identity');
assert.equal(usageMemory?.observed?.furnitureId,'bed','sleep usage memory must retain the observed Furniture identity');
E.addEvent('usage proof 2','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(a.position)});
const h2=E.usageHabit(st,a,'sleep',{kind:'slot',id:'bed:left'});
assert.ok(h2.strength>h1.strength&&h2.strength<1,'repeated use must strengthen habit with saturation headroom');
const fresh=h2.effectiveStrength;st.tick+=E.USAGE_HABIT_HALF_LIFE.sleep;
assert.ok(E.effectiveUsageHabitStrength(st,a,'sleep',{kind:'slot',id:'bed:left'})<fresh,'Usage Habit must decay lazily over time');

st=E.getState();a=st.agents.zhen;
a.activeIntent={id:'intent:zhen:proof:sleep',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test',tick:st.tick}};
a.action=E.buildAction(a,{id:'sleep'});a.action.intentId=a.activeIntent.id;
E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:[]});
const td1=E.captureTargetSelectionEvidence(st,a,a.action,{activity:'sleep',selectedTarget:{kind:'slot',id:'bed:left'},objectiveScore:4,preferenceDelta:2,effectiveScore:2,contributors:[{kind:'assignment'}]});
const td2=E.captureTargetSelectionEvidence(st,a,a.action,{activity:'sleep',selectedTarget:{kind:'slot',id:'bed:right'},objectiveScore:3,preferenceDelta:1,effectiveScore:2,contributors:[],priorTargetDecisionId:td1.id});
assert.equal(td2.parentDecisionId,a.action.decisionId);
assert.equal(td2.priorTargetDecisionId,td1.id);
assert.equal(td1.selectedTarget.id,'bed:left','reselection must not rewrite the prior target evidence snapshot');
assert.equal(E.currentTargetSelectionEvidence(a).id,td2.id);

const pet={id:'petProof',kind:'pet-bed',name:'大型寵物床',slots:[{id:'petProof:bed',furnitureId:'petProof',canSleep:true,canRest:true,position:{x:2,y:2},usableSpace:{width:1,length:2},sleepQuality:.8,restQuality:.5,approachEdges:['north','east','south','west']}]};
st.furniture.petProof=pet;
const petSlot=SP.getSlot(st,'petProof:bed');
assert.equal(SP.slotPoseFits(petSlot,a,'lying'),true,'fixture pet bed must be physically valid for Human');
const petEval=U.evaluateSleepTarget(st,a,{kind:'slot',id:'petProof:bed',position:{x:2,y:1},slotPosition:{x:2,y:2},quality:.8,posture:'lying',score:0});
assert.ok(petEval.preferenceContributors.some(x=>x.kind==='speciesActivity'&&x.delta<0),'Human pet-bed preference must be a negative soft contributor');
assert.ok(Number.isFinite(petEval.effectiveScore),'species preference must not turn a physically valid target into impossible');

console.log('Usage preference sleep regression: ok');
