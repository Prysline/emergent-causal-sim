(() => {
  const W=window.SimWorld;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/mental-regulation/state.js requires world.js initial-state pipeline.');

  const VERSION='mental-regulation-v4';
  const NEED_KEYS=Object.freeze(['stimulation','relaxation']);
  const DEFAULT_NEEDS=Object.freeze({stimulation:0,relaxation:0});
  const AWAKE_STIMULATION_BASELINE_GAIN=.08;
  const ACTIVITY_PROFILES=Object.freeze({
    wander:Object.freeze({stimulationProvision:1.4,mentalLoad:.12,relaxationProvision:.5}),
    read:Object.freeze({stimulationProvision:1.8,mentalLoad:.35,relaxationProvision:.65})
  });
  const clampNeed=value=>Math.max(0,Math.min(100,Number(value)||0));
  const isEligibleAgent=agent=>agent?.kind==='human';

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
    if(!isEligibleAgent(agent))return null;
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

  function activityContributors(activityKind,feedbackUnits=0){
    const profile=ACTIVITY_PROFILES[activityKind],units=Math.max(0,Number(feedbackUnits)||0);
    if(!profile||units<=0)return [];
    return [
      {kind:'activity-stimulation',need:'stimulation',source:'realized-activity',activityKind,realizedUnits:units,rawContribution:-profile.stimulationProvision*units},
      {kind:'activity-mental-load',need:'relaxation',source:'realized-activity',activityKind,realizedUnits:units,rawContribution:profile.mentalLoad*units},
      {kind:'activity-relaxation',need:'relaxation',source:'realized-activity',activityKind,realizedUnits:units,rawContribution:-profile.relaxationProvision*units}
    ];
  }

  function normalizeContributor(contributor){
    if(!contributor||!NEED_KEYS.includes(contributor.need)||!Number.isFinite(Number(contributor.rawContribution)))throw new Error('Mental Regulation settlement contributor must name a canonical Need and finite rawContribution.');
    return {...contributor,rawContribution:Number(contributor.rawContribution)};
  }

  function settleMentalRegulation(agent,{awake=false,realizedActivities=[],contributors:additionalContributors=[]}={}){
    const needs=ensureCanonicalNeeds(agent),before={stimulation:needs.stimulation,relaxation:needs.relaxation};
    if(!isEligibleAgent(agent))return {eligible:false,before,after:{...before},rawDelta:{stimulation:0,relaxation:0},appliedDelta:{stimulation:0,relaxation:0},contributors:[]};
    const contributors=[];
    if(awake)contributors.push({kind:'awake-baseline',need:'stimulation',source:'awake-time',realizedUnits:1,rawContribution:AWAKE_STIMULATION_BASELINE_GAIN});
    for(const item of realizedActivities||[])contributors.push(...activityContributors(item?.activityKind,item?.feedbackUnits));
    for(const contributor of additionalContributors||[])contributors.push(normalizeContributor(contributor));
    const raw={stimulation:0,relaxation:0};
    for(const contributor of contributors)raw[contributor.need]+=Number(contributor.rawContribution)||0;
    needs.stimulation=clampNeed(before.stimulation+raw.stimulation);
    needs.relaxation=clampNeed(before.relaxation+raw.relaxation);
    const after={stimulation:needs.stimulation,relaxation:needs.relaxation};
    const appliedDelta={stimulation:after.stimulation-before.stimulation,relaxation:after.relaxation-before.relaxation};
    return {eligible:true,before,after,rawDelta:raw,appliedDelta,contributors};
  }

  W.registerInitialStateInitializer('mentalRegulation.schema',(st)=>{
    for(const agent of Object.values(st.agents||{}))ensureCanonicalNeeds(agent);
    return st;
  },1400);
  W.MENTAL_REGULATION_SCHEMA_VERSION=VERSION;
  window.SimMentalRegulation=Object.freeze({VERSION,NEED_KEYS,DEFAULT_NEEDS,AWAKE_STIMULATION_BASELINE_GAIN,ACTIVITY_PROFILES,isEligibleAgent,ensureCanonicalNeeds,boundedEvidence,decisionOptionFor,activityContributors,settleMentalRegulation});
})();
