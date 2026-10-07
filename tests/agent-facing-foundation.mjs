import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js']);

const A=globalThis.SimWorldAuthoring,I=globalThis.SimWorldInitializer,W=globalThis.SimWorld;
const clone=value=>JSON.parse(JSON.stringify(value));
const directions=['north','northEast','east','southEast','south','southWest','west','northWest'];

assert.equal(A.VERSION,'world-authoring-v12');
assert.deepEqual(A.AGENT_FACING_DIRECTIONS,directions,'World Authoring must own the exact canonical 8-direction representation');
for(const [id,resident] of Object.entries(A.DEFAULT_WORLD_AUTHORING.residents)){
  assert.ok(directions.includes(resident.initial.facing),id+' must explicitly author a legal initial facing');
}

const missing=clone(A.DEFAULT_WORLD_AUTHORING);
delete missing.residents.zhen.initial.facing;
const missingReport=A.validateAuthoring(missing);
assert.equal(missingReport.ok,false);
assert.ok(missingReport.errors.some(issue=>issue.code==='authoring_resident_facing_missing'&&issue.path==='residents.zhen.initial.facing'),'missing initial.facing must fail explicitly');

const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
invalid.residents.zhen.initial.facing='up';
const invalidReport=A.validateAuthoring(invalid);
assert.equal(invalidReport.ok,false);
assert.ok(invalidReport.errors.some(issue=>issue.code==='authoring_resident_facing_invalid'&&issue.path==='residents.zhen.initial.facing'),'illegal initial.facing must fail explicitly');

const authored=clone(A.DEFAULT_WORLD_AUTHORING);
authored.residents.zhen.initial.facing='northWest';
authored.residents.zhou.initial.facing='east';
authored.residents.orange.initial.facing='southEast';
const first=I.createInitialState(authored,{seed:49,version:'test'});
assert.equal(first.agents.zhen.facing,'northWest');
assert.equal(first.agents.zhou.facing,'east');
assert.equal(first.agents.orange.facing,'southEast');
const recreated=I.createInitialState(authored,{seed:49,version:'test'});
assert.equal(recreated.agents.zhen.facing,'northWest','recreated state must preserve the same authored facing');
assert.equal(recreated.agents.zhou.facing,'east');
assert.equal(recreated.agents.orange.facing,'southEast');

const before=first.agents.zhen.facing;
first.agents.zhen.position={x:8,y:3};
assert.equal(first.agents.zhen.facing,before,'position change must not implicitly rewrite facing');

const worldState=W.createInitialStateFromAuthoring(authored,{seed:49});
assert.equal(worldState.agents.zhen.facing,'northWest','canonical World construction must preserve authored facing');
assert.equal(worldState.version,'11.49.0-agent-facing-foundation');

console.log('agent facing foundation: ok');
