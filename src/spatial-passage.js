(() => {
  const W=window.SimWorld,SP=window.SimSpatial,P=window.SimPhysical,D=window.SimFurnitureDefinitions,H=window.SimHorizontalGeometry;if(!W||!SP?.normalizeNode||!P?.getMovementEnvelope||!D?.edgeClearanceOptions||!H?.deriveHorizontalGeometry)return;
  const VERSION='11.29.0-horizontal-connection-passage';
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
  function runtimeHorizontalSnapshot(st,z){
    const tiles=Object.values(st.map?.tiles||{}).filter(tile=>zOf(tile)===z);
    const maxX=Math.max(-1,...tiles.map(tile=>tile.x)),maxY=Math.max(-1,...tiles.map(tile=>tile.y));
    const width=Math.max(Number(W.WIDTH)||0,maxX+1),height=Math.max(Number(W.HEIGHT)||0,maxY+1),cells={};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const tile=SP.tileAt?.(st,x,y,z),id=x+','+y;
      const fixedContainer=Object.values(st.containers||{}).some(c=>c.portable===false&&!c.supportId&&zOf(c.position)===z&&c.position?.x===x&&c.position?.y===y);
      const fixedSource=Object.values(st.sources||{}).some(source=>source.blocksMovement!==false&&zOf(source.position)===z&&source.position?.x===x&&source.position?.y===y);
      cells[id]={id,x,y,z,structuralOpen:tile?.walkable===true,staticBlocked:fixedContainer||fixedSource};
    }
    const boundaries={};
    for(const [key,boundary] of Object.entries(st.map?.boundaries||{})){
      if(!key.startsWith(z+'|'))continue;
      const id=boundary.id||key.slice(key.indexOf('|')+1);
      const doors=Object.values(st.doors||{}).filter(door=>door?.boundary?.z===z&&door?.boundary?.id===id);
      boundaries[id]={
        id,kind:boundary.kind,
        ...(finitePositive(boundary.clearanceWidth)?{clearanceWidth:Number(boundary.clearanceWidth)}:{}),
        ...(finitePositive(boundary.clearanceHeight)?{clearanceHeight:Number(boundary.clearanceHeight)}:{}),
        passable:boundary.kind==='opening'&&doors.every(door=>door.state==='open'),
        doorIds:doors.map(door=>door.id).sort()
      };
    }
    const passageConstraints={};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(const [dx,dy] of [[1,0],[0,1]]){
      const a=SP.normalizeNode(st,{x,y,z},FLOOR),b=SP.normalizeNode(st,{x:x+dx,y:y+dy,z},FLOOR);
      if(!a||!b||b.x>=width||b.y>=height)continue;
      const explicit=explicitEdgeConstraint(st,a,b);
      if(explicit)passageConstraints[H.pairKey(a,b)]={...explicit};
    }
    const floorGeometryByCell={};for(const [id,cell] of Object.entries(cells))if(cell.structuralOpen)floorGeometryByCell[id]=SP.floorGeometry(st,cell);
    const snapshot={spaceId:'world',surfaceId:FLOOR,z,width,height,cellSizeMeters:1,cells,solids:SP.furnitureSolids?.(st,z)||[],floorGeometryByCell,boundaries,passageConstraints};
    const active=SP.currentGeometryQuerySnapshot?.(st);if(active?.horizontalRuntimeSnapshots)active.horizontalRuntimeSnapshots.set(z,snapshot);
    return snapshot;
  }
  function horizontalConnection(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);
    if(!a||!b||a.surfaceId!==FLOOR||b.surfaceId!==FLOOR||zOf(a)!==zOf(b))return null;
    const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
    if(!((dx===1&&dy===0)||(dx===0&&dy===1)||(dx===1&&dy===1)))return null;
    const z=zOf(a),snapshot=SP.currentGeometryQuerySnapshot?.(st)||null;
    let geometry=snapshot?.horizontalByLayer?.get(z)||null;
    if(!geometry){const runtimeSnapshot=snapshot?.horizontalRuntimeSnapshots?.get(z)||runtimeHorizontalSnapshot(st,z);geometry=H.deriveHorizontalGeometry(runtimeSnapshot);if(snapshot?.horizontalByLayer)snapshot.horizontalByLayer.set(z,geometry);}
    const pair=H.pairKey(a,b);
    return geometry.horizontalConnections.find(connection=>H.pairKey(connection.from,connection.to)===pair)||null;
  }
  function connectionOptions(connection){
    return (connection?.options||[]).map(option=>({
      interval:option.interval?{...option.interval}:null,
      clearanceWidth:option.clearanceWidth??null,
      clearanceHeight:option.clearanceHeight??null,
      constrainedBy:{...option.constrainedBy,explicitEdge:option.constrainedBy?.explicitPassage===true}
    }));
  }
  function getPassageProfile(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return null;
    const structure=structureConstraint(st,a,b);
    if(structure){
      const explicit=explicitEdgeConstraint(st,a,b);
      return {from:a,to:b,edgeKind:'structure',structureId:structure.id,structureKind:structure.kind,options:structureOptions(structure,explicit),constrainedBy:{structure:structure.id,boundary:null,explicitEdge:!!explicit},resource:'structure:'+structure.id,distanceMeters:Math.abs(zOf(a)-zOf(b))||1,horizontalConnection:null};
    }
    if(a.surfaceId===FLOOR&&b.surfaceId===FLOOR){
      const connection=horizontalConnection(st,a,b);if(!connection)return null;
      return {
        from:a,to:b,edgeKind:'horizontal',horizontalKind:connection.kind,status:connection.status,
        structureId:null,structureKind:null,options:connectionOptions(connection),
        constrainedBy:JSON.parse(JSON.stringify(connection.constrainedBy||{})),
        resource:connection.resource,distanceMeters:connection.distanceMeters,
        horizontalConnection:JSON.parse(JSON.stringify(connection))
      };
    }
    if(!edgeAdjacent(st,a,b))return null;
    const explicit=explicitEdgeConstraint(st,a,b),boundary=authoredBoundaryConstraint(st,a,b);
    return {from:a,to:b,edgeKind:'horizontal',horizontalKind:'cardinal',status:'candidate',structureId:null,structureKind:null,options:genericOptions(boundary,explicit),constrainedBy:{structure:null,boundary:boundary?.id||null,explicitEdge:!!explicit},resource:null,distanceMeters:1,horizontalConnection:null};
  }
  function physicallyOpen(st,from,to){
    const a=SP.normalizeNode(st,from),b=SP.normalizeNode(st,to);if(!a||!b)return false;
    if(!SP.nodeWalkable(st,a,null)||!SP.nodeWalkable(st,b,null))return false;
    const structure=SP.structureBetween?.(st,a,b)||null;
    if(a.surfaceId===FLOOR&&b.surfaceId===FLOOR&&!structure){const connection=horizontalConnection(st,a,b);if(!connection||connection.status!=='candidate')return false;}
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