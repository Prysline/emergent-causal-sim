import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage;

assert.equal(A.VERSION,'world-authoring-v11');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.MEMORY_SCHEMA_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.47.0-social-bid-carry-cooperation');

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

E.reset(11420);
let st=E.getState(),zhen=st.agents.zhen,zhou=st.agents.zhou,orange=st.agents.orange;
assert.equal(st.usagePreferenceVersion,'11.42.0-usage-preference-sleep');
assert.deepEqual(st.usageAssignments,authored.usageAssignments);
assert.deepEqual(st.claimEligibility,authored.claimEligibility);
assert.deepEqual(st.usageClaims,[]);
assert.deepEqual(st.usageHabits,[]);
assert.deepEqual(st.usageAssociationEvidence,[]);

assert.deepEqual(U.assignmentsFor(st,{kind:'agent',id:'zhen'},'sleep'),authored.usageAssignments);
assert.deepEqual(U.assignmentsFor(st,{kind:'agent',id:'zhou'},'sleep'),[]);
assert.deepEqual(U.claimsFor(st,{kind:'agent',id:'zhen'},'sleep'),[]);
assert.deepEqual(U.habitsFor(st,{kind:'agent',id:'zhen'},'sleep'),[]);
assert.equal(U.hasClaimEligibility(st,'sleep',{kind:'slot',id:'bed:right'}),true);
assert.equal(U.hasClaimEligibility(st,'sleep',{kind:'slot',id:'bed:left'}),false);

const left=U.resolveUsageTarget(st,{kind:'slot',id:'bed:left'}),right=U.resolveUsageTarget(st,{kind:'slot',id:'bed:right'});
assert.equal(left.kind,'slot');assert.equal(left.furnitureId,'bed');assert.equal(left.slotId,'bed:left');
assert.equal(right.kind,'slot');assert.equal(right.furnitureId,'bed');assert.equal(right.slotId,'bed:right');
assert.equal(U.resolveUsageTarget(st,{kind:'slot',id:'missing:slot'}),null);

let scored=U.scoreUsageTarget(st,zhen,'sleep',left,10);
assert.equal(scored.baseScore,10);
assert.equal(scored.preferenceDelta,18);
assert.equal(scored.score,28);
assert.ok(scored.contributors.some(c=>c.kind==='assignment'&&c.delta===18));
scored=U.scoreUsageTarget(st,zhou,'sleep',left,10);
assert.equal(scored.preferenceDelta,0);
assert.equal(scored.score,10);

st.usageClaims.push({id:'claim:zhen:right',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:right'},createdTick:st.tick});
st.usageHabits.push({id:'habit:zhen:left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'},strength:.5,lastReinforcedTick:st.tick});
assert.equal(U.claimsFor(st,{kind:'agent',id:'zhen'},'sleep').length,1);
assert.equal(U.habitsFor(st,{kind:'agent',id:'zhen'},'sleep').length,1);
assert.equal(U.scoreUsageTarget(st,zhen,'sleep',right,0).preferenceDelta,14);
assert.equal(U.scoreUsageTarget(st,zhen,'sleep',left,0).preferenceDelta,23);

const beforeEvidence=st.usageAssociationEvidence.length;
U.recordUsageAssociationEvidence(st,zhen,'sleep',left,{sourceEventId:'event:test:left'});
assert.equal(st.usageAssociationEvidence.length,beforeEvidence+1);
assert.equal(st.usageAssociationEvidence.at(-1).principal.id,'zhen');
assert.equal(st.usageAssociationEvidence.at(-1).target.id,'bed:left');
assert.equal(st.usageAssociationEvidence.at(-1).sourceEventId,'event:test:left');

for(const a of Object.values(st.agents)){a.needs.hunger=0;a.needs.thirst=0;a.needs.fatigue=0;a.needs.sleepNeed=0;a.needs.social=0;}
zhen.needs.sleepNeed=90;zhen.action=null;zhen.activeIntent=null;zhen.posture='standing';zhen.surface='floor';zhen.slotId=null;zhen.supportObject=null;
zhou.offMap=true;orange.offMap=true;
const candidates=E.candidateIntents(st,zhen).filter(c=>c.intentKind==='sleep');
assert.ok(candidates.length>0);
const leftCandidate=candidates.find(c=>c.targetSlot==='bed:left'),rightCandidate=candidates.find(c=>c.targetSlot==='bed:right');
assert.ok(leftCandidate);assert.ok(rightCandidate);
assert.ok(leftCandidate.utility>rightCandidate.utility,'authored assignment + habit must bias the assigned sleep Slot above a merely claimable alternative');
assert.ok(leftCandidate.contributors.some(c=>c.kind==='assignment'&&c.key==='usagePreference'));
assert.ok(leftCandidate.contributors.some(c=>c.kind==='habit'&&c.key==='usagePreference'));
assert.ok(rightCandidate.contributors.some(c=>c.kind==='claim'&&c.key==='usagePreference'));

const issue=U.validateUsagePreferenceState(st);
assert.equal(issue.length,0);
st.usageClaims.push({...st.usageClaims[0],id:'claim:duplicate'});
assert.ok(U.validateUsagePreferenceState(st).some(x=>x.code==='usage_claim_duplicate'));
st.usageClaims.pop();

console.log('Usage preference sleep regression: ok');
