(() => {
  const W=window.SimWorld,SP=window.SimSpatial,P=window.SimPhysical;if(!W||!SP?.normalizeNode||!P?.getMovementEnvelope)return;
  const VERSION='11.26.0-vertical-structure-passage';
  const FLOOR='floor';
  const finitePositive=v=>Number.isFinite(Number(v))&&Number(v)>0;
  const constrained=v=>finitePositive(v)?Number(v):null;

  function edgeAdjacent(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return false;
    return (SP.zOf?.(a)??a.z??0)===(SP.zOf?.(b)??b.z??0)&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1;
  }
  function nullableMin(values){const list=values.map(constrained).filter(v=>v!==null);return list.length?Math.min(...list):null;}
  function underConstraints(st,node){
    const n=SP.normalizeNode(st,node);if(!n||n.surfaceId!==FLOOR)return [];
    return (SP.overheadAt?.(st,n)||[]).map(f=>({
      id:f.id,
      clearanceHeight:constrained(f.spatial?.under?.clearance),
      clearanceWidth:constrained(f.spatial?.under?.clearanceWidth)
    }));
  }
  function passageConstraintKey(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return null;
    return [SP.nodeKey(st,a),SP.nodeKey(st,b)].sort().join('<->');
  }
  function explicitEdgeConstraint(st,from,to){const key=passageConstraintKey(st,from,to);return key?st.map?.passageConstraints?.[key]||null:null;}
  function structureConstraint(st,from,to){
    const structure=SP.structureBetween?.(st,from,to)||null;if(!structure)return null;
    return {
      id:structure.id,
      kind:structure.kind,
      clearanceHeight:constrained(structure.clearanceHeight),
      clearanceWidth:constrained(structure.clearanceWidth)
    };
  }
  function authoredBoundaryConstraint(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);
    if(!a||!b||a.surfaceId!==FLOOR||b.surfaceId!==FLOOR)return null;
    const boundary=SP.boundaryBetween?.(st,a,b);if(!boundary)return null;
    return {
      id:boundary.id,
      kind:boundary.kind,
      clearanceHeight:boundary.kind==='opening'?constrained(boundary.clearanceHeight):null,
      clearanceWidth:boundary.kind==='opening'?constrained(boundary.clearanceWidth):null
    };
  }
  function getPassageProfile(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return null;
    const structure=structureConstraint(st,a,b),horizontal=edgeAdjacent(st,a,b);
    if(!horizontal&&!structure)return null;
    const local=[...underConstraints(st,a),...underConstraints(st,b)],edge=explicitEdgeConstraint(st,a,b),boundary=horizontal?authoredBoundaryConstraint(st,a,b):null;
    const clearanceHeight=nullableMin([...local.map(x=>x.clearanceHeight),structure?.clearanceHeight,boundary?.clearanceHeight,edge?.clearanceHeight]);
    const clearanceWidth=nullableMin([...local.map(x=>x.clearanceWidth),structure?.clearanceWidth,boundary?.clearanceWidth,edge?.clearanceWidth]);
    return {
      from:a,
      to:b,
      edgeKind:structure?'structure':'horizontal',
      structureId:structure?.id||null,
      structureKind:structure?.kind||null,
      clearanceHeight,
      clearanceWidth,
      constrainedBy:{
        overhead:local.filter(x=>x.clearanceHeight!==null||x.clearanceWidth!==null).map(x=>x.id),
        structure:structure?.id||null,
        boundary:boundary?.id||null,
        explicitEdge:!!edge
      }
    };
  }
  function physicallyOpen(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return false;
    if(!SP.nodeWalkable(st,a,null)||!SP.nodeWalkable(st,b,null))return false;
    const structure=SP.structureBetween?.(st,a,b)||null;
    if(a.surfaceId===FLOOR&&b.surfaceId===FLOOR&&!structure&&SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,a,b))return false;
    return true;
  }
  function modeFeasibility(agent,mode,passage,edgeOpen){
    const envelope=P.getMovementEnvelope(agent,mode),failedAxes=[];
    if(!envelope)return {feasible:false,failedAxes:['envelope']};
    if(passage.edgeKind==='structure'&&passage.structureKind==='stair'&&mode!=='walk')failedAxes.push('structureMode');
    if(passage.clearanceHeight!==null&&envelope.clearanceHeight>passage.clearanceHeight)failedAxes.push('height');
    if(passage.clearanceWidth!==null&&envelope.clearanceWidth>passage.clearanceWidth)failedAxes.push('width');
    return {feasible:edgeOpen&&failedAxes.length===0,failedAxes};
  }
  function traversalFeasibility(st,agent,from,to){
    const passage=getPassageProfile(st,from,to);if(!passage)return {edgeValid:false,edgeOpen:false,passage:null,modes:{}};
    const edgeOpen=physicallyOpen(st,passage.from,passage.to),modes={};
    for(const mode of P.supportedLocomotionModes?.(agent)||[])modes[mode]=modeFeasibility(agent,mode,passage,edgeOpen);
    return {edgeValid:true,edgeOpen,passage,modes};
  }

  Object.assign(SP,{PASSAGE_PROFILE_VERSION:VERSION,passageConstraintKey,getPassageProfile,traversalFeasibility});
})();
