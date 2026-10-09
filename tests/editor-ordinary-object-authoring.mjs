import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['furniture-definitions.js','horizontal-geometry.js','world-authoring.js','embodiment-capabilities.js','editor-authoring-mutations.js','editor-ordinary-object-authoring.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}

const A=globalThis.SimWorldAuthoring;
const M=globalThis.SimEditorAuthoringMutations;
const O=globalThis.SimEditorOrdinaryObjectAuthoring;
const clone=value=>JSON.parse(JSON.stringify(value));

assert.equal(A.VERSION,'world-authoring-v13');
assert.equal(A.FURNITURE_CATALOG_VERSION,'furniture-definitions-v12');
assert.equal(O.VERSION,'editor-ordinary-object-authoring-v1');
assert.deepEqual(O.listTemplates().map(item=>item.id),['readable-book']);
assert.equal(O.getTemplate('missing-template'),null);

let doc=clone(A.DEFAULT_WORLD_AUTHORING);
delete doc.entities.objects.bookA;
assert.equal(A.validateAuthoring(doc).ok,true);

const unknown=M.createOrdinaryObjectFromTemplate(doc,{templateId:'missing-template',target:{x:2,y:4,z:0},supportChoice:{kind:'floor'}});
assert.equal(unknown.ok,false);
assert.equal(unknown.issues[0].code,'ordinary_object_template_unknown');

let result=M.createOrdinaryObjectFromTemplate(doc,{templateId:'readable-book',target:{x:5,y:2,z:0}});
assert.equal(result.ok,false,'support-bearing target must not silently choose floor or furniture');
assert.equal(result.issues[0].code,'support_choice_required');
assert.deepEqual(result.meta.candidates.map(item=>item.id),['diningTable']);

result=M.createOrdinaryObjectFromTemplate(doc,{templateId:'readable-book',target:{x:5,y:2,z:0},supportChoice:{kind:'furniture',furnitureId:'diningTable'}});
assert.equal(result.ok,true,result.issues.map(item=>item.code).join(','));
assert.equal(result.meta.newId,'readable-book-1');
assert.deepEqual(result.candidate.entities.objects['readable-book-1'],{
  id:'readable-book-1',
  name:'一本書',
  icon:'📖',
  affordances:['read'],
  interactions:{read:{mode:'supportReach'}},
  position:{x:5,y:2,z:0},
  supportId:'diningTable'
});
assert.equal(doc.entities.objects['readable-book-1'],undefined,'create must not mutate source authoring');
doc=result.candidate;

result=M.moveObject(doc,{entityType:'object',entityId:'readable-book-1',target:{x:2,y:4,z:0},supportChoice:{kind:'floor'}});
assert.equal(result.ok,true,result.issues.map(item=>item.code).join(','));
assert.deepEqual(result.candidate.entities.objects['readable-book-1'].position,{x:2,y:4,z:0});
assert.equal(result.candidate.entities.objects['readable-book-1'].supportId,undefined);
doc=result.candidate;

result=M.moveOrdinaryObject(doc,{objectId:'readable-book-1',target:{x:5,y:2,z:0},supportChoice:{kind:'furniture',furnitureId:'chairNW'}});
assert.equal(result.ok,false,'invalid support must fail loudly instead of falling back');
assert.equal(result.issues[0].code,'support_choice_invalid');

result=M.moveOrdinaryObject(doc,{objectId:'readable-book-1',target:{x:5,y:2,z:0},supportChoice:{kind:'furniture',furnitureId:'diningTable'}});
assert.equal(result.ok,true,result.issues.map(item=>item.code).join(','));
doc=result.candidate;
assert.equal(doc.entities.objects['readable-book-1'].supportId,'diningTable');

const serialized=A.serializeAuthoring(doc);
const roundTripped=A.parseAuthoringJSON(serialized);
assert.equal(A.validateAuthoring(roundTripped).ok,true);
assert.deepEqual(roundTripped.entities.objects['readable-book-1'],doc.entities.objects['readable-book-1'],'ordinary object must survive authoring export/import round-trip');

result=M.deleteOrdinaryObject(roundTripped,{objectId:'readable-book-1'});
assert.equal(result.ok,true,result.issues.map(item=>item.code).join(','));
assert.equal(result.candidate.entities.objects['readable-book-1'],undefined);
assert.equal(A.validateAuthoring(result.candidate).ok,true,'delete must leave no invalid authored references');

const missingDelete=M.deleteOrdinaryObject(result.candidate,{objectId:'readable-book-1'});
assert.equal(missingDelete.ok,false);
assert.equal(missingDelete.issues[0].code,'object_missing');

console.log('editor ordinary object authoring regression passed');
