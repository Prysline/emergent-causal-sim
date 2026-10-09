import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

if(!globalThis.window)globalThis.window=globalThis;
for(const file of [
  'furniture-definitions.js',
  'horizontal-geometry.js',
  'world-authoring.js',
  'embodiment-capabilities.js',
  'world-initializer.js',
  'editor-authoring-mutations.js',
  'editor-container-source-authoring.js'
]){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}

const A=globalThis.SimWorldAuthoring;
const I=globalThis.SimWorldInitializer;
const M=globalThis.SimEditorAuthoringMutations;
const P=globalThis.SimEditorContainerSourceAuthoring;
const clone=value=>JSON.parse(JSON.stringify(value));

assert.equal(A.VERSION,'world-authoring-v13');
assert.equal(P.VERSION,'editor-container-source-authoring-v1');
assert.deepEqual(P.listContainerPresets().map(item=>item.id),[
  'ready-food','plate','food-pantry','basket','water-bucket','white-cup','blue-cup','alcohol-bottle'
]);
assert.deepEqual(P.listSourcePresets().map(item=>item.id),['tap']);
assert.equal(P.getContainerPreset('missing'),null);
assert.equal(P.getSourcePreset('missing'),null);

let authored=clone(A.DEFAULT_WORLD_AUTHORING);
const originalFingerprint=A.semanticFingerprint(authored);

let result=P.createContainerFromPreset(authored,{presetId:'missing',target:{x:2,y:5,z:0}});
assert.equal(result.ok,false);
assert.equal(result.issues[0].code,'container_preset_unknown');
assert.equal(A.semanticFingerprint(authored),originalFingerprint,'rejected create must not mutate input');

result=P.createContainerFromPreset(authored,{presetId:'white-cup',target:{x:2,y:5,z:0}});
assert.equal(result.ok,true);
let cupId=result.meta.newId;
assert.equal(cupId,'cupWhite-1');
assert.deepEqual(result.candidate.entities.containers[cupId].contents,{},'cup presets must start empty');
assert.equal(result.candidate.entities.containers[cupId].supportId,undefined);
authored=result.candidate;

result=P.createContainerFromPreset(authored,{presetId:'ready-food',target:{x:5,y:2,z:0}});
assert.equal(result.ok,false,'supported placement must require an explicit support choice');
assert.equal(result.issues[0].code,'support_choice_required');
assert.ok(result.meta.candidates.some(item=>item.id==='diningTable'));

result=P.createContainerFromPreset(authored,{presetId:'ready-food',target:{x:5,y:2,z:0},supportChoice:{kind:'furniture',furnitureId:'diningTable'}});
assert.equal(result.ok,true);
const readyFoodId=result.meta.newId;
assert.equal(result.candidate.entities.containers[readyFoodId].supportId,'diningTable');
assert.deepEqual(result.candidate.entities.containers[readyFoodId].contents,{food:68},'debug ready-food preset keeps its authored initial food');
authored=result.candidate;

result=P.createContainerFromPreset(authored,{presetId:'food-pantry',target:{x:5,y:2,z:0},supportChoice:{kind:'furniture',furnitureId:'diningTable'}});
assert.equal(result.ok,false,'floor-only fixed storage must reject furniture support');
assert.equal(result.issues[0].code,'support_choice_invalid');

result=P.createSourceFromPreset(authored,{presetId:'tap',target:{x:0,y:5,z:0}});
assert.equal(result.ok,false,'source placement must reject a preset whose interaction port falls outside constructed cells');
assert.equal(result.issues[0].code,'source_port_target_invalid');

result=P.createSourceFromPreset(authored,{presetId:'tap',target:{x:4,y:5,z:0}});
assert.equal(result.ok,true);
const tapId=result.meta.newId;
assert.equal(tapId,'tap-1');
let tap=result.candidate.entities.sources[tapId];
assert.equal(tap.resource,'water');
assert.equal(tap.infinite,true);
assert.deepEqual(tap.interactions,{fill:{mode:'port'}});
assert.deepEqual(tap.interactionPorts,[{
  id:'tap-1:west',label:'水龍頭左側',position:{x:3,y:5,z:0},edge:'east',affordances:['fill']
}]);
authored=result.candidate;

result=M.moveObject(authored,{entityType:'source',entityId:tapId,target:{x:5,y:5,z:0}});
assert.equal(result.ok,true);
tap=result.candidate.entities.sources[tapId];
assert.deepEqual(tap.position,{x:5,y:5,z:0});
assert.deepEqual(tap.interactionPorts[0].position,{x:4,y:5,z:0},'existing Source move contract must translate interaction ports with the Source');
authored=result.candidate;

const serialized=A.serializeAuthoring(authored);
const roundTrip=A.parseAuthoringJSON(serialized);
assert.deepEqual(roundTrip.entities.containers[cupId],authored.entities.containers[cupId]);
assert.deepEqual(roundTrip.entities.sources[tapId],authored.entities.sources[tapId]);

const runtime=I.createInitialState(authored,{seed:20261010,version:'test'});
assert.deepEqual(runtime.containers[cupId].contents,{});
assert.equal(runtime.sources[tapId].resource,'water');
assert.equal(runtime.sources[tapId].infinite,true);
assert.deepEqual(runtime.sources[tapId].interactionPorts[0].position,{x:4,y:5});

result=P.deleteContainer(authored,{containerId:readyFoodId});
assert.equal(result.ok,true);
assert.equal(result.candidate.entities.containers[readyFoodId],undefined);
assert.deepEqual(result.meta.removedContents,{food:68},'removing a debug fixture removes its authored initial contents with the container');
authored=result.candidate;

result=P.deleteSource(authored,{sourceId:tapId});
assert.equal(result.ok,true);
assert.equal(result.candidate.entities.sources[tapId],undefined);
assert.deepEqual(result.meta.interactionPortIds,['tap-1:west']);

console.log('editor container/source preset authoring regression passed');
