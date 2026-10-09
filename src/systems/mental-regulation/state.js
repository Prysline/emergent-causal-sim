(() => {
  const W=window.SimWorld;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/mental-regulation/state.js requires world.js initial-state pipeline.');

  const VERSION='mental-regulation-v3';
  const NEED_KEYS=Object.freeze(['stimulation','relaxation']);
  const DEFAULT_NEEDS=Object.freeze({stimulation:0,relaxation:0});
  const ACTIVITY_PROFILES=Object.freeze({
    wander:Object.freeze({stimulationProvision:1.4,mentalLoad:.12,relaxationProvision:.5}),
    read:Object.freeze({stimulationProvision:1.8,mentalLoad:.35,relaxationProvision:.65})
  });
  const clampNeed=value=>Math.max(0,Math.min(100,Number(value)||0));

  function ensureCanonicalNeeds(agent){
    if(!agent?.needs)throw new Error('Mental Regulation requires canonical Agent.needs state.');
    if(Object.prototype.hasOwnProperty.call(agent.needs,'engagement'))throw new Error('Mental Regulation legacy engagement Need is retired; use stimulation.');
    for(const key of NEED_KEYS){
      if(agent.needs[key]===undefined)agent.needs[key]=DEFAULT_NEEDS[key];
      if(!Number.isFinite(agent.needs[key]))throw new Error(`Mental Regulation need ${key} must be finite.`);
      agent.needs[key]=clampNeed(agent.needs[key]);
    }
    return agent.needs;
  }

  function boundedEvidence(agent){
    const needs=ensureCanonicalNeeds(agent);
    return Object.freeze({stimulation:needs.stimulation/100,relaxation:needs.relaxation/100});
  }

  function decisionOptionFor(agent,activityKind='wander'){
    if(agent?.kind!=='human')return null;
    const profile=ACTIVITY_PROFILES[activityKind];if(!profile)return null;
    const evidence=boundedEvidence(agent),stimulation=agent.needs.stimulation,relaxation=agent.needs.relaxation;
    if(stimulation<=0&&relaxation<=0)return null;
    const score=6+48*evidence.stimulation+24*evidence.relaxation;
    return {
      id:activityKind,
      score,
      why:['缺乏有意義投入或需要放鬆','Mental Regulation 只提供候選 evidence；實際效果仍要等 Activity 真正執行'],
      decisionContributors:[
        {kind:'need',key:'stimulation',value:stimulation,boundedEvidence:evidence.stimulation,role:'motivation'},
        {kind:'need',key:'relaxation',value:relaxation,boundedEvidence:evidence.relaxation,role:'motivation'},
        {kind:'activityProfile',key:activityKind,role:'opportunity',stimulationProvision:profile.stimulationProvision,mentalLoad:profile.mentalLoad,relaxationProvision:profile.relaxationProvision}
      ]
    };
  }

  function applyRealizedActivityFeedback(agent,activityKind,{feedbackUnits=0}={}){
    const needs=ensureCanonicalNeeds(agent),profile=ACTIVITY_PROFILES[activityKind];
    const units=Math.max(0,Number(feedbackUnits)||0);
    if(!profile||units<=0)return {activityKind,feedbackUnits:0,stimulationDelta:0,relaxationDelta:0};
    const beforeStimulation=needs.stimulation,beforeRelaxation=needs.relaxation;
    const stimulationEffect=profile.stimulationProvision*units;
    const relaxationEffect=Math.max(0,profile.relaxationProvision-profile.mentalLoad)*units;
    needs.stimulation=clampNeed(needs.stimulation-stimulationEffect);
    needs.relaxation=clampNeed(needs.relaxation-relaxationEffect);
    return {
      activityKind,feedbackUnits:units,
      profile:{...profile},
      stimulationDelta:needs.stimulation-beforeStimulation,
      relaxationDelta:needs.relaxation-beforeRelaxation
    };
  }

  W.registerInitialStateInitializer('mentalRegulation.schema',(st)=>{
    for(const agent of Object.values(st.agents||{}))ensureCanonicalNeeds(agent);
    return st;
  },1400);
  W.MENTAL_REGULATION_SCHEMA_VERSION=VERSION;
  window.SimMentalRegulation=Object.freeze({VERSION,NEED_KEYS,DEFAULT_NEEDS,ACTIVITY_PROFILES,ensureCanonicalNeeds,boundedEvidence,decisionOptionFor,applyRealizedActivityFeedback});
})();
