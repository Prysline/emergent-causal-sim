import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
delete globalThis.SimWorld;
delete globalThis.SimEngine;
vm.runInThisContext(fs.readFileSync(new URL('../src/embodiment-capabilities.js',import.meta.url),'utf8'),{filename:'embodiment-capabilities.js'});

const C=globalThis.SimEmbodimentCapabilities;
assert.equal(C.VERSION,'embodiment-capabilities-v1');
assert.equal(globalThis.SimWorld,undefined,'authoring-safe capability contract must not require or create SimWorld');
assert.equal(globalThis.SimEngine,undefined,'authoring-safe capability contract must not require or create SimEngine');
assert.deepEqual(C.supportedLocomotionModesForKind('human'),['walk','kneelCrawl','proneCrawl']);
assert.deepEqual(C.supportedLocomotionModesForKind('cat'),['walk']);
assert.deepEqual(C.freePosturesForKind('human'),['standing','lying','kneeling','prone']);
assert.deepEqual(C.freePosturesForKind('cat'),['standing','lying']);
assert.deepEqual(C.slotPosturesForKind('human',{canRest:true}),['standing','sitting','lying','kneeling','prone']);
assert.deepEqual(C.slotPosturesForKind('cat',{canRest:true}),['standing','sitting','lying']);
assert.deepEqual(C.slotPosturesForKind('cat',{canRest:false,canSleep:false}),['standing','sitting']);
assert.equal(C.postureForMode('walk'),'standing');
assert.equal(C.postureForMode('kneelCrawl'),'kneeling');
assert.equal(C.postureForMode('proneCrawl'),'prone');
assert.equal(C.modeFromPosture('lying'),null,'rest/static lying must not become a locomotion mode');
assert.equal(C.modeFromPosture('sitting'),null,'slot sitting must not become a locomotion mode');
const profile=C.defaultPhysicalProfile('human');
profile.bodyGeometry.height=99;
assert.equal(C.DEFAULT_PHYSICAL_PROFILES.human.bodyGeometry.height,1.65,'defaultPhysicalProfile must clone the shared template');
assert.equal(C.defaultPhysicalProfile('unknown'),null);

console.log('Embodiment capability contract: ok');
