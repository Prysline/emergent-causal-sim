import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['furniture-definitions.js','horizontal-geometry.js','world-authoring.js','embodiment-capabilities.js','world-initializer.js','world.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}
const A=globalThis.SimWorldAuthoring,I=globalThis.SimWorldInitializer;
const clone=value=>JSON.parse(JSON.stringify(value));
const base=A.DEFAULT_WORLD_AUTHORING;

{
  const report=I.analyzeInitialPlacements(base);
  assert.equal(report.ok,true);
  assert.deepEqual(report.hardErrors,[]);
  assert.deepEqual(report.diagnostics,[]);
  assert.deepEqual(report.resolvedPlacements.zhen.position,{x:9,y:3,z:0});
  assert.deepEqual(report.resolvedPlacements.zhen.posture,{kind:'standing',slotId:null,furnitureId:null});
  assert.deepEqual(report.resolvedPlacements.zhou.position,{x:7,y:4,z:0},'default Zhou must no longer stand in chairSE metric geometry');
}

{
  const authored=clone(base);
  authored.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'bed:left'}};
  authored.residents.zhen.initial.posture={kind:'lying',slotId:'bed:left'};
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,true);
  assert.deepEqual(report.resolvedPlacements.zhen.position,{x:8,y:6,z:0});
  assert.deepEqual(report.resolvedPlacements.zhen.posture,{kind:'lying',slotId:'bed:left',furnitureId:'bed'});
  const st=I.createInitialState(authored,{seed:1,version:'test'});
  assert.deepEqual(st.agents.zhen.position,{x:8,y:6});
  assert.deepEqual(st.agents.zhen.posture,{kind:'lying',slotId:'bed:left',furnitureId:'bed'});
  assert.equal(Object.prototype.hasOwnProperty.call(st,'initializationDiagnostics'),false);
}

{
  const authored=clone(base);
  authored.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'missing:slot'}};
  authored.residents.zhen.initial.posture={kind:'lying'};
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,false);
  assert.ok(report.hardErrors.some(x=>x.code==='initial_anchor_missing'&&x.residentId==='zhen'));
  assert.throws(()=>I.createInitialState(authored,{version:'test'}),e=>e?.code==='initial_population_placement_invalid'&&e.issues.some(x=>x.code==='initial_anchor_missing'));
}

{
  const authored=clone(base);
  authored.residents.orange.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'bed:left'}};
  authored.residents.orange.initial.posture={kind:'lying'};
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,true,report.hardErrors.map(x=>x.message).join('\n'));
  assert.deepEqual(report.resolvedPlacements.orange.posture,{kind:'lying',slotId:'bed:left',furnitureId:'bed'});
}

{
  const authored=clone(base);
  authored.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'bed:left'}};
  authored.residents.zhen.initial.posture={kind:'lying',slotId:'bed:right'};
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,false);
  assert.ok(report.hardErrors.some(x=>x.code==='initial_posture_slot_mismatch'&&x.residentId==='zhen'));
}

{
  const authored=clone(base);
  authored.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'worldCell',position:{x:0,y:0,z:0}}};
  authored.residents.zhen.initial.posture={kind:'standing'};
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,false);
  assert.ok(report.hardErrors.some(x=>x.code==='initial_anchor_floor_invalid'&&x.residentId==='zhen'));
}

console.log('initial population placement regression: ok');
