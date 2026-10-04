(() => {
  const SP=window.SimSpatial,A=window.SimAgentCarry;if(!SP?.nodeForAgent||!A?.projectedPosition)throw new Error('Agent carry spatial projection requires Spatial Traversal and Agent Carry.');
  const baseNodeForAgent=SP.nodeForAgent,baseDescribePlace=SP.describePlace;
  SP.nodeForAgent=(st,agent)=>{
    if(!agent)return null;
    const projected=A.projectedPosition(st,agent);
    return projected?SP.normalizeNode(st,projected):baseNodeForAgent(st,agent);
  };
  if(baseDescribePlace)SP.describePlace=(st,aOrPos)=>A.isCarried(st,aOrPos)?baseDescribePlace(st,A.projectedPosition(st,aOrPos)):baseDescribePlace(st,aOrPos);
  SP.AGENT_CARRY_POSITION_PROJECTION_VERSION=A.VERSION;
})();
