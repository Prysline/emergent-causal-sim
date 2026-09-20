(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.MEMORY_SCHEMA_VERSION||'11.13.0-episodic-memory-foundation';
  const MAX_EPISODIC_MEMORIES=W.MAX_EPISODIC_MEMORIES||64;
  const EPISODIC_OBSERVATION_RANGE=W.EPISODIC_OBSERVATION_RANGE||4;
  const NON_EPISODIC_ACTIONS=new Set(['wait','abort','restReroute','intentReconsider','socialWaitEnded','catRequestExpired']);
  const deferredCoreEvents=[];

  function normalizeMemoryState(st){
    for(const a of Object.values(st?.agents||{})){
      if(!Array.isArray(a.episodicMemories))a.episodicMemories=[];
      const seen=new Set(),clean=[];
      for(const m of a.episodicMemories){if(!m||!m.sourceEventId||seen.has(m.sourceEventId))continue;seen.add(m.sourceEventId);clean.push(m);}
      a.episodicMemories=clean;pruneAgentMemories(st,a);
    }
    return st;
  }
  function parsePositionRef(ref){
    if(ref&&typeof ref==='object'&&Number.isFinite(ref.x)&&Number.isFinite(ref.y)){const p={x:Number(ref.x),y:Number(ref.y)},z=Number(ref.z??0);if(Number.isInteger(z)&&z!==0)p.z=z;return p;}
    if(typeof ref!=='string')return null;
    let tail=ref.split('|').pop()||ref;if(tail.startsWith('tile:'))tail=tail.slice(5);
    const m=tail.match(/^(-?\d+),(-?\d+)(?:,(-?\d+))?$/);if(!m)return null;const p={x:Number(m[1]),y:Number(m[2])},z=Number(m[3]??0);if(Number.isInteger(z)&&z!==0)p.z=z;return p;
  }
  function eventPosition(st,e){
    const d=e?.data||{},fromData=parsePositionRef(d.position);if(fromData)return fromData;
    const actor=d.actor&&st.agents?.[d.actor];if(actor?.position)return SP.clonePos(actor.position);
    const target=d.target&&st.agents?.[d.target];if(target?.position)return SP.clonePos(target.position);
    return null;
  }
  function isSuccessfulResourceTransferConsequence(st,e){
    const d=e?.data||{};
    if(!e||!d.actor||!d.resource||!d.from||!d.to||!Number.isFinite(d.amount))return false;
    return (e.causeIds||[]).some(id=>st?.causes?.[id]?.data?.action==='pour');
  }
  function episodicPolicyForEvent(st,e){
    const d=e?.data||{};
    if(!e)return {episodic:false,reason:'missingEvent'};
    if(e.type==='system')return {episodic:false,reason:'systemEvent'};
    if(d.visibility==='private')return {episodic:false,reason:'privateVisibility'};
    if(d.phase==='plan')return {episodic:false,reason:'planPhase'};
    if(isSuccessfulResourceTransferConsequence(st,e))return {episodic:false,reason:'successfulResourceTransferConsequence'};
    if(!d.action)return {episodic:false,reason:'noObservableAction'};
    if(NON_EPISODIC_ACTIONS.has(d.action))return {episodic:false,reason:'nonEpisodicAction'};
    return {episodic:true,reason:'observableWorldAction'};
  }
  function isWorldObservableEvent(e){return episodicPolicyForEvent(E.getState?.(),e).episodic;}
  function canObserveEvent(st,a,e){
    if(!a||!e||!episodicPolicyForEvent(st,e).episodic)return false;const d=e.data||{};
    if(a.id===d.actor)return true;if(a.offMap||E.isSleeping?.(a))return false;if(a.id===d.target)return true;
    const p=eventPosition(st,e);if(!p||!a.position)return false;const ar=SP.roomAt?.(st,a.position),er=SP.roomAt?.(st,p);if(ar&&er&&ar!==er)return false;
    return (SP.manhattan?.(a.position,p)??Infinity)<=EPISODIC_OBSERVATION_RANGE;
  }
  function observableProjection(st,e){
    const d=e?.data||{},p=eventPosition(st,e);let positionRef=null;
    if(typeof d.position==='string')positionRef=d.position;else if(d.position&&typeof d.position==='object')positionRef=E.positionRef?.(d.position)||SP.key(d.position);else if(p)positionRef=E.positionRef?.(p)||SP.key(p);
    return {action:String(d.action||''),actorId:d.actor||null,targetId:d.target||null,positionRef:positionRef||null};
  }
  function pruneAgentMemories(st,a){
    if(!Array.isArray(a?.episodicMemories))return [];
    if(typeof E.pruneAgentMemoriesBySalience==='function')return E.pruneAgentMemoriesBySalience(st,a);
    const removed=[];while(a.episodicMemories.length>MAX_EPISODIC_MEMORIES)removed.push(a.episodicMemories.shift());return removed;
  }
  function rememberObservedEvent(st,a,e,observedTick=st.tick){
    if(!canObserveEvent(st,a,e))return null;if(!Array.isArray(a.episodicMemories))a.episodicMemories=[];
    const existing=a.episodicMemories.find(m=>m.sourceEventId===e.id);if(existing){existing.lastObservedTick=Math.max(existing.lastObservedTick??existing.observedTick??0,observedTick);return existing;}
    const memory={id:`memory:${a.id}:${e.id}`,kind:'episodic',sourceEventId:e.id,observedTick,lastObservedTick:observedTick,observed:observableProjection(st,e)};
    a.episodicMemories.push(memory);if(typeof E.onEpisodicMemoryCreated==='function')E.onEpisodicMemoryCreated(st,a,memory);pruneAgentMemories(st,a);return memory;
  }
  function observeEventForMemories(st,e,observedTick=st.tick){if(!episodicPolicyForEvent(st,e).episodic)return [];const out=[];for(const a of Object.values(st?.agents||{})){const m=rememberObservedEvent(st,a,e,observedTick);if(m)out.push({agentId:a.id,memory:m});}return out;}
  function onEventCreated({state:st,event,duringCoreTick}){if(!st||!event)return;if(duringCoreTick){deferredCoreEvents.push(event);return;}observeEventForMemories(st,event,event.tick);}
  function flushDeferredCoreEvents(st){const pending=deferredCoreEvents.splice(0);for(const event of pending)observeEventForMemories(st,event,event.tick);return pending.length;}
  function resetMemoryRuntime(st){deferredCoreEvents.length=0;return normalizeMemoryState(st);}

  if(!E.registerEventCreatedListener)throw new Error('Memory runtime requires core event-created listener support');
  E.registerEventCreatedListener('memory.episodic-observation',onEventCreated,100);

  if(!E.registerRuntimeHook)throw new Error('systems/memory/runtime.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('afterTick','memory.process-events',()=>flushDeferredCoreEvents(E.getState()),500);
  E.registerRuntimeHook('afterReset','memory.normalize-reset',()=>resetMemoryRuntime(E.getState()),300);

  Object.assign(E,{MEMORY_SCHEMA_VERSION:VERSION,MAX_EPISODIC_MEMORIES,EPISODIC_OBSERVATION_RANGE,NON_EPISODIC_ACTIONS,parseMemoryPositionRef:parsePositionRef,eventPositionForMemory:eventPosition,isSuccessfulResourceTransferConsequence,episodicPolicyForEvent,isWorldObservableEvent,canObserveEvent,observableMemoryProjection:observableProjection,rememberObservedEvent,observeEventForMemories,pruneAgentMemories,flushDeferredMemoryEvents:flushDeferredCoreEvents});
})();
