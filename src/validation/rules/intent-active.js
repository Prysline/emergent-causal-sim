(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.intentKindForAction)return;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    const ids=new Set();
    for(const a of Object.values(st?.agents||{})){
      const intent=a.activeIntent;
      if(intent!=null){
        if(typeof intent!=='object')add('active_intent_invalid',`${a.name} 的 activeIntent 必須是 object 或 null。`,{agentId:a.id});
        else{
          if(!intent.id||typeof intent.id!=='string')add('active_intent_id_missing',`${a.name} 的 Active Intent 缺少 id。`,{agentId:a.id});
          else if(ids.has(intent.id))add('active_intent_id_duplicate',`Active Intent id ${intent.id} 重複。`,{agentId:a.id,intentId:intent.id});
          else ids.add(intent.id);
          if(!intent.kind||typeof intent.kind!=='string')add('active_intent_kind_missing',`${a.name} 的 Active Intent 缺少 kind。`,{agentId:a.id});
          if(!Number.isInteger(intent.createdTick)||intent.createdTick<0||intent.createdTick>st.tick)add('active_intent_created_tick_invalid',`${a.name} 的 Active Intent createdTick 無效。`,{agentId:a.id,createdTick:intent.createdTick});
          if(intent.source!=null){
            if(typeof intent.source!=='object'||typeof intent.source.type!=='string')add('active_intent_source_invalid',`${a.name} 的 Active Intent source 無效。`,{agentId:a.id});
            if(intent.source?.tick!=null&&(!Number.isInteger(intent.source.tick)||intent.source.tick<0||intent.source.tick>st.tick))add('active_intent_source_tick_invalid',`${a.name} 的 Active Intent source tick 無效。`,{agentId:a.id,sourceTick:intent.source?.tick});
          }
        }
      }
      if(a.action){
        if(!a.action.intentId)add('action_intent_link_missing',`${a.name} 的 live Action 尚未連到 Active Intent。`,{agentId:a.id,actionKind:a.action.kind});
        if(!intent)add('action_without_active_intent',`${a.name} 有 live Action，但沒有 Active Intent。`,{agentId:a.id,actionKind:a.action.kind});
        else if(a.action.intentId!==intent.id)add('action_intent_link_mismatch',`${a.name} 的 Action.intentId 與 Active Intent 不一致。`,{agentId:a.id,intentId:intent.id,actionIntentId:a.action.intentId});
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.registerValidationLayer('intent.active',validateLayer,400);
})();
