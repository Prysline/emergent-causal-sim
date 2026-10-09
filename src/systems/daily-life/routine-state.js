(() => {
  const W=window.SimWorld;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/daily-life/routine-state.js requires world.js initial-state pipeline.');

  const VERSION='daily-life-routine-v1';
  const SUPPORTED_ACTIVITY_KINDS=Object.freeze(['read']);
  const ROUTINE_SCORE_FLOOR=12;
  const ROUTINE_SCORE_MAX=28;
  const DAY0_WINDOW_DURATION_MINUTES=90;
  const DAY0_WINDOW_START_MINUTE=19*60;
  const DAY0_WINDOW_OFFSET_RANGE=91;

  function stableHash(value){
    let hash=2166136261;
    for(const ch of String(value??'')){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return hash>>>0;
  }
  function day0AnchorsFor(st,agent){
    if(agent?.kind!=='human')return [];
    const offset=stableHash(`${st?.rngState??0}:${agent.id}`)%DAY0_WINDOW_OFFSET_RANGE;
    const startMinute=DAY0_WINDOW_START_MINUTE+offset;
    return [{
      id:'day0-evening-read',
      activityKind:'read',
      source:'day0',
      context:{kind:'daily-time-window',startMinute,endMinute:startMinute+DAY0_WINDOW_DURATION_MINUTES}
    }];
  }
  function validAnchor(anchor){
    const ctx=anchor?.context;
    return !!anchor&&typeof anchor.id==='string'&&!!anchor.id&&SUPPORTED_ACTIVITY_KINDS.includes(anchor.activityKind)&&anchor.source==='day0'&&ctx?.kind==='daily-time-window'&&Number.isInteger(ctx.startMinute)&&Number.isInteger(ctx.endMinute)&&ctx.startMinute>=0&&ctx.endMinute<=1440&&ctx.startMinute<ctx.endMinute;
  }
  function ensureRoutineState(st,agent){
    if(!agent)throw new Error('Routine state requires an Agent.');
    if(agent.routine===undefined)agent.routine={anchors:day0AnchorsFor(st,agent)};
    if(!agent.routine||!Array.isArray(agent.routine.anchors))throw new Error(`Routine state for ${agent.id||'unknown'} requires anchors array.`);
    const ids=new Set();
    for(const anchor of agent.routine.anchors){
      if(!validAnchor(anchor))throw new Error(`Routine anchor for ${agent.id||'unknown'} is invalid.`);
      if(ids.has(anchor.id))throw new Error(`Duplicate Routine anchor ${anchor.id} for ${agent.id||'unknown'}.`);
      ids.add(anchor.id);
    }
    return agent.routine;
  }
  function temporalEvidence(anchor,minute){
    if(!validAnchor(anchor))return 0;
    const m=((Number(minute)||0)%1440+1440)%1440,start=anchor.context.startMinute,end=anchor.context.endMinute;
    if(m<start||m>=end)return 0;
    const half=(end-start)/2,center=start+half,distance=Math.abs(m-center);
    return Math.max(.5,Math.min(1,.5+.5*(1-distance/half)));
  }
  function activeAnchorFor(agent,activityKind,minute){
    const candidates=(agent?.routine?.anchors||[]).filter(anchor=>anchor.activityKind===activityKind).map(anchor=>({anchor,evidence:temporalEvidence(anchor,minute)})).filter(x=>x.evidence>0).sort((a,b)=>b.evidence-a.evidence||a.anchor.id.localeCompare(b.anchor.id));
    return candidates[0]||null;
  }
  function scoreForEvidence(evidence){
    const bounded=Math.max(0,Math.min(1,Number(evidence)||0));
    return ROUTINE_SCORE_FLOOR+(ROUTINE_SCORE_MAX-ROUTINE_SCORE_FLOOR)*bounded;
  }

  W.registerInitialStateInitializer('dailyLifeRoutine.schema',(st)=>{
    for(const agent of Object.values(st.agents||{}))ensureRoutineState(st,agent);
    return st;
  },1450);
  W.DAILY_LIFE_ROUTINE_SCHEMA_VERSION=VERSION;
  window.SimDailyLifeRoutine=Object.freeze({VERSION,SUPPORTED_ACTIVITY_KINDS,ROUTINE_SCORE_FLOOR,ROUTINE_SCORE_MAX,DAY0_WINDOW_DURATION_MINUTES,day0AnchorsFor,validAnchor,ensureRoutineState,temporalEvidence,activeAnchorFor,scoreForEvidence});
})();
