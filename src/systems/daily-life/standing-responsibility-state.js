(() => {
  const W=window.SimWorld,I=window.SimStandingResponsibilityInitializer;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/daily-life/standing-responsibility-state.js requires world.js initial-state pipeline.');
  if(!I?.projectInitialState)throw new Error('Standing Responsibility initial-state projection must load before systems/daily-life/standing-responsibility-state.js.');

  const VERSION='standing-responsibility-v1';
  const STANDING_RESPONSIBILITY_MAX_DECISION_DELTA=8;

  function assignmentIndex(state){
    return new Map((state?.resourceResponsibilityAssignments||[]).map(assignment=>[assignment.id,assignment]));
  }

  function knownAssignments(state,agent){
    if(!state||!agent)return[];
    const index=assignmentIndex(state),out=[];
    for(const id of agent.knownResponsibilityAssignmentIds||[]){
      const assignment=index.get(id);
      if(!assignment)throw new Error(`Known Standing Responsibility ref ${id} does not resolve to canonical World truth.`);
      if(assignment?.principal?.kind!=='agent'||assignment.principal.id!==agent.id)continue;
      out.push(assignment);
    }
    return out;
  }

  function decisionContributionForOption(state,agent,option){
    if(!state||!agent||option?.id!=='restockContainer')return null;
    const resource=option?.job?.resource||option?.resource;
    if(typeof resource!=='string'||!resource)return null;
    const assignment=knownAssignments(state,agent).find(item=>item.responsibility==='restock'&&item.scope?.resource===resource);
    if(!assignment)return null;
    return {
      scoreDelta:STANDING_RESPONSIBILITY_MAX_DECISION_DELTA,
      contributor:{
        kind:'standingResponsibility',
        key:assignment.id,
        role:'motivation',
        assignmentId:assignment.id,
        responsibility:'restock',
        resource,
        scoreDelta:STANDING_RESPONSIBILITY_MAX_DECISION_DELTA
      }
    };
  }

  function describeAssignment(assignment){
    if(assignment?.responsibility==='restock')return `補充 ${assignment.scope?.resource||'資源'}`;
    return assignment?.responsibility||assignment?.id||'未知責任';
  }

  W.registerInitialStateInitializer('standingResponsibility.schema',(state,ctx)=>I.projectInitialState(state,ctx?.authoring),1490);
  W.STANDING_RESPONSIBILITY_SCHEMA_VERSION=VERSION;
  const api={VERSION,STANDING_RESPONSIBILITY_MAX_DECISION_DELTA,knownAssignments,decisionContributionForOption,describeAssignment};
  window.SimStandingResponsibility=api;
})();
