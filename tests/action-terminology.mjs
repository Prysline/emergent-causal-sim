import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','action-schema-v1120.js','engine.js','runtime-hook-pipeline.js','engine-spatial-surface-environment.js','action-runtime-v1120.js','state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

E.reset(20260911);
let st=E.getState();
assert.equal(st.version,'11.22.0-spatial-z-identity');
assert.equal(E.VERSION,'11.22.0-spatial-z-identity');
assert.equal(E.ACTION_SCHEMA_VERSION,'11.12.0-action-terminology');
noIssues('reset');

// Engine-created actions persist canonical kind only. No compatibility alias is installed.
for(let i=0;i<20&&!Object.values(st.agents).some(a=>a.action);i++)E.tick();
const active=Object.values(st.agents).find(a=>a.action);
assert.ok(active?.action,'simulation should create an action');
assert.ok(active.action.kind,'action must persist canonical kind');
assert.equal(Object.prototype.hasOwnProperty.call(active.action,'intent'),false,'Action must not expose legacy intent property');
assert.ok(Object.keys(active.action).includes('kind'),'kind must be part of persistent action state');
assert.ok(!JSON.stringify(active.action).includes('"intent"'),'serialized action must not store legacy intent');
assert.equal(E.actionKind(active.action),active.action.kind,'actionKind accessor reads canonical kind only');
noIssues('engine-created action');

// Legacy injected Action is invalid rather than migrated; there is no save/session migration contract.
E.reset(20260911);
st=E.getState();
const legacy=st.agents.orange;
legacy.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:{x:3,y:6}};
assert.equal(E.actionKind(legacy.action),null,'actionKind must not fall back to removed intent terminology');
let validation=V.validateState(st);
assert.ok(validation.issues.some(x=>x.code==='action_kind_missing'),'legacy-only action must fail missing-kind validation');
assert.ok(validation.issues.some(x=>x.code==='legacy_action_intent_present'),'legacy intent property must be rejected, not migrated');
legacy.action=null;
noIssues('legacy state removed');

// Canonical kind directly drives core sleep and labels without an alias layer.
E.reset(20260911);
st=E.getState();
const sleeper=st.agents.zhen,slot=SP.getSlot(st,'bed:left');
sleeper.position={...slot.position};
sleeper.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
sleeper.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:3,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}}};
assert.equal(E.isSleeping(sleeper),true,'canonical kind should directly drive sleep helper');
assert.ok(E.actionLabel(sleeper).startsWith('睡眠'),'actionLabel should directly read canonical kind');
assert.equal(Object.prototype.hasOwnProperty.call(sleeper.action,'intent'),false);
noIssues('canonical helper');

// Abort metadata uses actionKind directly; no runtime event normalization is required.
E.reset(20260911);
st=E.getState();
const actor=st.agents.zhen;
actor.action={kind:'talk',phase:'move',started:st.tick,wait:0,targetAgent:'missing-agent'};
E.tick();
const abort=st.events.find(e=>e.data?.action==='abort');
assert.ok(abort,'invalid target should produce an abort event');
assert.equal(abort.data.actionKind,'talk');
assert.equal(Object.prototype.hasOwnProperty.call(abort.data,'intent'),false,'abort event should use actionKind rather than overloaded intent');
noIssues('event terminology');

// Long-run state remains valid and every live action stays canonicalized.
E.reset(77);
for(let i=0;i<500;i++){
  E.tick();
  for(const a of Object.values(E.getState().agents))if(a.action){
    assert.ok(a.action.kind,`${a.name} live action missing kind at tick ${E.getState().tick}`);
    assert.equal(Object.prototype.hasOwnProperty.call(a.action,'intent'),false,`${a.name} live action exposed legacy intent at tick ${E.getState().tick}`);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.12.0 canonical action.kind terminology regression: ok');
