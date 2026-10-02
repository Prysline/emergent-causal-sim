(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.DELIBERATION_SCHEMA_VERSION)return;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const a of Object.values(st?.agents||{})){
      if(Object.prototype.hasOwnProperty.call(a,'commitmentCost')||Object.prototype.hasOwnProperty.call(a,'currentUtility'))add('derived_deliberation_state_persisted',`${a.name} 不應保存 commitment / utility 的 persistent mirror。`,{agentId:a.id});
      const intent=a.activeIntent,evidence=a.decisionEvidence,action=a.action;
      if(evidence!=null){
        if(typeof evidence.id!=='string'||!evidence.id.startsWith(`decision:${a.id}:`))add('decision_evidence_id_invalid',`${a.name} 的 Decision Evidence ID 無效。`,{agentId:a.id,decisionId:evidence.id});
        if(!Number.isInteger(evidence.sequence)||evidence.sequence<1)add('decision_evidence_sequence_invalid',`${a.name} 的 Decision Evidence sequence 無效。`,{agentId:a.id,sequence:evidence.sequence});
        if(!Number.isInteger(evidence.adoptedTick)||evidence.adoptedTick<0||evidence.adoptedTick>st.tick)add('decision_evidence_tick_invalid',`${a.name} 的 Decision Evidence adoptedTick 無效。`,{agentId:a.id,adoptedTick:evidence.adoptedTick});
        if(!evidence.action?.kind||!Number.isInteger(evidence.action?.started))add('decision_evidence_action_context_missing',`${a.name} 的 Decision Evidence 缺少 Action context。`,{agentId:a.id,decisionId:evidence.id});
        if(!Array.isArray(evidence.contributors))add('decision_evidence_contributors_invalid',`${a.name} 的 Decision Evidence contributors 必須是 array。`,{agentId:a.id,decisionId:evidence.id});
      }
      if(!Array.isArray(a.targetSelectionEvidence))add('target_selection_evidence_missing',`${a.name} 缺少 targetSelectionEvidence array。`,{agentId:a.id});
      else{
        const ids=new Set();
        for(const item of a.targetSelectionEvidence){
          if(!item||typeof item.id!=='string'||!item.id.startsWith(`target-decision:${a.id}:`))add('target_selection_evidence_id_invalid',`${a.name} 的 Target Selection Evidence ID 無效。`,{agentId:a.id,targetDecisionId:item?.id});
          else if(ids.has(item.id))add('target_selection_evidence_id_duplicate',`${a.name} 有重複 Target Selection Evidence ID。`,{agentId:a.id,targetDecisionId:item.id});else ids.add(item.id);
          if(!item?.parentDecisionId||item.activity!=='sleep'||item.selectedTarget?.kind!=='slot'||!item.selectedTarget?.id)add('target_selection_evidence_context_invalid',`${a.name} 的 Target Selection Evidence 缺少 parent/activity/target context。`,{agentId:a.id,targetDecisionId:item?.id});
          for(const key of ['objectiveScore','preferenceDelta','effectiveScore'])if(!Number.isFinite(item?.[key]))add('target_selection_evidence_score_invalid',`${a.name} 的 Target Selection Evidence ${key} 必須是 finite number。`,{agentId:a.id,targetDecisionId:item?.id,key});
          if(!Array.isArray(item?.contributors))add('target_selection_evidence_contributors_invalid',`${a.name} 的 Target Selection Evidence contributors 必須是 array。`,{agentId:a.id,targetDecisionId:item?.id});
        }
      }
      if(action?.decisionId){
        if(!evidence||evidence.id!==action.decisionId)add('action_decision_link_missing',`${a.name} 的 Action decisionId 沒有對應目前 Decision Evidence。`,{agentId:a.id,decisionId:action.decisionId});
        else if(typeof E.decisionEvidenceMatchesAction==='function'&&!E.decisionEvidenceMatchesAction(a))add('action_decision_context_mismatch',`${a.name} 的 Action 與 Decision Evidence context 不一致。`,{agentId:a.id,decisionId:action.decisionId});
      }
      if(!Array.isArray(a.conflictResolutionEvidence))add('conflict_resolution_evidence_missing',`${a.name} 缺少 conflictResolutionEvidence array。`,{agentId:a.id});
      else{
        const conflictIds=new Set();
        for(const item of a.conflictResolutionEvidence){
          if(!item||typeof item.id!=='string'||!item.id.startsWith(`conflict-decision:${a.id}:`))add('conflict_resolution_evidence_id_invalid',`${a.name} 的 Conflict Resolution Evidence ID 無效。`,{agentId:a.id,conflictDecisionId:item?.id});
          else if(conflictIds.has(item.id))add('conflict_resolution_evidence_id_duplicate',`${a.name} 有重複 Conflict Resolution Evidence ID。`,{agentId:a.id,conflictDecisionId:item.id});else conflictIds.add(item.id);
          if(!item?.parentDecisionId||item.activity!=='sleep'||item.preferredSlot?.kind!=='slot'||!item.preferredSlot?.id||!item.selectedResolution)add('conflict_resolution_evidence_context_invalid',`${a.name} 的 Conflict Resolution Evidence 缺少 parent/activity/preferred-slot/selection context。`,{agentId:a.id,conflictDecisionId:item?.id});
          if(!Number.isInteger(item?.evaluatedTick)||item.evaluatedTick<0||item.evaluatedTick>st.tick)add('conflict_resolution_evidence_tick_invalid',`${a.name} 的 Conflict Resolution Evidence evaluatedTick 無效。`,{agentId:a.id,conflictDecisionId:item?.id});
          if(!Array.isArray(item?.associationReasons)||!Array.isArray(item?.candidates)||!Array.isArray(item?.contributors))add('conflict_resolution_evidence_lists_invalid',`${a.name} 的 Conflict Resolution Evidence lists 必須為 array。`,{agentId:a.id,conflictDecisionId:item?.id});
          if(item?.observation?.observable===false&&Object.prototype.hasOwnProperty.call(item.observation,'targetId'))add('conflict_resolution_unobserved_target_leak',`${a.name} 的不可觀察 Conflict Evidence 不得洩漏 occupant identity。`,{agentId:a.id,conflictDecisionId:item?.id});
        }
      }
      if(action?.targetSelectionDecisionId&&typeof E.currentTargetSelectionEvidence==='function'&&!E.currentTargetSelectionEvidence(a))add('action_target_selection_link_invalid',`${a.name} 的 Action targetSelectionDecisionId 沒有對應目前 Target Selection Evidence。`,{agentId:a.id,targetDecisionId:action.targetSelectionDecisionId});
      if(action?.conflictResolutionDecisionId&&typeof E.currentConflictResolutionEvidence==='function'&&!E.currentConflictResolutionEvidence(a))add('action_conflict_resolution_link_invalid',`${a.name} 的 Action conflictResolutionDecisionId 沒有對應目前 Conflict Resolution Evidence。`,{agentId:a.id,conflictDecisionId:action.conflictResolutionDecisionId});
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
