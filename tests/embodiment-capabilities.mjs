import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
delete globalThis.SimWorld;
delete globalThis.SimEngine;
vm.runInThisContext(fs.readFileSync(new URL('../src/embodiment-capabilities.js',import.meta.url),'utf8'),{filename:'embodiment-capabilities.js'});

const C=globalThis.SimEmbodimentCapabilities;
assert.equal(C.VERSION,'embodiment-capabilities-v2');
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
assert.deepEqual(C.getPoseEnvelopeForKind('human',C.DEFAULT_PHYSICAL_PROFILES.human.bodyGeometry,'sitting'),{height:.9075,width:.45,length:.594});
assert.deepEqual(C.getPoseEnvelopeForKind('cat',C.DEFAULT_PHYSICAL_PROFILES.cat.bodyGeometry,'lying'),{height:.16,width:.22499999999999998,length:.45});
assert.equal(C.getPoseEnvelopeForKind('human',C.DEFAULT_PHYSICAL_PROFILES.human.bodyGeometry,'standing'),null,'standing PoseEnvelope is intentionally not part of Slice 1');
assert.equal(C.poseEnvelopeFitsUsableSpace({height:.9,width:.45,length:.59},{width:.5,length:.65}),true);
assert.equal(C.poseEnvelopeFitsUsableSpace({height:.3,width:.45,length:1.65},{width:.9,length:.7}),false);

console.log('Embodiment capability contract: ok');
