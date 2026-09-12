import fs from 'node:fs';
import vm from 'node:vm';
globalThis.window=globalThis;
const core=['world.js','engine.js','recovery.js','supply.js','spatial.js','furniture.js','action-guard.js','seating.js','rest-surface.js','state-validator.js'];
for(const file of core)vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
const E=globalThis.SimEngine;
const st=E.reset(20260911),a=st.agents.zhen,b=st.agents.zhou;
a.needs.fatigue=72;b.needs.fatigue=72;
a.position={x:8,y:2};a.location='rest';b.position={x:8,y:1};b.location='rest';
a.plan={intent:'rest',phase:'move',targetZone:'rest',restTicks:0,started:st.tick};
b.plan={intent:'rest',phase:'move',targetZone:'rest',restTicks:0,started:st.tick};
const snap=x=>({pos:x.position,plan:x.plan&&{intent:x.plan.intent,phase:x.plan.phase,targetZone:x.plan.targetZone,slot:x.plan.__restSlotId,goal:x.plan.__spatialGoal},slotTarget:x.__slotTarget,seatSlot:x.seatSlot,seatedOn:x.seatedOn,restAfter:!!x.__restAfterSlot,fatigue:x.needs.fatigue});
console.log('REST_DEBUG 0',JSON.stringify({a:snap(a),b:snap(b)}));
for(let i=1;i<=8;i++){E.tick();console.log(`REST_DEBUG ${i}`,JSON.stringify({a:snap(a),b:snap(b),issues:E.validateState().issues}));}
