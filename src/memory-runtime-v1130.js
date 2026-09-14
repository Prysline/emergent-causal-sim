(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.MEMORY_SCHEMA_VERSION||'11.13.0-episodic-memory-foundation';
  const MAX_EPISODIC_MEMORIES=W.MAX_EPISODIC_MEMORIES||64;
  const EPISODIC_OBSERVATION_RANGE=W.EPISODIC_OBSERVATION_RANGE||4;
  const baseTick=E.tick,baseReset=E.reset,baseAddEvent=E.addEvent;
  const NON_EPISODIC_ACTIONS=new Set(['wait','abort','restReroute','intentReconsider','socialWaitEnded','catRequestExpired']);

  function normalizeMemoryState(st){
    for(const a of Object.values(st?.agents||{})){
      if(!Array.isArray(a.episodicMemories))a.episodicMemories=[];
      const seen=new Set(),clean=[];
      for(const m of a.episodicMemories){
        if(!m||!m.sourceEventId||seen.has(m.sourceEventId))continue;
        seen.add(m.sourceEventId);clean.push(m);
      }
      a.episodicMemories=clean.slice(-MAX_EPISODIC_MEMORIES);
    }
    return st;
  }
  function parsePositionRef(ref){
    if(ref&&typeof ref==='object'&&Number.isFinite(ref.x)&&Number.isFinite(ref.y))return {x:Number(ref.x),y:Number(ref.y)};
    if(typeof ref!=='string')return null;
    let tail=ref.split('|').pop()||ref;if(tail.startsWith('tile:'))tail=tail.slice(5);
    const m=tail.match(/^(-?\d+),(-?\d+)$/);return m?{x:Number(m[1]),y:Number(m[2])}:null;
  }
  function eventPosition(st,e){
    const d=e?.data||{},fromData=parsePositionRef(d.position);if(fromData)return fromData;
    const actor=d.actor&&st.agents?.[d.actor];if(actor?.position)return {x:actor.position.x,y:actor.position.y};
    const target=d.target&&st.agents?.[d.target];if(target?.position)return {x:target.position.x,y:target.position.y};
    return null;
  }
  function isWorldObservableEvent(e){
    const d=e?.data||{};if(!e||e.type==='system'||!d.action)return false;
    if(d.visibility==='private'||d.phase==='plan'||NON_EPISODIC_ACTIONS.has(d.action))return false;
    return true;
  }
  function canObserveEvent(st,a,e){
    if(!a||!e||!isWorldObservableEvent(e))return false;
    const d=e.data||{};
    if(a.id===d.actor)return true;
    if(a.offMap||E.isSleeping?.(a))return false;
    if(a.id===d.target)return true;
    const p=eventPosition(st,e);if(!p||!a.position)return false;
    const ar=SP.roomAt?.(st,a.position),er=SP.roomAt?.(st,p);if(ar&&er&&ar!==er)return false;
    return (SP.manhattan?.(a.position,p)??Infinity)<=EPISODIC_OBSERVATION_RANGE;
  }
  function observableProjection(st,e){
    const d=e?.data||{},p=eventPosition(st,e);
    let positionRef=null;
    if(typeof d.position==='string')positionRef=d.position;
    else if(d.position&&typeof d.position==='object')positionRef=E.positionRef?.(d.position)||`${d.position.x},${d.position.y}`;
    else if(p)positionRef=E.positionRef?.(p)||`${p.x},${p.y}`;
    return {action:String(d.action||''),actorId:d.actor||null,targetId:d.target||null,positionRef:positionRef||null};
  }
  function pruneAgentMemories(a){
    if(!Array.isArray(a?.episodicMemories))return;
    while(a.episodicMemories.length>MAX_EPISODIC_MEMORIES)a.episodicMemories.shift();
  }
  function rememberObservedEvent(st,a,e,observedTick=st.tick){
    if(!canObserveEvent(st,a,e))return null;
    if(!Array.isArray(a.episodicMemories))a.episodicMemories=[];
    const existing=a.episodicMemories.find(m=>m.sourceEventId===e.id);
    if(existing){existing.lastObservedTick=Math.max(existing.lastObservedTick??existing.observedTick??0,observedTick);return existing;}
    const memory={id:`memory:${a.id}:${e.id}`,kind:'episodic',sourceEventId:e.id,observedTick,lastObservedTick:observedTick,observed:observableProjection(st,e)};
    a.episodicMemories.push(memory);pruneAgentMemories(a);return memory;
  }
  function observeEventForMemories(st,e,observedTick=st.tick){
    if(!isWorldObservableEvent(e))return [];
    const out=[];for(const a of Object.values(st?.agents||{})){const m=rememberObservedEvent(st,a,e,observedTick);if(m)out.push({agentId:a.id,memory:m});}return out;
  }
  function newEventsSince(st,marker){const out=[];for(const e of st.events||[]){if(marker&&e.id===marker)break;out.push(e);}return out.reverse();}
  function processNewEvents(st,marker){for(const e of newEventsSince(st,marker))observeEventForMemories(st,e,st.tick);}

  E.addEvent=(...args)=>{
    const id=baseAddEvent(...args),st=E.getState(),e=st?.causes?.[id];if(e)observeEventForMemories(st,e,st.tick);return id;
  };
  E.tick=(...args)=>{
    const before=E.getState(),marker=before?.events?.[0]?.id||null,result=baseTick(...args),after=E.getState();
    processNewEvents(after,marker);return result;
  };
  E.reset=(...args)=>normalizeMemoryState(baseReset(...args));

  normalizeMemoryState(E.getState());
  Object.assign(E,{MEMORY_SCHEMA_VERSION:VERSION,MAX_EPISODIC_MEMORIES,EPISODIC_OBSERVATION_RANGE,NON_EPISODIC_ACTIONS,parseMemoryPositionRef:parsePositionRef,eventPositionForMemory:eventPosition,isWorldObservableEvent,canObserveEvent,observableMemoryProjection:observableProjection,rememberObservedEvent,observeEventForMemories});
})();
