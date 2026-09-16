from pathlib import Path

ROOT = Path('.')

LAYERS = [
    ('state-validator-v111.js', 'spatial.node', 100),
    ('state-validator-v1114.js', 'spatial.environment', 200),
    ('state-validator-v1120.js', 'action.canonical-type', 300),
    ('state-validator-v1121.js', 'intent.active', 400),
    ('state-validator-v1122.js', 'social-bid', 500),
    ('state-validator-v1123.js', 'interruption', 600),
    ('state-validator-v1124.js', 'deliberation', 700),
    ('state-validator-v1130.js', 'memory.episodic', 800),
    ('state-validator-v1131.js', 'appraisal', 900),
    ('state-validator-v1132.js', 'affect', 1000),
    ('state-validator-v1132a.js', 'social-response', 1100),
    ('state-validator-v1133.js', 'memory-retention', 1200),
    ('state-validator-v1133a.js', 'human-social-response', 1300),
    ('state-validator-v1134.js', 'memory-deliberation', 1400),
    ('state-validator-v1135.js', 'social-outcome-memory', 1500),
]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one occurrence of {old!r}, got {count}')
    return text.replace(old, new, 1)


# Base validator becomes the sole aggregator owner.
base_path = ROOT / 'src/state-validator.js'
base = base_path.read_text()
base = replace_once(base, '  function validateState(st){', '  function validateBaseState(st){', 'base function')
old_export = '  window.SimValidator={validateState};'
new_export = '''  const validationLayers=new Map();
  let finalizedExpectedIds=null;

  function sortedValidationLayers(){return [...validationLayers.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));}
  function registerValidationLayer(id,handler,order){
    if(finalizedExpectedIds)throw new Error(`Validator registry is finalized; cannot register ${id}.`);
    if(typeof id!=='string'||!id)throw new Error('Validator layer id must be a non-empty string.');
    if(typeof handler!=='function')throw new Error(`Validator layer ${id} must provide a handler.`);
    if(!Number.isFinite(order))throw new Error(`Validator layer ${id} must provide a finite order.`);
    if(validationLayers.has(id))throw new Error(`Duplicate validator layer id: ${id}`);
    const orderOwner=sortedValidationLayers().find(layer=>layer.order===order);
    if(orderOwner)throw new Error(`Duplicate validator layer order ${order}: ${orderOwner.id} / ${id}`);
    validationLayers.set(id,{id,handler,order});
  }
  function listValidationLayers(){return sortedValidationLayers().map(({id,order})=>({id,order}));}
  function assertValidationLayers(expectedIds){
    if(!Array.isArray(expectedIds)||!expectedIds.length)throw new Error('Expected validator layer manifest must be a non-empty array.');
    const expected=[...expectedIds],expectedSet=new Set(expected);
    if(expectedSet.size!==expected.length)throw new Error('Expected validator layer manifest contains duplicate ids.');
    const actual=listValidationLayers().map(layer=>layer.id),actualSet=new Set(actual);
    const missing=expected.filter(id=>!actualSet.has(id)),unexpected=actual.filter(id=>!expectedSet.has(id));
    if(missing.length||unexpected.length)throw new Error(`Validator layer manifest mismatch; missing=[${missing.join(', ')}], unexpected=[${unexpected.join(', ')}].`);
    return actual;
  }
  function finalizeValidationLayers(expectedIds){
    if(finalizedExpectedIds)throw new Error('Validator registry is already finalized.');
    assertValidationLayers(expectedIds);
    finalizedExpectedIds=Object.freeze([...expectedIds]);
    return listValidationLayers();
  }
  function validateState(st){
    let result=validateBaseState(st);
    for(const layer of sortedValidationLayers()){
      const next=layer.handler(st,result);
      if(!next||!Array.isArray(next.issues))throw new Error(`Validator layer ${layer.id} returned an invalid validation result.`);
      result=next;
    }
    return result;
  }

  window.SimValidator={validateState,validateBaseState,registerValidationLayer,listValidationLayers,assertValidationLayers,finalizeValidationLayers,isValidationRegistryFinalized:()=>!!finalizedExpectedIds};'''
base = replace_once(base, old_export, new_export, 'base export')
base_path.write_text(base)

