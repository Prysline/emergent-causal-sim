(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial,U=window.SimUsage;
  if(!E||!W||!SP||!U)return;
  if(typeof E.observeAgentContext!=='function'||typeof E.captureConflictResolutionEvidence!=='function')throw new Error('sleep-slot-conflict requires Agent-context observation and Decision Evidence owners.');
  const VERSION=W.DELIBERATION_SCHEMA_VERSION;
  const WAIT_TICKS=Math.max(2,Number(E.REQUESTER_PATIENCE_TICKS)||3);
  const STIMULUS=Object.freeze({attention:{kind:'sound',intensity:18},requestYield:{kind:'sound',intensity:22},driveAway:{kind:'sound',intensity:34}});
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const selfReasons=reasons=>(reasons||[]).filter(r=>r?.direction==='self'&&Number(r.signal)>0);
  const persistenceValue=reasons=>Math.min(10,selfReasons(reasons).reduce((sum,r)=>sum+(r.kind==='assignment'?8:r.kind==='claim'?5:r.kind==='habit'?4*Math.max(0,Math.min(1,Number(r.signal)||0)):0),0));

  function preferredConflicts(st,a){
    const legalIds=new Set(SP.sleepTargets(st,a).map(x=>x.id));
    return U.sleepAssociationTargets(st,a).map(entry=>{
      const availability=SP.sleepTargetAvailability(st,a,entry.target.id);
      if(legalIds.has(entry.target.id)||availability.reason!=='agentOccupied')return null;
      const occupant=availability.occupantId&&st.agents?.[availability.occupantId]||null;
      const observation=occupant?E.observeAgentContext(st,a,occupant):Object.freeze({observable:false,reason:'missing-agent'});
      return {...entry,availability:{available:false,reason:availability.reason},occupantId:occupant?.id||null,observation};
    }).filter(Boolean).sort((x,y)=>persistenceValue(y.reasons)-persistenceValue(x.reasons)||String(x.target.id).localeCompare(String(y.target.id)));
  }
  function sleepPreferredSlotConflict(st,a){return preferredConflicts(st,a)[0]||null;}
  function candidateList(st,a,conflict,legalTargets){
    if(!conflict)return[];
    const persistence=persistenceValue(conflict.reasons),noAlternate=!legalTargets.length,obs=conflict.observation,base=[];
    for(const t of legalTargets)base.push({kind:'alternate',target:{kind:'slot',id:t.id},score:40-Math.min(20,Number(t.effectiveScore??t.score)||0)-persistence*.8,contributors:[{kind:'sleepConflict',key:'legalAlternate',role:'resolution',targetId:t.id,objectiveScore:t.objectiveScore??t.score,effectiveScore:t.effectiveScore??t.score},{kind:'usageAssociation',key:'preferredPersistence',role:'modifier',value:persistence}]});
    base.push({kind:'wait',score:28+persistence*1.2+(noAlternate?10:0),contributors:[{kind:'usageAssociation',key:'preferredPersistence',role:'modifier',value:persistence},{kind:'sleepConflict',key:'noAlternate',role:'modifier',value:noAlternate?1:0}]});
    if(obs?.observable){
      base.push({kind:'attention',targetAgent:obs.targetId,score:24+persistence*1.05+(noAlternate?8:0)+(obs.observedActionKind==='sleep'?4:0),stimulus:STIMULUS.attention,contributors:[{kind:'observation',key:'occupantContext',role:'resolution',observedTick:obs.observedTick,observedAgentKind:obs.observedAgentKind,observedActionKind:obs.observedActionKind,observedPosture:obs.observedPosture},{kind:'usageAssociation',key:'preferredPersistence',role:'modifier',value:persistence}]});
      if(obs.observedAgentKind==='human'){
        base.push({kind:'requestYield',targetAgent:obs.targetId,score:25+persistence*1.25+(noAlternate?8:0),stimulus:STIMULUS.requestYield,contributors:[{kind:'observation',key:'humanOccupant',role:'resolution',observedTick:obs.observedTick},{kind:'usageAssociation',key:'preferredPersistence',role:'modifier',value:persistence}]});
        base.push({kind:'driveAway',targetAgent:obs.targetId,score:14+persistence*.8+(noAlternate?6:0),stimulus:STIMULUS.driveAway,contributors:[{kind:'observation',key:'humanOccupant',role:'resolution',observedTick:obs.observedTick},{kind:'sleepConflict',key:'confrontational',role:'modifier',value:1}]});
      }
    }
    return base.map(c=>({...c,score:c.score+E.rand(-4,4)})).sort((x,y)=>y.score-x.score||x.kind.localeCompare(y.kind));
  }
  function capture(st,a,action,conflict,candidates,selected){
    const prior=action.conflictResolutionDecisionId||null;
    return E.captureConflictResolutionEvidence(st,a,action,{preferredTarget:clone(conflict.target),associationReasons:clone(conflict.reasons),conflictReason:'agentOccupancy',observation:conflict.observation?.observable?clone(conflict.observation):null,candidates:candidates.map(c=>({kind:c.kind,target:clone(c.target)||null,targetAgent:c.targetAgent||null,score:c.score,contributors:clone(c.contributors||[])})),selected:{kind:selected.kind,target:clone(selected.target)||null,targetAgent:selected.targetAgent||null,score:selected.score},priorConflictDecisionId:prior});
  }
  function chooseSleepConflictResolution(st,a,action,legalTargets=[]){
    const conflict=sleepPreferredSlotConflict(st,a);if(!conflict)return null;
    const candidates=candidateList(st,a,conflict,legalTargets),selected=candidates[0];if(!selected)return null;
    const evidence=capture(st,a,action,conflict,candidates,selected);return {conflict,candidates,selected,evidence};
  }
  function beginSleepPreferredSlotConflict(st,a,action,legalTargets=[]){
    const resolution=chooseSleepConflictResolution(st,a,action,legalTargets);if(!resolution)return null;
    const {conflict,selected,evidence}=resolution;action.conflictPreferredSlotId=conflict.target.id;action.conflictResolutionDecisionId=evidence?.id||action.conflictResolutionDecisionId||null;
    if(selected.kind==='alternate')return {handled:true,alternateTargetId:selected.target.id,resolution};
    if(selected.kind==='wait'){action.phase='conflictWait';action.conflictWaitUntilTick=st.tick+WAIT_TICKS;action.conflictWaitSource='occupancy';return {handled:true,resolution};}
    action.phase='conflictInteract';action.conflictInteractionKind=selected.kind;action.conflictTargetAgent=selected.targetAgent;action.conflictStimulus=clone(selected.stimulus);return {handled:true,resolution};
  }
  function clearInteraction(action){delete action.conflictInteractionKind;delete action.conflictTargetAgent;delete action.conflictStimulus;}
  function stepSleepPreferredSlotConflict(st,a,action){
    if(action.phase==='conflictWait'){
      const availability=SP.sleepTargetAvailability(st,a,action.conflictPreferredSlotId);
      const until=Number(action.conflictWaitUntilTick);
      if(availability.available||!Number.isFinite(until)||st.tick>=until){action.phase='chooseSurface';return true;}
      return true;
    }
    if(action.phase!=='conflictInteract')return false;
    const target=st.agents?.[action.conflictTargetAgent];if(!target){clearInteraction(action);action.phase='chooseSurface';return true;}
    const observation=E.observeAgentContext(st,a,target);if(!observation.observable){clearInteraction(action);action.phase='chooseSurface';return true;}
    const kind=action.conflictInteractionKind,stimulus=action.conflictStimulus||STIMULUS.attention;
    if(kind==='attention')E.performAttentionInteraction(a,target,{stimulus});
    else if(kind==='requestYield'){
      const attention=E.performAttentionInteraction(a,target,{stimulus});
      E.addEvent(`${a.name}請${target.name}讓出偏好的睡眠位置。`,'normal',attention.eventId?[attention.eventId]:[],{actor:a.id,target:target.id,slot:action.conflictPreferredSlotId,action:'sleepSlotRequest',interactionPurpose:'requestYieldSleepSlot',requestKind:'yieldSleepSlot',position:E.positionRef(a.position)});
    }else if(kind==='driveAway'){
      const attention=E.performAttentionInteraction(a,target,{stimulus});
      E.addEvent(`${a.name}用較強硬的非物理方式要求${target.name}離開睡眠位置。`,'warn',attention.eventId?[attention.eventId]:[],{actor:a.id,target:target.id,slot:action.conflictPreferredSlotId,action:'sleepSlotDriveAway',interactionPurpose:'driveAwayFromSleepSlot',stimulusKind:stimulus.kind,stimulusIntensity:stimulus.intensity,physicalForce:false,position:E.positionRef(a.position)});
    }
    clearInteraction(action);action.phase='conflictWait';action.conflictWaitUntilTick=st.tick+WAIT_TICKS;action.conflictWaitSource=kind==='requestYield'?'requestResponse':'occupancy';return true;
  }
  function sleepConflictActionLabel(st,a){
    const p=a?.action;if(p?.kind!=='sleep'||!String(p.phase||'').startsWith('conflict'))return null;
    const slot=p.conflictPreferredSlotId?SP.getSlot(st,p.conflictPreferredSlotId):null,label=slot?st.furniture?.[slot.furnitureId]?.name||slot.id:'偏好的睡眠位置';
    if(p.phase==='conflictWait')return p.conflictWaitSource==='requestResponse'?`睡眠・等待占用者回應`:`睡眠・等待${label}可用`;
    if(p.conflictInteractionKind==='attention')return '睡眠・試著引起占用者注意';
    if(p.conflictInteractionKind==='requestYield')return `睡眠・要求讓出${label}`;
    if(p.conflictInteractionKind==='driveAway')return '睡眠・試著以非物理方式驅離占用者';
    return `睡眠・處理${label}占用衝突`;
  }

  E.registerActionLabelResolver?.('sleepSlotConflict.label',sleepConflictActionLabel,100);
  Object.assign(E,{SLEEP_SLOT_CONFLICT_VERSION:VERSION,SLEEP_SLOT_CONFLICT_WAIT_TICKS:WAIT_TICKS,SLEEP_SLOT_CONFLICT_STIMULUS:STIMULUS,sleepPreferredSlotConflict,chooseSleepConflictResolution,beginSleepPreferredSlotConflict,stepSleepPreferredSlotConflict});
})();