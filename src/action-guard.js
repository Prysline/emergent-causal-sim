(() => {
  const E=window.SimEngine,SP=window.SimSpatial,F=window.SimFurniture;
  if(!E||!SP||!F||E.__actionGuardV103)return;
  E.__actionGuardV103=true;

  const baseTick=E.tick.bind(E),baseReset=E.reset.bind(E);
  const MOVE_SENTINEL=Object.freeze({intent:'__movementOnly',phase:'move'});
  const PHASE_SENTINEL='__phaseChanged';
  const guardedAgents=new WeakSet(),phaseMeta=new WeakMap(),phasePlans=new Set();
  let active=false,startPositions={};

  const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
  const pos=p=>p?{x:p.x,y:p.y}:null;
  const phaseValue=p=>phaseMeta.get(p)?.value??p?.phase;

  function guardPhase(p){
    if(!p||typeof p!=='object'||String(p.intent||'').startsWith('__')||phaseMeta.has(p))return p;
    const meta={value:p.phase,changed:false};phaseMeta.set(p,meta);phasePlans.add(p);
    Object.defineProperty(p,'phase',{
      configurable:true,enumerable:true,
      get(){return active&&meta.changed?PHASE_SENTINEL:meta.value},
      set(v){if(v!==meta.value){meta.value=v;if(active)meta.changed=true;}}
    });
    return p;
  }

  function movedThisTick(a){const start=startPositions[a.id];return !!start&&!same(start,a.position);}
  function adjacentToAgent(a,target){
    if(!a?.position||!target?.position)return true;
    return Math.abs(a.position.x-target.position.x)+Math.abs(a.position.y-target.position.y)===1;
  }
  function atInteraction(a,targetId){return targetId?F.isAtInteraction(a.id,targetId):true;}

  function requiresSpatialBlock(a,p){
    if(!p||typeof p!=='object'||String(p.intent||'').startsWith('__'))return false;
    if(movedThisTick(a))return true;
    if(p.__spatialTarget&&!same(a.position,p.__spatialTarget))return true;
    if(p.__spatialGoal&&!same(a.position,p.__spatialGoal))return true;

    const phase=phaseValue(p);
    if(p.intent==='eat')return !atInteraction(a,p.targetObject||'mealTray');
    if(p.intent==='drinkWater'&&a.kind==='cat')return !atInteraction(a,p.targetObject||'waterBucket');
    if((p.intent==='drinkWater'||p.intent==='drinkAlcohol')&&a.kind==='human'){
      if(phase==='toVessel'&&p.container)return !atInteraction(a,p.container);
      if(phase==='toSource'&&p.sourceObject)return !atInteraction(a,p.sourceObject);
      return false;
    }
    if(p.intent==='refillWater')return !atInteraction(a,'waterBucket');
    if(p.intent==='refillFood'){
      if(phase==='toSource')return !atInteraction(a,p.sourceObject||'foodPantry');
      if(phase==='toTarget')return !atInteraction(a,p.targetObject||'mealTray');
      return false;
    }
    if(p.intent==='rest')return !!p.targetZone&&a.location!==p.targetZone;
    if(p.intent==='talk'||p.intent==='petCat'||p.intent==='seekHuman'){
      const target=E.getState().agents[p.targetAgent];return target?!adjacentToAgent(a,target):false;
    }
    if(p.intent==='cleanFloor'||p.intent==='wander')return !!p.targetZone&&a.location!==p.targetZone;
    return false;
  }

  function installAgentGuard(a){
    if(!a||guardedAgents.has(a))return;
    const d=Object.getOwnPropertyDescriptor(a,'plan');
    let raw=d&&!d.get&&!d.set?d.value:a.plan;
    const getBase=d?.get?()=>d.get.call(a):()=>raw;
    const setBase=d?.set?v=>d.set.call(a,v):v=>{raw=v};
    Object.defineProperty(a,'plan',{
      configurable:true,enumerable:true,
      get(){
        const p=getBase();
        if(p&&typeof p==='object'&&!String(p.intent||'').startsWith('__'))guardPhase(p);
        if(active&&p&&requiresSpatialBlock(a,p))return MOVE_SENTINEL;
        return p;
      },
      set(v){if(v&&typeof v==='object')guardPhase(v);setBase(v);}
    });
    guardedAgents.add(a);
    const current=getBase();if(current&&typeof current==='object')guardPhase(current);
  }

  function prepare(st){for(const a of Object.values(st.agents||{}))installAgentGuard(a);}
  function begin(st){
    for(const p of phasePlans){const m=phaseMeta.get(p);if(m)m.changed=false;}
    startPositions={};for(const a of Object.values(st.agents||{}))startPositions[a.id]=pos(a.position);
    prepare(st);active=true;
  }
  function end(){active=false;startPositions={};}

  function tick(){const st=E.getState();begin(st);try{return baseTick();}finally{end();}}
  function reset(seed){end();phasePlans.clear();const st=baseReset(seed);prepare(st);return st;}

  E.tick=tick;E.reset=reset;
  E.actionGuardStatus=()=>({active,guardedAgents:Object.keys(E.getState().agents||{}).length,guardedPlans:phasePlans.size});
  prepare(E.getState());
})();
