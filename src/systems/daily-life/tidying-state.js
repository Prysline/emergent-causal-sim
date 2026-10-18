(() => {
  const W=window.SimWorld,A=window.SimWorldAuthoring;
  if(!W?.registerInitialStateInitializer||A?.VERSION!=='world-authoring-v18')throw new Error('Tidying requires World initial-state pipeline and authoring v18.');
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
