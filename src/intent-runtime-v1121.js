(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W)return;
  const VERSION=W.INTENT_SCHEMA_VERSION||'11.12.1-active-intent-foundation';
  const INTENT_BY_ACTION={
    eat:'satisfyHunger',drinkWater:'drinkWater',drinkAlcohol:'drinkAlcohol',rest:'recoverFatigue',sleep:'sleep',
    talk:'socialize',petCat:'interactWithCat',seekHuman:'seekSocialContact',cleanFloor:'removeHazard',groom:'groom',
    wander:'explore',restockContainer:'restockResource',externalSupply:'replenishSupply'
  };
  const INTENT_ZH={
    satisfyHunger:'解決飢餓',drinkWater:'喝水',drinkAlcohol:'喝酒',recoverFatigue:'恢復活動疲勞',sleep:'睡眠',
    socialize:'進行社交',interactWithCat:'和貓互動',seekSocialContact:'尋求人類互動',removeHazard:'處理環境危險',groom:'理毛清潔',
    explore:'探索／閒晃',restockResource:'補充室內資源',replenishSupply:'外出補給'
  };

  function intentKindForAction(kind){return INTENT_BY_ACTION[kind]||kind||'unknown';}
  function intentLabel(intentOrKind){const kind=typeof intentOrKind==='string'?intentOrKind:intentOrKind?.kind;return INTENT_ZH[kind]||kind||'無';}
  function intentIdFor(a,action){const kind=E.actionKind?E.actionKind(action):action?.kind;const started=Number.isFinite(action?.started)?action.started:0;return `intent:${a.id}:${started}:${intentKindForAction(kind)}`;}
  function createIntent(st,a,action){
    const actionKind=E.actionKind?E.actionKind(action):action?.kind;
    const started=Number.isFinite(action?.started)?action.started:st.tick;
    return {id:intentIdFor(a,action),kind:intentKindForAction(actionKind),createdTick:started,lifecycle:'actionBound',source:{type:'deliberation',tick:st.thoughts?.[a.id]?.tick??started}};
  }
  function ensureIntentForAction(st,a){
    const action=a?.action;if(!action)return null;
    if(!a.activeIntent)a.activeIntent=createIntent(st,a,action);
    if(!action.intentId)action.intentId=a.activeIntent.id;
    return a.activeIntent;
  }
  function reconcileAgentIntent(st,a){
    if(a.action){ensureIntentForAction(st,a);return;}
    if(a.activeIntent?.lifecycle==='open')return;
    if(a.activeIntent)a.activeIntent=null;
  }
  function reconcileIntents(st){for(const a of Object.values(st?.agents||{}))reconcileAgentIntent(st,a);return st;}

  if(!E.registerRuntimeHook)throw new Error('intent-runtime-v1121.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','intent.reconcile-before',()=>reconcileIntents(E.getState()),1000);
  E.registerRuntimeHook('afterTick','intent.reconcile-after',()=>reconcileIntents(E.getState()),200);
  E.registerRuntimeHook('afterReset','intent.normalize-reset',()=>reconcileIntents(E.getState()),100);

  reconcileIntents(E.getState());
  Object.assign(E,{INTENT_SCHEMA_VERSION:VERSION,INTENT_BY_ACTION,INTENT_ZH,intentKindForAction,intentLabel,intentIdFor,createIntent,ensureIntentForAction,reconcileIntents});
})();
