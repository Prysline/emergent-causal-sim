(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W)return;
  const VERSION=W.ACTION_SCHEMA_VERSION||'11.51.0-activity-concurrency';
  const compatibilityRules=[];
  const transientExecutions=new WeakMap();

  function actionKind(action){return action?.kind??null;}
  function normalizePhases(phases){if(phases==null)return null;const list=Array.isArray(phases)?phases:[phases];if(!list.length||list.some(x=>typeof x!=='string'||!x))throw new Error('Activity compatibility phases must be non-empty strings.');return Object.freeze([...new Set(list)]);}
  function registerActivityCompatibility(id,{primaryActionKind,primaryPhases=null,transientKind,primaryProgressScale=1}={}){
    if(!id||typeof id!=='string')throw new Error('Activity compatibility requires a non-empty id.');
    if(compatibilityRules.some(rule=>rule.id===id))throw new Error(`Duplicate activity compatibility rule: ${id}`);
    if(!primaryActionKind||typeof primaryActionKind!=='string'||!transientKind||typeof transientKind!=='string')throw new Error(`Activity compatibility ${id} requires primaryActionKind + transientKind.`);
    const scale=Number(primaryProgressScale);if(scale!==0&&scale!==1)throw new Error(`Activity compatibility ${id} primaryProgressScale v1 must be exactly 0 or 1.`);
    const rule=Object.freeze({id,primaryActionKind,primaryPhases:normalizePhases(primaryPhases),transientKind,primaryProgressScale:scale});compatibilityRules.push(rule);return rule;
  }
  function listActivityCompatibility(){return compatibilityRules.map(rule=>({...rule,primaryPhases:rule.primaryPhases?[...rule.primaryPhases]:null}));}
  function activityCompatibilityFor(agent,transientKind){
    const action=agent?.action,kind=actionKind(action),phase=action?.phase||null;
    if(!kind||!transientKind)return Object.freeze({allowed:false,requiresTransition:true,reason:'missing-primary-or-transient'});
    const rule=compatibilityRules.find(candidate=>candidate.primaryActionKind===kind&&candidate.transientKind===transientKind&&(!candidate.primaryPhases||candidate.primaryPhases.includes(phase)));
    if(!rule)return Object.freeze({allowed:false,requiresTransition:true,reason:'no-compatible-rule',primaryActionKind:kind,primaryPhase:phase,transientKind});
    return Object.freeze({allowed:true,requiresTransition:false,reason:null,ruleId:rule.id,primaryActionKind:kind,primaryPhase:phase,transientKind,primaryProgressScale:rule.primaryProgressScale});
  }
  function transientExecutionFor(st,agent,{tick=st?.tick}={}){const record=agent&&transientExecutions.get(agent);return record&&record.executionTick===tick?record:null;}
  function scheduleTransientExecution(st,agent,{kind,sourceId=null,executionTick=(Number(st?.tick)||0)+1,data=null}={}){
    if(!st||!agent||!kind)return {scheduled:false,reason:'missing-input'};
    const compatibility=activityCompatibilityFor(agent,kind);if(!compatibility.allowed)return {scheduled:false,reason:'transition-required',compatibility};
    const tick=Number(executionTick);if(!Number.isInteger(tick)||tick<Number(st.tick))throw new Error('Transient execution requires a current-or-future integer executionTick.');
    const existing=transientExecutions.get(agent);
    if(existing&&existing.executionTick===tick&&existing.sourceId!==sourceId)return {scheduled:false,reason:'transient-slot-occupied',existing};
    const record=Object.freeze({kind,sourceId,executionTick:tick,compatibility:Object.freeze({...compatibility}),data:data&&typeof data==='object'?Object.freeze({...data}):null});
    transientExecutions.set(agent,record);return {scheduled:true,record,replaced:!!existing&&existing.executionTick===tick};
  }
  function clearTransientExecution(agent,{sourceId=null}={}){const current=agent&&transientExecutions.get(agent);if(!current)return false;if(sourceId!=null&&current.sourceId!==sourceId)return false;transientExecutions.delete(agent);return true;}
  function primaryActivityProgressScale(st,agent){const execution=transientExecutionFor(st,agent);if(!execution)return 1;const compatibility=activityCompatibilityFor(agent,execution.kind);return compatibility.allowed?compatibility.primaryProgressScale:1;}

  Object.assign(E,{ACTION_SCHEMA_VERSION:VERSION,actionKind,registerActivityCompatibility,listActivityCompatibility,activityCompatibilityFor,scheduleTransientExecution,transientExecutionFor,clearTransientExecution,primaryActivityProgressScale});
})();
