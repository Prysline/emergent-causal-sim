(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.actionKind)return;
  const baseValidate=V.validateState;

  function validateState(st){
    const base=baseValidate(st),issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const a of Object.values(st?.agents||{})){
      const action=a.action;if(!action)continue;
      if(!action.kind)add('action_kind_missing',`${a.name} 的 action 缺少 canonical kind。`,{agentId:a.id});
      const descriptor=Object.getOwnPropertyDescriptor(action,'intent');
      if(descriptor&&('value' in descriptor||descriptor.enumerable))add('legacy_action_intent_persistent',`${a.name} 的 action 仍把 intent 保存為 persistent data；v11.12 起應使用 kind。`,{agentId:a.id});
      if(action.intent!==action.kind)add('action_kind_alias_mismatch',`${a.name} 的 legacy intent compatibility alias 與 kind 不一致。`,{agentId:a.id,kind:action.kind,intent:action.intent});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.validateState=validateState;
})();
