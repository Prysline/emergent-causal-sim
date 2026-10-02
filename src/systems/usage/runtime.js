(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION='11.44.0-sleep-slot-conflict';
  const PREFERENCE_CAP=10;
  const DELTA=Object.freeze({assignment:8,claim:5,habit:4,speciesActivity:2});
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const refKey=ref=>ref?.kind&&ref?.id?`${ref.kind}:${ref.id}`:null;
  const slotForRef=(st,ref)=>ref?.kind==='slot'?SP.getSlot(st,ref.id):null;

  function assignmentApplies(st,assignment,activity,targetRef){
    if(!assignment||assignment.activity!==activity||!assignment.target||!targetRef)return false;
    if(assignment.target.kind===targetRef.kind&&assignment.target.id===targetRef.id)return true;
    if(targetRef.kind==='slot'&&assignment.target.kind==='furniture'){
      const slot=slotForRef(st,targetRef);return !!slot&&slot.furnitureId===assignment.target.id;
    }
    return false;
  }
  function applicableAssignments(st,activity,targetRef){
    const all=(st?.usageAssignments||[]).filter(x=>assignmentApplies(st,x,activity,targetRef));
    if(targetRef?.kind==='slot'&&all.some(x=>x.target?.kind==='slot'))return all.filter(x=>x.target?.kind==='slot');
    return all;
  }
  const activeClaims=(st,activity='sleep')=>(st?.usageClaims||[]).filter(c=>c?.activity===activity&&c?.role==='primary');

  function associationReasons(st,a,activity,targetRef){
    const out=[],assignments=applicableAssignments(st,activity,targetRef);
    const selfAssignments=assignments.filter(x=>x.principal?.kind==='agent'&&x.principal.id===a?.id);
    if(selfAssignments.length){
      out.push({kind:'assignment',key:'assignedToSelf',role:'targetSelection',direction:'self',signal:1,sourceRefs:selfAssignments.map(x=>x.id).sort(),target:clone(targetRef)});
    }else{
      const others=assignments.filter(x=>x.principal?.kind==='agent'&&x.principal.id!==a?.id);
      if(others.length)out.push({kind:'assignment',key:'assignedToOther',role:'targetSelection',direction:'other',signal:-1,sourceRefs:others.map(x=>x.id).sort(),assigneeIds:[...new Set(others.map(x=>x.principal.id))].sort(),target:clone(targetRef)});
    }
    const claims=activeClaims(st,activity).filter(c=>refKey(c.target)===refKey(targetRef));
    const own=claims.find(c=>c.claimant?.id===a?.id),other=claims.find(c=>c.claimant?.id!==a?.id);
    if(own)out.push({kind:'claim',key:'claimedBySelf',role:'targetSelection',direction:'self',signal:1,sourceRef:own.id,target:clone(targetRef)});
    else if(other)out.push({kind:'claim',key:'claimedByOther',role:'targetSelection',direction:'other',signal:-1,sourceRef:other.id,claimantId:other.claimant?.id||null,target:clone(targetRef)});
    const habit=E.usageHabit?.(st,a,activity,targetRef);
    if(habit?.effectiveStrength>0)out.push({kind:'habit',key:'habitualForSelf',role:'targetSelection',direction:'self',signal:habit.effectiveStrength,sourceRef:habit.lastSourceMemoryId||null,target:clone(targetRef),strength:habit.effectiveStrength,lastUsedTick:habit.lastUsedTick,useCount:habit.useCount});
    return out;
  }

  function sleepAssociationTargets(st,a){
    return SP.allSlots(st).filter(slot=>slot.canSleep&&SP.slotAllows(slot,a)&&SP.slotPoseFits(slot,a,'lying')).map(slot=>{
      const target={kind:'slot',id:slot.id},reasons=selfAssociationReasons(associationReasons(st,a,'sleep',target));return reasons.length?{target,reasons}:null;
    }).filter(Boolean).sort((x,y)=>String(x.target.id).localeCompare(String(y.target.id)));
  }
  function selfAssociationReasons(reasons){return (reasons||[]).filter(r=>r?.direction==='self'&&Number(r.signal)>0);}

  function speciesActivityContributor(st,a,activity,targetRef){
    if(activity!=='sleep'||targetRef?.kind!=='slot')return null;
    const slot=slotForRef(st,targetRef),f=slot&&st.furniture?.[slot.furnitureId];
    if(a?.kind==='human'&&f?.kind==='pet-bed')return {kind:'speciesActivity',key:'humanPetBedSleep',role:'targetSelection',signal:-1,delta:-DELTA.speciesActivity,sourceRef:'species:human|activity:sleep|furnitureKind:pet-bed',target:clone(targetRef)};
    return null;
  }
  function preferenceContributors(st,a,activity,targetRef){
    const out=associationReasons(st,a,activity,targetRef).map(reason=>{
      let delta=0;
      if(reason.kind==='assignment')delta=DELTA.assignment*reason.signal;
      else if(reason.kind==='claim')delta=DELTA.claim*reason.signal;
      else if(reason.kind==='habit')delta=DELTA.habit*clamp(Number(reason.signal)||0,0,1);
      return {...reason,delta};
    });
    const species=speciesActivityContributor(st,a,activity,targetRef);if(species)out.push(species);return out;
  }
  function evaluateSleepTarget(st,a,target){
    const targetRef={kind:'slot',id:target.id},contributors=preferenceContributors(st,a,'sleep',targetRef);
    const raw=contributors.reduce((sum,c)=>sum+(Number(c.delta)||0),0),preferenceDelta=clamp(raw,-PREFERENCE_CAP,PREFERENCE_CAP),objectiveScore=Number(target.score);
    return {...target,objectiveScore,preferenceDelta,effectiveScore:objectiveScore-preferenceDelta,preferenceContributors:contributors};
  }
  function rankSleepTargets(st,a,targets=SP.sleepTargets(st,a)){
    return (targets||[]).map(t=>evaluateSleepTarget(st,a,t)).sort((x,y)=>x.effectiveScore-y.effectiveScore||x.objectiveScore-y.objectiveScore||String(x.id).localeCompare(String(y.id)));
  }

  function worldClaimEligibility(st,activity,targetRef){
    return (st?.claimEligibility||[]).find(x=>x?.activity===activity&&refKey(x.target)===refKey(targetRef))||null;
  }
  function agentClaimDecision(st,a,activity,targetRef){
    if(!a||activity!=='sleep'||targetRef?.kind!=='slot'||!SP.getSlot(st,targetRef.id))return {acquire:false,reason:'unsupportedTarget'};
    const eligibility=worldClaimEligibility(st,activity,targetRef);if(!eligibility)return {acquire:false,reason:'worldIneligible'};
    if(applicableAssignments(st,activity,targetRef).length)return {acquire:false,reason:'authoritativeAssignment',eligibility};
    const claims=activeClaims(st,activity),same=claims.find(c=>refKey(c.target)===refKey(targetRef));
    if(same)return {acquire:false,reason:same.claimant?.id===a.id?'alreadyClaimedBySelf':'claimedByOther',eligibility};
    const own=claims.find(c=>c.claimant?.id===a.id);if(own)return {acquire:false,reason:'explicitReplacementRequired',eligibility,existingClaimId:own.id};
    return {acquire:true,reason:'eligible',eligibility};
  }
  function acquireUsageClaimForSuccessfulUse(st,a,activity,targetRef,{successfulUse=false,sourceEventId=null}={}){
    if(!successfulUse)return null;const decision=agentClaimDecision(st,a,activity,targetRef);if(!decision.acquire)return null;
    st.usageClaims??=[];
    const claim={id:`usage-claim:${activity}:${a.id}:${targetRef.kind}:${targetRef.id}:${st.tick}`,claimant:{kind:'agent',id:a.id},activity,target:clone(targetRef),role:'primary',acquiredTick:st.tick,sourceEventId:sourceEventId||null,eligibilityRef:decision.eligibility?.id||null};
    st.usageClaims.push(claim);return claim;
  }
  function releaseUsageClaim(st,{claimId=null,agentId=null,activity='sleep'}={}){
    const before=(st?.usageClaims||[]).length;st.usageClaims=(st?.usageClaims||[]).filter(c=>claimId?c.id!==claimId:!(c.claimant?.id===agentId&&c.activity===activity));return before-st.usageClaims.length;
  }
  function reconcileUsageClaims(st){
    const removed=[];
    st.usageClaims=(st?.usageClaims||[]).filter(claim=>{
      if(claim?.target?.kind!=='slot'||!SP.getSlot(st,claim.target.id)){removed.push(claim);return false;}
      const assignments=applicableAssignments(st,claim.activity,claim.target);
      if(assignments.length&&!assignments.some(x=>x.principal?.kind==='agent'&&x.principal.id===claim.claimant?.id)){removed.push(claim);return false;}
      return true;
    });
    return removed;
  }

  const api={VERSION,PREFERENCE_CAP,DELTA,associationReasons,selfAssociationReasons,sleepAssociationTargets,preferenceContributors,evaluateSleepTarget,rankSleepTargets,worldClaimEligibility,agentClaimDecision,acquireUsageClaimForSuccessfulUse,releaseUsageClaim,reconcileUsageClaims,activeClaims};
  window.SimUsage=Object.freeze(api);
  E.USAGE_PREFERENCE_VERSION=VERSION;
})();
