(() => {
  const A=window.SimWorldAuthoring;
  if(!A?.assertValidAuthoring)throw new Error('World authoring must load before standing-responsibility-initializer.js.');
  const VERSION='standing-responsibility-initializer-v1';
  const clone=value=>JSON.parse(JSON.stringify(value));

  function projectInitialState(state,authoring){
    if(!state||typeof state!=='object')throw new Error('Standing Responsibility initial-state projection requires runtime state.');
    A.assertValidAuthoring(authoring);
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

  window.SimStandingResponsibilityInitializer=Object.freeze({VERSION,projectInitialState});
})();
