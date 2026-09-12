import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window=globalThis;
const core=['world.js','engine.js','recovery.js','supply.js','spatial.js','furniture.js','action-guard.js','seating.js','rest-surface.js','state-validator.js'];
for(const file of core){vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});}
const E=globalThis.SimEngine,SP=globalThis.SimSpatial,F=globalThis.SimFurniture;
E.reset(20260911);
for(let i=0;i<155;i++){
  E.tick();
  const st=E.getState(),a=st.agents.zhen,c=st.containers.cupB;
  if(st.tick>=130&&st.tick<=155){
    const p=a.plan;
    console.log('ZHEN_TRACE',JSON.stringify({
      tick:st.tick,time:E.timeStr(),pos:a.position,location:a.location,
      plan:p&&{intent:p.intent,phase:p.phase,container:p.container,target:p.targetObject,spatialTarget:p.__spatialTarget,spatialGoal:p.__spatialGoal},
      path:a.__spatialPath,cupB:{position:SP.objectPosition('cupB'),heldBy:c.heldBy,contents:c.contents},
      furnitureGoal:F.interactionGoal('cupB','zhen'),atInteraction:F.isAtInteraction('zhen','cupB')
    }));
  }
}
