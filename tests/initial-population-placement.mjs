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
  assert.deepEqual(report.resolvedPlacements.zhen.position,{x:9,y:6,z:0});
  assert.deepEqual(report.resolvedPlacements.zhen.posture,{kind:'lying',slotId:'bed:left',furnitureId:'bed'});
  const st=I.createInitialState(authored,{seed:1,version:'test'});
  assert.deepEqual(st.agents.zhen.position,{x:9,y:6});
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
  assert.equal(report.ok,false);
  assert.ok(report.hardErrors.some(x=>x.code==='initial_anchor_kind_mismatch'&&x.residentId==='orange'));
}

{
  const authored=clone(base);
  authored.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'bed:left'}};
  authored.residents.zhen.initial.posture={kind:'lying',slotId:'bed:right'};
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,false);
  assert.ok(report.hardErrors.some(x=>x.code==='initial_anchor_posture_slot_conflict'));
}

{
  const authored=clone(base);
  authored.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'bed:left'}};
  authored.residents.zhen.initial.posture={};
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,false);
  assert.ok(report.hardErrors.some(x=>x.code==='initial_anchor_posture_missing'));
}

{
  const authored=clone(base);
  for(const id of ['zhen','zhou']){
    authored.residents[id].initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'bed:left'}};
    authored.residents[id].initial.posture={kind:'lying'};
  }
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,false);
  assert.ok(report.hardErrors.some(x=>x.code==='initial_slot_double_assigned'&&x.slotId==='bed:left'));
}

{
  const authored=clone(base);
  authored.residents.zhen.initial.placement={mode:'exact',node:{x:5,y:2,z:0}};
  let report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,true,'partial dining-table tile must stay usable when Human walk envelope fits the real remaining floor');
  authored.residents.zhen.initial.placement={mode:'exact',node:{x:7,y:3,z:0}};
  report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,false);
  assert.ok(report.hardErrors.some(x=>x.code==='initial_placement_metric_clearance'&&x.residentId==='zhen'),'chair residual floor must reject Human standing when the walk envelope does not fit');
}

{
  const authored=clone(base);
  authored.residents.zhou.initial.placement=clone(authored.residents.zhen.initial.placement);
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,true);
  assert.ok(report.diagnostics.some(x=>x.code==='initial_node_overlap'&&x.residentIds.includes('zhen')&&x.residentIds.includes('zhou')));
  assert.doesNotThrow(()=>I.createInitialState(authored,{version:'test'}));
}

{
  const authored=clone(base);
  authored.residents.zhen.initial.placement={mode:'exact',node:{x:3,y:4,z:0}};
  for(const id of ['2,4','4,4','3,3','3,5'])authored.map.layers[0].cells[id]={terrain:'wall',material:'stone'};
  const report=I.analyzeInitialPlacements(authored);
  assert.equal(report.ok,true);
  assert.ok(report.diagnostics.some(x=>x.code==='initial_no_exit_route'&&x.residentId==='zhen'));
  assert.ok(report.diagnostics.some(x=>x.code==='initial_food_unreachable'&&x.residentId==='zhen'));
  assert.ok(report.diagnostics.some(x=>x.code==='initial_water_unreachable'&&x.residentId==='zhen'));
  assert.ok(report.diagnostics.some(x=>x.code==='initial_sleep_unreachable'&&x.residentId==='zhen'));
  const st=I.createInitialState(authored,{seed:7,version:'test'});
  assert.deepEqual(st.agents.zhen.position,{x:3,y:4});
}

console.log('initial population placement: ok');
