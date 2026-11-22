(() => {
  const W=window.SimWorld,A=window.SimWorldAuthoring;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/daily-life/tidying-state.js requires world.js initial-state pipeline.');
  if(!['world-authoring-v20','world-authoring-v21','world-authoring-v22','world-authoring-v23','world-authoring-v24','world-authoring-v25','world-authoring-v26'].includes(A?.VERSION))throw new Error('Tidying requires World Authoring v20 through v26.');
  const VERSION='tidying-put-away-v1';
  const clone=value=>JSON.parse(JSON.stringify(value));
  function project(st,{authoring}={}){
    A.assertValidAuthoring(authoring);
    st.objectStorageAssignments=clone(authoring.objectStorageAssignments||[]);
    for(const [id,agent] of Object.entries(st.agents||{})){
      agent.knownObjectStorageAssignmentIds=[...(authoring.residents?.[id]?.initial?.knownObjectStorageAssignmentIds||[])];
    }
    return st;
  }
  function knownAssignments(st,a){
    if(!a||!st)return[];
    const index=new Map((st.objectStorageAssignments||[]).map(x=>[x.id,x]));
    return (a.knownObjectStorageAssignmentIds||[]).map(id=>{
      const found=index.get(id);
      if(!found)throw new Error('Unresolved private storage assignment ref: '+id);
      return found;
    });
  }
  W.registerInitialStateInitializer('tidying.schema',project,1492);
  window.SimTidyingState=Object.freeze({VERSION,knownAssignments});
})();
