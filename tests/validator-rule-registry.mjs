import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const EXPECTED=[
  ['physical.profile',90],['locomotion.execution',95],['spatial.node',100],['spatial.environment',200],['action.canonical-type',300],['intent.active',400],['social-bid',500],
  ['interruption',600],['deliberation',700],['memory.episodic',800],['appraisal',900],['affect',1000],
  ['social-response',1100],['memory-retention',1200],['human-social-response',1300],['memory-deliberation',1400],['social-outcome-memory',1500],
  ['relationship',1600]
];
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script src="(src\/[^"]+\.js)" defer><\/script>/g)].map(m=>m[1]);
const manifestIndex=scripts.indexOf('src/state-validator-manifest.js');
assert.ok(manifestIndex>0,'production index must load a validator manifest');
assert.ok(manifestIndex<scripts.findIndex(p=>p==='src/ui.js'),'validator registry must finalize before UI starts');
for(const rel of scripts.slice(0,manifestIndex)){
  vm.runInThisContext(fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8'),{filename:rel});
}
const V=globalThis.SimValidator,E=globalThis.SimEngine;
assert.deepEqual(V.listValidationLayers(),EXPECTED.map(([id,order])=>({id,order})),'production validator layers must have explicit stable ownership/order');
assert.equal(V.isValidationRegistryFinalized(),false);

// Duplicate ownership must fail before finalization rather than silently replace an invariant layer.
assert.throws(()=>V.registerValidationLayer('spatial.node',()=>({issues:[]}),1700),/Duplicate validator layer id/);
assert.throws(()=>V.registerValidationLayer('test.duplicate-order',()=>({issues:[]}),100),/Duplicate validator layer order/);

vm.runInThisContext(fs.readFileSync(new URL('../src/state-validator-manifest.js',import.meta.url),'utf8'),{filename:'src/state-validator-manifest.js'});
assert.equal(V.isValidationRegistryFinalized(),true);
assert.throws(()=>V.registerValidationLayer('late.layer',()=>({issues:[]}),1700),/finalized/,'late validator registration must fail loudly');
E.reset(20260911);
const validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.map(x=>`${x.code}: ${x.message}`).join(' | '));

// Missing base aggregator and missing extension layers must both fail loudly.
const emptyCtx=vm.createContext({console});emptyCtx.window=emptyCtx;
assert.throws(
  ()=>vm.runInContext(fs.readFileSync(new URL('../src/state-validator-manifest.js',import.meta.url),'utf8'),emptyCtx,{filename:'state-validator-manifest.js'}),
  /Validator registry is unavailable/,
  'production manifest must not silently skip a missing validator owner'
);
const ctx=vm.createContext({console});ctx.window=ctx;ctx.SimSpatial={};
vm.runInContext(fs.readFileSync(new URL('../src/state-validator.js',import.meta.url),'utf8'),ctx,{filename:'state-validator.js'});
ctx.SimValidator.registerValidationLayer('one',(_st,base)=>base,100);
assert.throws(()=>ctx.SimValidator.finalizeValidationLayers(['one','two']),/missing=\[two\]/,'manifest must fail loudly when a validator file did not register');
ctx.SimValidator.registerValidationLayer('two',(_st,base)=>base,200);
assert.doesNotThrow(()=>ctx.SimValidator.finalizeValidationLayers(['one','two']));

const extensionFiles=fs.readdirSync(new URL('../src/',import.meta.url)).filter(name=>/^state-validator-v.*\.js$/.test(name));
assert.equal(extensionFiles.length,EXPECTED.length,'every versioned validator extension must be represented by the production manifest');
for(const name of extensionFiles){
  const source=fs.readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
  assert.ok(source.includes('V.registerValidationLayer('),`${name} must use named validator registration`);
  assert.ok(!source.includes('baseValidate=V.validateState'),`${name} must not capture validator load order`);
  assert.ok(!source.includes('V.validateState='),`${name} must not replace the validator aggregator`);
}

console.log('Validator rule registry ownership regression: ok');
