(() => {
  const E=window.SimEngine,W=window.SimWorld;
  if(!E||!W?.RELATIONSHIP_SCHEMA_VERSION||!E.APPRAISAL_SCHEMA_VERSION)return;
  const VERSION=W.RELATIONSHIP_SCHEMA_VERSION;
  const MIN_RELEVANCE=W.RELATIONSHIP_MIN_RELEVANCE??.15;
  const FAMILIARITY_RATE=W.RELATIONSHIP_FAMILIARITY_RATE??.08;
  const AFFINITY_RATE=W.RELATIONSHIP_AFFINITY_RATE??.10;
  const TARGET_CAP=W.RELATIONSHIP_TARGET_CAP??8;
  const WEIGHTS=W.RELATIONSHIP_ENCOUNTER_WEIGHTS||{};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;
  const OBSERVED_RULES=Object.freeze({
    acceptTalk:{roles:new Set(['target'])},
    talk:{roles:new Set(['target'])},
    briefTalkReply:{roles:new Set(['actor','target'])},
    declineTalk:{roles:new Set(['actor','target'])},
    petAnimal:{roles:new Set(['actor','target'])},
    avoidPet:{roles:new Set(['actor','target'])}
  });

  function relationshipRole(a,memory){
    const o=memory?.observed||{};
    if(o.actorId===a?.id)return 'actor';
    if(o.targetId===a?.id)return 'target';
    return null;
  }
  function relationshipEvidenceForMemory(st,a,memory){
    const p=memory?.appraisal;
    if(!a||!memory||!p)return null;
    const relevance=clamp(Number(p.relevance)||0,0,1);
    if(relevance<MIN_RELEVANCE)return null;
    if(memory.episodeKind==='privateSocialOutcome'){
      const x=memory.experienced;
      if(x?.kind!=='socialNoResponse'||!x.counterpartId||x.counterpartId===a.id||!st?.agents?.[x.counterpartId])return null;
      return {kind:'socialNoResponse',role:'requester',counterpartId:x.counterpartId,weight:Number(WEIGHTS.socialNoResponse)||.25,relevance,goalCongruence:clamp(Number(p.goalCongruence)||0,-1,1)};
    }
    const action=memory?.observed?.action||'',rule=OBSERVED_RULES[action];if(!rule)return null;
    const role=relationshipRole(a,memory);if(!role||!rule.roles.has(role))return null;
    const o=memory.observed||{},counterpartId=role==='actor'?o.targetId:o.actorId;
    if(!counterpartId||counterpartId===a.id||!st?.agents?.[counterpartId])return null;
    const weight=Number(WEIGHTS[action]);
    if(!Number.isFinite(weight)||weight<=0)return null;
    return {kind:action,role,counterpartId,weight,relevance,goalCongruence:clamp(Number(p.goalCongruence)||0,-1,1)};
  }
  function ensureRelationshipMap(a){if(!a.relationships||typeof a.relationships!=='object'||Array.isArray(a.relationships))a.relationships={};return a.relationships;}
  function relationshipEntry(a,counterpartId){return a?.relationships?.[counterpartId]||null;}
  function relationshipTargetDelta(a,counterpartId){
    const entry=relationshipEntry(a,counterpartId);if(!entry)return 0;
    const familiarity=clamp(Number(entry.familiarity)||0,0,1),affinity=clamp(Number(entry.affinity)||0,-1,1);
    return round(clamp(TARGET_CAP*familiarity*affinity,-TARGET_CAP,TARGET_CAP));
  }
  function consolidateRelationshipFromMemory(st,a,memory){
    const evidence=relationshipEvidenceForMemory(st,a,memory);if(!evidence)return null;
    const map=ensureRelationshipMap(a),before=map[evidence.counterpartId]||{familiarity:0,affinity:0,lastUpdatedTick:null};
    const familiarity=clamp(Number(before.familiarity)||0,0,1),affinity=clamp(Number(before.affinity)||0,-1,1);
    const familiarityStrength=evidence.relevance*evidence.weight;
    const nextFamiliarity=round(clamp(familiarity+FAMILIARITY_RATE*familiarityStrength*(1-familiarity),0,1));
    const signedEvidence=evidence.relevance*evidence.goalCongruence*evidence.weight;
    let affinityDelta=0;
    if(signedEvidence>0)affinityDelta=AFFINITY_RATE*signedEvidence*(1-affinity);
    else if(signedEvidence<0)affinityDelta=AFFINITY_RATE*signedEvidence*(1+affinity);
    const nextAffinity=round(clamp(affinity+affinityDelta,-1,1));
    const next={familiarity:nextFamiliarity,affinity:nextAffinity,lastUpdatedTick:Number(st?.tick)||0};
    map[evidence.counterpartId]=next;
    return {counterpartId:evidence.counterpartId,evidenceKind:evidence.kind,role:evidence.role,weight:evidence.weight,relevance:evidence.relevance,goalCongruence:evidence.goalCongruence,before:{familiarity,affinity},after:{familiarity:nextFamiliarity,affinity:nextAffinity},delta:{familiarity:round(nextFamiliarity-familiarity),affinity:round(nextAffinity-affinity)}};
  }

  if(!E.registerRuntimeHook)throw new Error('relationship-runtime-v1150.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('episodicMemoryCreated','relationship.consolidate',(ctx)=>{const result=consolidateRelationshipFromMemory(ctx.state,ctx.agent,ctx.memory);if(result)ctx.locals.relationship=result;},350);

  Object.assign(E,{RELATIONSHIP_SCHEMA_VERSION:VERSION,RELATIONSHIP_MIN_RELEVANCE:MIN_RELEVANCE,RELATIONSHIP_FAMILIARITY_RATE:FAMILIARITY_RATE,RELATIONSHIP_AFFINITY_RATE:AFFINITY_RATE,RELATIONSHIP_TARGET_CAP:TARGET_CAP,RELATIONSHIP_OBSERVED_RULES:OBSERVED_RULES,relationshipRole,relationshipEvidenceForMemory,relationshipEntry,relationshipTargetDelta,consolidateRelationshipFromMemory});
})();
