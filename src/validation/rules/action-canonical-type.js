(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.actionKind)return;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const a of Object.values(st?.agents||{})){
      const action=a.action;if(!action)continue;
      if(!action.kind)add('action_kind_missing',`${a.name} 的 action 缺少 canonical kind。`,{agentId:a.id});
      if(Object.prototype.hasOwnProperty.call(action,'intent'))add('legacy_action_intent_present',`${a.name} 的 action 仍含有已廢除的 intent 欄位；Action type 只能使用 kind。`,{agentId:a.id});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.registerValidationLayer('action.canonical-type',validateLayer,300);
})();
