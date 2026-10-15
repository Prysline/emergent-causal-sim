(() => {
  const A=window.SimWorldAuthoring,I=window.SimWorldInitializer;
  if(!A?.assertValidAuthoring||!I?.createInitialState)throw new Error('World authoring and initializer must load before standing-responsibility-initializer.js.');
  const VERSION='standing-responsibility-initializer-v1';
  const baseCreateInitialState=I.createInitialState;
  const clone=value=>JSON.parse(JSON.stringify(value));

  function createInitialState(authoring,options){
    A.assertValidAuthoring(authoring);
    const state=baseCreateInitialState(authoring,options);
    const assignments=clone(authoring.resourceResponsibilityAssignments||[]).sort((a,b)=>String(a?.id||'').localeCompare(String(b?.id||'')));
    state.resourceResponsibilityAssignments=assignments;
    for(const agent of Object.values(state.agents||{})){
      agent.knownResponsibilityAssignmentIds=assignments
        .filter(assignment=>assignment?.principal?.kind==='agent'&&assignment.principal.id===agent.id)
        .map(assignment=>assignment.id)
        .sort();
    }
    return state;
  }

  I.createInitialState=createInitialState;
  I.STANDING_RESPONSIBILITY_INITIALIZER_VERSION=VERSION;
  window.SimStandingResponsibilityInitializer={VERSION,createInitialState};
})();
