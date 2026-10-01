(() => {
  const V=window.SimValidator,E=window.SimEngine,SP=window.SimSpatial;if(!V||!E?.USAGE_PREFERENCE_VERSION||!SP)return;
  const refKey=ref=>ref?.kind&&ref?.id?`${ref.kind}:${ref.id}`:null;
  const targetExists=(st,ref)=>ref?.kind==='slot'?!!SP.getSlot(st,ref.id):ref?.kind==='furniture'?!!st.furniture?.[ref.id]:false;
  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const [name,list] of [['usageAssignments',st?.usageAssignments],['claimEligibility',st?.claimEligibility],['usageClaims',st?.usageClaims]])if(!Array.isArray(list))add('usage_relation_state_missing',name+' must be an array.',{name});
    const assignmentKeys=new Set();
    for(const x of st?.usageAssignments||[]){
      const key=`${x?.principal?.kind}:${x?.principal?.id}|${x?.activity}|${refKey(x?.target)}`;
      if(x?.principal?.kind!=='agent'||!st.agents?.[x.principal.id]||x.activity!=='sleep'||!targetExists(st,x.target))add('usage_assignment_invalid','Runtime Usage Assignment is invalid.',{assignmentId:x?.id});
      if(assignmentKeys.has(key))add('usage_assignment_duplicate','Runtime Usage Assignment exact duplicate detected.',{assignmentId:x?.id});assignmentKeys.add(key);
    }
    const eligibleKeys=new Set();
    for(const x of st?.claimEligibility||[]){
      const key=`${x?.activity}|${refKey(x?.target)}`;
      if(x?.activity!=='sleep'||x?.target?.kind!=='slot'||!targetExists(st,x.target))add('claim_eligibility_invalid','Runtime claim eligibility is invalid.',{eligibilityId:x?.id});
      if(eligibleKeys.has(key))add('claim_eligibility_duplicate','Runtime claim eligibility exact duplicate detected.',{eligibilityId:x?.id});eligibleKeys.add(key);
    }
    const agents=new Set(),targets=new Set();
    for(const c of st?.usageClaims||[]){
      const ak=`${c?.claimant?.id}|${c?.activity}`,tk=`${refKey(c?.target)}|${c?.activity}`;
      if(c?.claimant?.kind!=='agent'||!st.agents?.[c.claimant.id]||c.activity!=='sleep'||c.role!=='primary'||c.target?.kind!=='slot'||!targetExists(st,c.target))add('usage_claim_invalid','Runtime Usage Claim is invalid.',{claimId:c?.id});
      if(agents.has(ak))add('usage_claim_agent_cardinality','Agent has more than one active primary claim for the activity.',{claimId:c?.id,agentId:c?.claimant?.id});agents.add(ak);
      if(targets.has(tk))add('usage_claim_target_cardinality','Slot has more than one active primary claimant for the activity.',{claimId:c?.id,targetId:c?.target?.id});targets.add(tk);
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('usage-preference',validateLayer,1850);
})();