# Preserve every existing invariant body; only replace wrapper ownership with named registration.
for filename, layer_id, order in LAYERS:
    path = ROOT / 'src' / filename
    text = path.read_text()
    text = replace_once(text, '  const baseValidate=V.validateState;\n', '', filename)
    text = replace_once(text, '  function validateState(st){', '  function validateLayer(st,base){', filename)
    text = replace_once(text, '    const base=baseValidate(st),issues=', '    const issues=', filename)
    text = replace_once(text, '  V.validateState=validateState;', f"  V.registerValidationLayer('{layer_id}',validateLayer,{order});", filename)
    if 'baseValidate' in text or 'V.validateState=' in text:
        raise SystemExit(f'{filename}: legacy wrapper residue remains')
    path.write_text(text)

expected_ids = [layer_id for _, layer_id, _ in LAYERS]
manifest = """(() => {\n  const V=window.SimValidator;if(!V?.finalizeValidationLayers)return;\n  const EXPECTED_VALIDATION_LAYERS=%s;\n  V.finalizeValidationLayers(EXPECTED_VALIDATION_LAYERS);\n})();\n""" % repr(expected_ids).replace("'", "'")
(ROOT / 'src/state-validator-manifest.js').write_text(manifest)

# Production app must finalize only after every validator layer has had a chance to register.
index_path = ROOT / 'index.html'
index = index_path.read_text()
needle = '<script src="src/state-validator-v1135.js" defer></script>\n'
index = replace_once(index, needle, needle + '<script src="src/state-validator-manifest.js" defer></script>\n', 'index manifest placement')
index_path.write_text(index)

# Focused ownership regression: production set/order, duplicate guards, missing manifest guard, and static no-wrapper check.
test = r'''import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const EXPECTED=[
  ['spatial.node',100],['spatial.environment',200],['action.canonical-type',300],['intent.active',400],['social-bid',500],
  ['interruption',600],['deliberation',700],['memory.episodic',800],['appraisal',900],['affect',1000],
  ['social-response',1100],['memory-retention',1200],['human-social-response',1300],['memory-deliberation',1400],['social-outcome-memory',1500]
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
assert.throws(()=>V.registerValidationLayer('spatial.node',()=>({issues:[]}),1600),/Duplicate validator layer id/);
assert.throws(()=>V.registerValidationLayer('test.duplicate-order',()=>({issues:[]}),100),/Duplicate validator layer order/);

vm.runInThisContext(fs.readFileSync(new URL('../src/state-validator-manifest.js',import.meta.url),'utf8'),{filename:'src/state-validator-manifest.js'});
assert.equal(V.isValidationRegistryFinalized(),true);
assert.throws(()=>V.registerValidationLayer('late.layer',()=>({issues:[]}),1600),/finalized/,'late validator registration must fail loudly');
E.reset(20260911);
const validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.map(x=>`${x.code}: ${x.message}`).join(' | '));

// Missing-layer guard is tested in an isolated registry so production finalization remains immutable.
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
'''
(ROOT / 'tests/validator-rule-registry.mjs').write_text(test)

workflow_path = ROOT / '.github/workflows/state-regression.yml'
workflow = workflow_path.read_text()
anchor = '      - run: node tests/v11-state-regression.mjs\n'
workflow = replace_once(workflow, anchor, anchor + '      - run: node tests/validator-rule-registry.mjs\n', 'state regression workflow')
workflow_path.write_text(workflow)

# Current Architecture: document ownership, not historical migration detail.
docs_path = ROOT / 'docs/architecture.md'
docs = docs_path.read_text()
section = '''\n## 9. Validator rule ownership\n\n`src/state-validator.js` 是唯一 `validateState` aggregator owner。Versioned validator extension 不得捕捉或覆寫 `V.validateState`；每一層 invariant 使用 `V.registerValidationLayer(id, handler, order)` 以唯一 ID 與 explicit order 註冊。\n\n正式 app 在所有 versioned validator 載入後由 `state-validator-manifest.js` finalize expected layer set。duplicate ID、duplicate order、missing expected layer、unexpected layer、finalize 後 late registration 都必須 loud failure；不得靠 `index.html` script load order 靜默決定 validation semantics。\n\n每個 layer 接收 `(state, previousResult)` 並回傳下一個 validation result；既有 invariant logic 保持在原本 owner 檔案。Registry 只負責 ownership / ordering / completeness，不把 subsystem invariant 集中回單一巨型 validator。\n'''
if '## 9. Validator rule ownership' in docs:
    raise SystemExit('architecture already contains validator ownership section')
docs_path.write_text(docs.rstrip() + '\n' + section)

# Temporary patch files are not part of the product branch.
Path('.github/scripts/patch-validator-registry.py').unlink(missing_ok=True)
Path('.github/workflows/patch-validator-registry.yml').unlink(missing_ok=True)
