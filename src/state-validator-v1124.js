(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.DELIBERATION_SCHEMA_VERSION)return;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const a of Object.values(st?.agents||{})){
      if(Object.prototype.hasOwnProperty.call(a,'commitmentCost')||Object.prototype.hasOwnProperty.call(a,'currentUtility'))add('derived_deliberation_state_persisted',`${a.name} 不應保存 commitment / utility 的 persistent mirror。`,{agentId:a.id});
      const intent=a.activeIntent;
      if(intent&&(Object.prototype.hasOwnProperty.call(intent,'commitmentCost')||Object.prototype.hasOwnProperty.call(intent,'currentUtility')))add('derived_intent_deliberation_state_persisted',`${a.name} 的 Active Intent 不應保存 derived commitment / utility。`,{agentId:a.id,intentId:intent.id});
      if(intent?.source?.type==='softReconsideration'){
        if(!Number.isInteger(intent.source.tick)||intent.source.tick<0||intent.source.tick>st.tick)add('soft_intent_tick_invalid',`${a.name} 的 soft reconsideration tick 無效。`,{agentId:a.id,intentId:intent.id,tick:intent.source.tick});
        if(!intent.source.priorIntentId||!intent.source.priorIntentKind)add('soft_intent_source_missing',`${a.name} 的 soft reconsideration source 缺少原 Intent 資訊。`,{agentId:a.id,intentId:intent.id});
      }
    }
    for(const e of Object.values(st?.causes||{})){
      if(e?.data?.action!=='intentReconsider')continue;
      const d=e.data;
      if(!st.agents?.[d.actor])add('reconsider_event_actor_missing',`intentReconsider ${e.id} 的 actor 無效。`,{eventId:e.id,actor:d.actor});
      if(!d.priorIntentId||!d.priorIntentKind||!d.intentId||!d.intentKind||!d.nextActionKind)add('reconsider_event_fields_missing',`intentReconsider ${e.id} 缺少 Intent / Action linkage。`,{eventId:e.id});
      for(const key of ['currentUtility','challengerUtility','switchMargin','commitmentCost','switchThreshold'])if(!Number.isFinite(d[key]))add('reconsider_event_numeric_invalid',`intentReconsider ${e.id} 的 ${key} 必須是 finite number。`,{eventId:e.id,key,value:d[key]});
      if(Number.isFinite(d.currentUtility)&&Number.isFinite(d.switchMargin)&&Number.isFinite(d.commitmentCost)&&Number.isFinite(d.switchThreshold)){
        const expected=d.currentUtility+d.switchMargin+d.commitmentCost;if(Math.abs(d.switchThreshold-expected)>.0001)add('reconsider_threshold_mismatch',`intentReconsider ${e.id} 的 switchThreshold 與 derived 組成不一致。`,{eventId:e.id,expected,actual:d.switchThreshold});
      }
      if(Number.isFinite(d.challengerUtility)&&Number.isFinite(d.switchThreshold)&&!(d.challengerUtility>d.switchThreshold))add('reconsider_without_margin',`intentReconsider ${e.id} 的 challenger 沒有真正跨過 hysteresis 門檻。`,{eventId:e.id,challengerUtility:d.challengerUtility,switchThreshold:d.switchThreshold});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('deliberation',validateLayer,700);
})();
