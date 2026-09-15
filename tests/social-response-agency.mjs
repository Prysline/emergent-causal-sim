import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const files=[
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js',
  'engine.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js'
];
for(const file of files)vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId].episodicMemories.find(m=>m.sourceEventId===eventId);
const eventsForOffer=offerId=>E.getState().events.filter(e=>e.data?.responseToBid===offerId||e.data?.petOfferId===offerId);

function armDirectPet(social,seed=11321){
  E.reset(seed);const st=E.getState(),human=st.agents.zhou,cat=st.agents.orange,bystander=st.agents.zhen;
  human.position={x:5,y:5};cat.position={x:5,y:6};bystander.position={x:7,y:5};
  Object.assign(human.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:65});
  Object.assign(cat.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,groomingNeed:20,social});
  human.action={kind:'petCat',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
  E.installActionKind?.(human.action);E.ensureIntentForAction?.(st,human);
  assert.equal(SP.isAtInteraction(st,human,{kind:'agent',id:cat.id},'social'),true,'fixture must begin in social range');
  return st;
}

function latestAction(action){return E.getState().events.find(e=>e.data?.action===action);}

// Response score is deterministic and produces three legible bands from the same cat with only social need changed.
E.reset(11320);let st=E.getState(),cat=st.agents.orange;
cat.needs.social=5;assert.equal(E.petResponseFor(cat),'avoid');
cat.needs.social=45;assert.equal(E.petResponseFor(cat),'tolerate');
cat.needs.social=90;assert.equal(E.petResponseFor(cat),'accept');
const baselineScore=E.petResponseScore(cat),neutralAffect=JSON.parse(JSON.stringify(cat.affect));
cat.affect={valence:-1,activation:1,frustration:1,lastUpdatedTick:0,lastDecayTick:0,source:null};
assert.equal(E.petResponseScore(cat),baselineScore,'v11.13.2a must not let current Affect enter pet response scoring');
cat.affect=neutralAffect;
noIssues('deterministic response bands');

// High social need: human intent becomes an observable petOffer, cat accepts, then and only then petCat succeeds.
st=armDirectPet(90,21321);E.tick();st=E.getState();
assert.equal(st.version,'11.13.2a-social-response-agency');
const acceptOffer=latestAction('petOffer'),acceptResponse=latestAction('acceptPet');
assert.ok(acceptOffer?.data?.socialBid,'high-social case must create observable petOffer');
assert.equal(acceptOffer.data.bidKind,'petOffer');
assert.equal(acceptOffer.data.bidFrom,'zhou');assert.equal(acceptOffer.data.bidTo,'orange');
assert.ok(acceptResponse,'high-social cat should accept in the focused fixture');
assert.equal(acceptResponse.data.responseToBid,acceptOffer.id);
const acceptPet=st.events.find(e=>e.data?.action==='petCat'&&e.data?.petOfferId===acceptOffer.id);
assert.ok(acceptPet,'accept must produce exactly one successful petCat');
assert.equal(acceptPet.data.petResponse,'accept');
assert.equal(eventsForOffer(acceptOffer.id).filter(e=>e.data?.action==='petCat').length,1);
assert.equal(st.agents.zhou.action,null,'initiator action should complete after response');
noIssues('accept flow');

// Mid social need: tolerate is distinct from active acceptance but still permits a weaker successful pet.
st=armDirectPet(45,31321);const preCatSocial=st.agents.orange.needs.social;E.tick();st=E.getState();
const tolerateOffer=latestAction('petOffer'),tolerateResponse=latestAction('toleratePet');
assert.ok(tolerateOffer&&tolerateResponse,'mid-social case should tolerate in the focused fixture');
const toleratePet=st.events.find(e=>e.data?.action==='petCat'&&e.data?.petOfferId===tolerateOffer.id);
assert.ok(toleratePet);assert.equal(toleratePet.data.petResponse,'tolerate');
assert.ok(preCatSocial-st.agents.orange.needs.social<10,'tolerate should give less cat social relief than active acceptance');
noIssues('tolerate flow');

