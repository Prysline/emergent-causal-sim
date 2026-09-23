(() => {
  const W=window.SimWorld,SP=window.SimSpatial,P=window.SimPhysical,D=window.SimFurnitureDefinitions;if(!W||!SP?.normalizeNode||!P?.getMovementEnvelope||!D?.edgeClearanceOptions)return;
  const VERSION='11.28.0-positioned-passage-options';
  const FLOOR='floor',EPS=1e-9;
  const finitePositive=v=>Number.isFinite(Number(v))&&Number(v)>0;
  const constrained=v=>finitePositive(v)?Number(v):null;
  const zOf=p=>SP.zOf?.(p)??p?.z??0;

  function edgeAdjacent(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return false;
    return zOf(a)===zOf(b)&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1;
  }
  function nullableMin(values){const list=values.map(constrained).filter(v=>v!==null);return list.length?Math.min(...list):null;}
  function passageConstraintKey(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return null;
    return [SP.nodeKey(st,a),SP.nodeKey(st,b)].sort().join('<->');
  }
  function explicitEdgeConstraint(st,from,to){const key=passageConstraintKey(st,from,to);return key?st.map?.passageConstraints?.[key]||null:null;}
  function structureConstraint(st,from,to){
    const structure=SP.structureBetween?.(st,from,to)||null;if(!structure)return null;
    return {id:structure.id,kind:structure.kind,clearanceHeight:constrained(structure.clearanceHeight),clearanceWidth:constrained(structure.clearanceWidth)};
  }
  function authoredBoundaryConstraint(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);
    if(!a||!b||a.surfaceId!==FLOOR||b.surfaceId!==FLOOR)return null;
    const boundary=SP.boundaryBetween?.(st,a,b);if(!boundary)return null;
    return {id:boundary.id,kind:boundary.kind,clearanceHeight:boundary.kind==='opening'?constrained(boundary.clearanceHeight):null,clearanceWidth:boundary.kind==='opening'?constrained(boundary.clearanceWidth):null};
  }
  function centeredInterval(width){
    const value=constrained(width);if(value===null||value>=1)return null;
    const bounded=Math.min(1,value),start=(1-bounded)/2;return {start,end:start+bounded};
  }
  function intersectInterval(a,b){
    if(!a)return b?{...b}:null;if(!b)return {...a};
    const start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);return end-start>EPS?{start,end}:false;
  }
  function constrainHorizontalOptions(options,{boundary=null,explicit=null}={}){
    const widthInterval=centeredInterval(nullableMin([boundary?.clearanceWidth,explicit?.clearanceWidth]));
    const heightCap=nullableMin([boundary?.clearanceHeight,explicit?.clearanceHeight]);
    const out=[];
    for(const option of options||[]){
      const interval=intersectInterval(option.interval,widthInterval);if(interval===false)continue;
      const width=interval?interval.end-interval.start:nullableMin([option.clearanceWidth,boundary?.clearanceWidth,explicit?.clearanceWidth]);
      if(width!==null&&width<=EPS)continue;
      out.push({
        interval,
        clearanceWidth:interval?width:width,
        clearanceHeight:nullableMin([option.clearanceHeight,heightCap]),
        constrainedBy:{
          solids:[...(option.constrainedBy?.solids||[])],
          boundary:boundary?.id||null,
          explicitEdge:!!explicit
        }
      });
    }
    return out.sort((a,b)=>(a.interval?.start??-1)-(b.interval?.start??-1)||(a.interval?.end??1)-(b.interval?.end??1));
  }
  function structureOptions(structure,explicit){
    const width=nullableMin([structure?.clearanceWidth,explicit?.clearanceWidth]);
    const height=nullableMin([structure?.clearanceHeight,explicit?.clearanceHeight]);
    return [{interval:null,clearanceWidth:width,clearanceHeight:height,constrainedBy:{structure:structure?.id||null,explicitEdge:!!explicit}}];
  }
  function genericOptions(boundary,explicit){
    const width=nullableMin([boundary?.clearanceWidth,explicit?.clearanceWidth]),height=nullableMin([boundary?.clearanceHeight,explicit?.clearanceHeight]);
    const interval=centeredInterval(width);
    return [{interval,clearanceWidth:interval?interval.end-interval.start:width,clearanceHeight:height,constrainedBy:{boundary:boundary?.id||null,explicitEdge:!!explicit}}];
  }
  function getPassageProfile(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return null;
    const structure=structureConstraint(st,a,b),horizontal=edgeAdjacent(st,a,b);
    if(!horizontal&&!structure)return null;
    const explicit=explicitEdgeConstraint(st,a,b),boundary=horizontal?authoredBoundaryConstraint(st,a,b):null;
    let options;
    if(structure)options=structureOptions(structure,explicit);
    else if(a.surfaceId===FLOOR&&b.surfaceId===FLOOR){
      const geometry=D.edgeClearanceOptions(SP.furnitureSolids?.(st,zOf(a))||[],a,b,zOf(a));
      options=constrainHorizontalOptions(geometry,{boundary,explicit});
    }else options=genericOptions(boundary,explicit);
    return {
      from:a,to:b,
      edgeKind:structure?'structure':'horizontal',
      structureId:structure?.id||null,
      structureKind:structure?.kind||null,
      options,
      constrainedBy:{structure:structure?.id||null,boundary:boundary?.id||null,explicitEdge:!!explicit}
    };
  }
  function physicallyOpen(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return false;
    if(!SP.nodeWalkable(st,a,null)||!SP.nodeWalkable(st,b,null))return false;
    const structure=SP.structureBetween?.(st,a,b)||null;
    if(a.surfaceId===FLOOR&&b.surfaceId===FLOOR&&!structure&&SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,a,b))return false;
    return true;
  }
  function optionFits(envelope,option){
    if(!envelope||!option)return false;
    if(option.clearanceHeight!==null&&envelope.clearanceHeight>option.clearanceHeight+EPS)return false;
    if(option.clearanceWidth!==null&&envelope.clearanceWidth>option.clearanceWidth+EPS)return false;
    return true;
  }
  function endpointFits(st,node,agent,mode){
    const n=SP.normalizeNode(st,node);if(!n)return false;
    return n.surfaceId===FLOOR?(SP.floorNodeFitsMode?.(st,n,agent,mode)??SP.nodeWalkable(st,n,agent)):SP.nodeWalkable(st,n,agent);
  }
  function modeFeasibility(st,agent,mode,passage,edgeOpen){
    const envelope=P.getMovementEnvelope(agent,mode),failedAxes=[];
    if(!envelope)return {feasible:false,failedAxes:['envelope'],effectiveOption:null,effectiveClearanceWidth:null};
    if(passage.edgeKind==='structure'&&passage.structureKind==='stair'&&mode!=='walk')failedAxes.push('structureMode');
    if(!endpointFits(st,passage.from,agent,mode)||!endpointFits(st,passage.to,agent,mode))failedAxes.push('nodeFit');
    const feasibleOptions=(passage.options||[]).filter(option=>optionFits(envelope,option));
    if(!feasibleOptions.length){
      const widths=(passage.options||[]).map(x=>x.clearanceWidth).filter(Number.isFinite),heights=(passage.options||[]).map(x=>x.clearanceHeight).filter(Number.isFinite);
      if(widths.length&&Math.max(...widths)+EPS<envelope.clearanceWidth)failedAxes.push('width');
      if(heights.length&&Math.max(...heights)+EPS<envelope.clearanceHeight)failedAxes.push('height');
      if(!failedAxes.includes('width')&&!failedAxes.includes('height'))failedAxes.push('option');
    }
    feasibleOptions.sort((a,b)=>(b.clearanceWidth??Infinity)-(a.clearanceWidth??Infinity)||(a.interval?.start??-1)-(b.interval?.start??-1)||(b.clearanceHeight??Infinity)-(a.clearanceHeight??Infinity));
    const effectiveOption=feasibleOptions[0]||null;
    return {
      feasible:edgeOpen&&failedAxes.length===0&&!!effectiveOption,
      failedAxes:[...new Set(failedAxes)],
      effectiveOption:effectiveOption?JSON.parse(JSON.stringify(effectiveOption)):null,
      effectiveClearanceWidth:effectiveOption?.clearanceWidth??null
    };
  }
  function traversalFeasibility(st,agent,from,to){
    const passage=getPassageProfile(st,from,to);if(!passage)return {edgeValid:false,edgeOpen:false,passage:null,modes:{}};
    const edgeOpen=physicallyOpen(st,passage.from,passage.to)&&(passage.options?.length??0)>0,modes={};
    for(const mode of P.supportedLocomotionModes?.(agent)||[])modes[mode]=modeFeasibility(st,agent,mode,passage,edgeOpen);
    return {edgeValid:true,edgeOpen,passage,modes};
  }

  Object.assign(SP,{PASSAGE_PROFILE_VERSION:VERSION,passageConstraintKey,getPassageProfile,traversalFeasibility});
})();