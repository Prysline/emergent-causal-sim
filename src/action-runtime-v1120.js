(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W)return;
  const VERSION=W.ACTION_SCHEMA_VERSION||'11.12.0-action-terminology';
  const baseTick=E.tick,baseReset=E.reset,baseIsSleeping=E.isSleeping,baseWakeChance=E.interactionWakeChance,baseTryWake=E.tryWakeFromInteraction,baseActionLabel=E.actionLabel;

  function actionKind(action){return action?.kind??action?.intent??null;}
  function installActionKind(action){
    if(!action||typeof action!=='object')return action;
    const legacy=action.intent;
    if(action.kind==null&&legacy!=null)action.kind=legacy;
    const descriptor=Object.getOwnPropertyDescriptor(action,'intent');
    if(descriptor)delete action.intent;
    Object.defineProperty(action,'intent',{configurable:true,enumerable:false,get(){return this.kind;},set(value){this.kind=value;}});
    return action;
  }
  function normalizeStateActions(st){for(const a of Object.values(st?.agents||{}))if(a.action)installActionKind(a.action);return st;}

  E.tick=(...args)=>{
    normalizeStateActions(E.getState());
    const result=baseTick(...args);
    normalizeStateActions(E.getState());
    return result;
  };
  E.reset=(...args)=>normalizeStateActions(baseReset(...args));
  E.isSleeping=(a)=>{if(a?.action)installActionKind(a.action);return baseIsSleeping(a);};
  E.interactionWakeChance=(a,...args)=>{if(a?.action)installActionKind(a.action);return baseWakeChance(a,...args);};
  E.tryWakeFromInteraction=(a,...args)=>{if(a?.action)installActionKind(a.action);return baseTryWake(a,...args);};
  E.actionLabel=(a)=>{if(a?.action)installActionKind(a.action);return baseActionLabel(a);};

  normalizeStateActions(E.getState());
  Object.assign(E,{ACTION_SCHEMA_VERSION:VERSION,actionKind,installActionKind,normalizeStateActions});
})();
