import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,WA=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,A=globalThis.SimAgentCarry,SC=globalThis.SimSleepConflict;
const authored=WA.cloneAuthoring(WA.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('sleep-agent-carry-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));

function placeSleeping(st,occupant,slotId){
  const slot=SP.getSlot(st,slotId);assert.ok(slot);
  occupant.offMap=false;occupant.position={...slot.position};occupant.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  occupant.action={kind:'sleep',phase:'sleeping',sleepTicks:2,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};
  return slot;
}
function placeRequesterNear(st,requester,slotId){
  const slot=SP.getSlot(st,slotId),approach=SP.slotApproachNodes(st,slot,requester,'walk')[0];assert.ok(approach);
  requester.offMap=false;requester.position={...approach};requester.posture={kind:'standing',slotId:null,furnitureId:null};requester.action=null;requester.activeIntent=null;
}
function conflictFor(st,requester){return SC.selfSleepAssociations(st,requester).find(x=>x.slot.id==='bed:left');}

E.reset(14620);
let st=E.getState(),requester=st.agents.zhen,cat=st.agents.orange,human=st.agents.zhou;
human.offMap=true;placeRequesterNear(st,requester,'bed:left');placeSleeping(st,cat,'bed:left');
let conflict=conflictFor(st,requester);assert.ok(conflict);
const canonical=U.preferenceContributors(st,requester,'sleep',{kind:'slot',id:'bed:left'}).filter(c=>c.direction==='self'&&['assignment','claim','habit'].includes(c.kind)&&c.delta>0);
assert.equal(conflict.strength,Math.min(U.PREFERENCE_CAP,canonical.reduce((sum,c)=>sum+c.delta,0)),'Sleep insistence must derive from Usage-owned canonical contributor deltas');
let evaluation=SC.conflictCandidates(st,requester,conflict),carry=evaluation.candidates.find(x=>x.kind==='carryOccupant');
assert.ok(carry,'observed sleeping Animal with requester-side attemptability should form a carry candidate');
assert.equal(carry.targetAgent,cat.id);
assert.notEqual(carry.target?.id,'bed:left','original conflict Slot must never be the relocation target');
assert.equal(carry.contributors.some(c=>c.key==='sleepingCarryWithoutCooperation'),true,'sleeping carry remains a bounded social-disruption choice rather than free consent');

const proposalSource=String(SC.carryPlacementProposal);
assert.equal(proposalSource.includes('rankSleepTargets'),false,'relocation proposal must not consume occupant-private Usage ranking');
assert.equal(proposalSource.includes('sleepTargets'),false,'relocation proposal must not reuse occupant autonomous sleep planner');
const source=fs.readFileSync(new URL('../src/systems/intent/sleep-conflict.js',import.meta.url),'utf8');
assert.equal(/assignment[^\n]{0,40}\+?=8|claim[^\n]{0,40}\+?=5|habit[^\n]{0,40}\+?=4/.test(source),false,'Sleep conflict must not mirror Usage 8 / 5 / 4 weights');

const originalMass=cat.physical.mass;cat.physical.mass=999;cat.held='hidden-container';
evaluation=SC.conflictCandidates(st,requester,conflict);carry=evaluation.candidates.find(x=>x.kind==='carryOccupant');
assert.ok(carry,'target hidden mass / held state must not silently remove a candidate requester cannot know is infeasible');
const execution=A.canEstablishCarry(st,requester,cat);
assert.equal(execution.ok,false,'selected execution must still use canonical World-truth feasibility');
assert.equal(execution.reason,'mass-capacity-exceeded');
cat.physical.mass=originalMass;cat.held=null;

E.reset(14621);st=E.getState();requester=st.agents.zhen;cat=st.agents.orange;human=st.agents.zhou;human.offMap=true;placeRequesterNear(st,requester,'bed:left');
const occupiedSlot=SP.getSlot(st,'bed:left');cat.position={...occupiedSlot.position};cat.posture={kind:'lying',slotId:occupiedSlot.id,furnitureId:occupiedSlot.furnitureId};cat.action={kind:'rest',phase:'resting',started:st.tick,wait:0};
conflict=conflictFor(st,requester);assert.ok(conflict);
evaluation=SC.conflictCandidates(st,requester,conflict);
assert.equal(evaluation.candidates.some(x=>x.kind==='carryOccupant'),false,'awake/non-sleeping occupant must not enter sleeping carry path without responder-owned cooperation evidence');

E.reset(14622);st=E.getState();requester=st.agents.zhen;cat=st.agents.orange;human=st.agents.zhou;human.offMap=true;placeRequesterNear(st,requester,'bed:left');placeSleeping(st,cat,'bed:left');
for(const slot of SP.allSlots(st))if(slot.id!=='bed:left')slot.canSleep=false;
conflict=conflictFor(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);carry=evaluation.candidates.find(x=>x.kind==='carryOccupant');
assert.ok(carry);
assert.equal(carry.target.kind,'floor','when no bounded sleep-capable Slot proposal remains, sleeping relocation must fall back to a bounded floor target');

console.log('Sleep preferred Slot conflict × sleeping Agent carry integration regression: ok');