// Low social need: cat visibly avoids the hand, no successful pet occurs, and appraisal/Affect stay Agent-private.
st=armDirectPet(5,41321);const humanBefore={...st.agents.zhou.affect},catBefore={...st.agents.orange.affect};E.tick();st=E.getState();
const avoidOffer=latestAction('petOffer'),avoidResponse=latestAction('avoidPet');
assert.ok(avoidOffer&&avoidResponse,'low-social case should create a stable avoid outcome');
assert.equal(avoidResponse.data.responseToBid,avoidOffer.id);
assert.equal(st.events.some(e=>e.data?.action==='petCat'&&e.data?.petOfferId===avoidOffer.id),false,'avoid must be mutually exclusive with successful petCat');
assert.equal(st.agents.orange.position.x,5);assert.equal(st.agents.orange.position.y,6,'avoid wording must not fake movement');
const humanMemory=memoryFor('zhou',avoidResponse.id),catMemory=memoryFor('orange',avoidResponse.id);
assert.equal(humanMemory?.appraisal?.ruleId,'avoidPet-v1');assert.ok(humanMemory.appraisal.goalCongruence<0,'declined human should form negative audited appraisal');
assert.equal(catMemory?.appraisal?.ruleId,'avoidPet-v1');assert.ok(catMemory.appraisal.goalCongruence>0,'cat avoiding unwanted contact should form positive boundary-congruent appraisal');
assert.ok(st.agents.zhou.affect.valence<humanBefore.valence,'human negative appraisal should lower current valence');
assert.ok(st.agents.zhou.affect.frustration>humanBefore.frustration,'human negative appraisal should raise frustration');
assert.ok(st.agents.orange.affect.valence>catBefore.valence,'cat may get short-lived positive affect from successfully avoiding unwanted contact');
for(const key of ['responseScore','socialNeed','socialTrait','affect','relationship'])assert.equal(Object.prototype.hasOwnProperty.call(avoidResponse.data,key),false,`world event must not leak ${key}`);
noIssues('avoid flow with appraisal/affect');

// Cat response remains independent of Affect even after an actual Affect source exists.
const responseBeforeAffectMutation=E.petResponseFor(st.agents.orange),validSource=JSON.parse(JSON.stringify(st.agents.orange.affect.source));
st.agents.orange.affect={valence:-1,activation:1,frustration:1,lastUpdatedTick:st.tick,lastDecayTick:st.tick,source:validSource};
assert.equal(E.petResponseFor(st.agents.orange),responseBeforeAffectMutation,'Affect-to-response influence belongs to a later deliberation slice');
noIssues('affect remains decision inert');

// Sleeping cats stay on the existing touch-stimulus path rather than receiving a conscious accept/tolerate/avoid response.
E.reset(51321);st=E.getState();
{
  const human=st.agents.zhou,sleepingCat=st.agents.orange,slot=SP.getSlot(st,'sofa:left');
  st.agents.zhen.offMap=true;
  human.position={...slot.position};
  sleepingCat.position={...slot.position};sleepingCat.needs.sleepNeed=100;
  sleepingCat.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  sleepingCat.action={kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};
  E.installActionKind?.(sleepingCat.action);E.ensureIntentForAction?.(st,sleepingCat);
  human.action={kind:'petCat',phase:'interact',targetAgent:sleepingCat.id,started:st.tick,wait:0};
  E.installActionKind?.(human.action);E.ensureIntentForAction?.(st,human);
  E.tick();st=E.getState();
  assert.equal(st.events.some(e=>e.data?.action==='petOffer'),false,'sleeping cat must not receive conscious petOffer response flow');
  assert.ok(st.events.some(e=>e.data?.action==='petCat'),'existing sleeping-cat touch action should still occur');
  assert.ok(st.events.some(e=>e.data?.action==='sleepDisturbance'&&e.data?.target==='orange'),'existing sleep stimulus result should remain observable');
  noIssues('sleeping cat compatibility');
}

// Long-run bounded integration remains validator-clean and never persists private response caches.
E.reset(61321);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const a of Object.values(st.agents)){
    assert.equal(Object.prototype.hasOwnProperty.call(a,'petResponseDecision'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(a,'petResponseScore'),false);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.13.2a social response agency regression: ok');
