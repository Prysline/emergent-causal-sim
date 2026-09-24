(() => {
  const D=window.SimFurnitureDefinitions;
  if(!D?.analyzeFloorTile||!D?.edgeClearanceOptions||!D?.floorStartRects){
    throw new Error('SimFurnitureDefinitions geometry helpers must load before horizontal-geometry.js.');
  }

  const VERSION='11.29.0-horizontal-geometry-foundation';
  const EPS=1e-9;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const finitePositive=value=>Number.isFinite(Number(value))&&Number(value)>0;
  const constrained=value=>finitePositive(value)?Number(value):null;
  const zOf=p=>p?.z??0;
  const cellId=p=>p?`${p.x},${p.y}`:'?';
  const endpointKey=p=>zOf(p)===0?`${p.x},${p.y}`:`${p.x},${p.y},${zOf(p)}`;

  function compareNodes(a,b){
    return zOf(a)-zOf(b)||a.y-b.y||a.x-b.x;
  }
  function canonicalEndpoints(a,b){
    const left={x:a.x,y:a.y,z:zOf(a)},right={x:b.x,y:b.y,z:zOf(b)};
    return compareNodes(left,right)<=0?[left,right]:[right,left];
  }
  function pairKey(a,b){
    const [left,right]=canonicalEndpoints(a,b);
    return endpointKey(left)+'<->'+endpointKey(right);
  }
  function boundaryIdBetween(a,b){
    if(!a||!b||zOf(a)!==zOf(b)||Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)return null;
    if(a.y===b.y)return 'v:'+Math.max(a.x,b.x)+','+a.y;
    return 'h:'+a.x+','+Math.max(a.y,b.y);
  }
  function centeredInterval(width){
    const value=constrained(width);
    if(value===null||value>=1)return null;
    const bounded=Math.min(1,value),start=(1-bounded)/2;
    return {start,end:start+bounded};
  }
  function intersectInterval(a,b){
    if(!a)return b?{...b}:null;
    if(!b)return {...a};
    const start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);
    return end-start>EPS?{start,end}:false;
  }
  function nullableMin(values){
    const list=values.map(constrained).filter(value=>value!==null);
    return list.length?Math.min(...list):null;
  }
  function uniqueSorted(values){
    return [...new Set((values||[]).filter(Boolean))].sort();
  }
  function passageConstraint(snapshot,a,b){
    const constraints=snapshot.passageConstraints||{};
    const [left,right]=canonicalEndpoints(a,b);
    const leftKey=endpointKey(left),rightKey=endpointKey(right);
    return constraints[leftKey+'<->'+rightKey]
      ||constraints[leftKey+'>'+rightKey]
      ||constraints[rightKey+'>'+leftKey]
      ||null;
  }
  function boundaryConstraint(snapshot,a,b){
    const id=boundaryIdBetween(a,b);
    if(!id)return null;
    const boundary=snapshot.boundaries?.[id];
    return boundary?{...clone(boundary),id}:null;
  }
  function constrainCardinalOptions(options,{boundary=null,explicit=null}={}){
    const widthInterval=centeredInterval(nullableMin([boundary?.clearanceWidth,explicit?.clearanceWidth]));
    const heightCap=nullableMin([boundary?.clearanceHeight,explicit?.clearanceHeight]);
    const out=[];
    for(const source of options||[]){
      const interval=intersectInterval(source.interval,widthInterval);
      if(interval===false)continue;
      const width=interval?interval.end-interval.start:nullableMin([source.clearanceWidth,boundary?.clearanceWidth,explicit?.clearanceWidth]);
      if(width!==null&&width<=EPS)continue;
      out.push({
        interval,
        clearanceWidth:interval?width:width,
        clearanceHeight:nullableMin([source.clearanceHeight,heightCap]),
        constrainedBy:{
          solids:uniqueSorted(source.constrainedBy?.solids),
          boundary:boundary?.id||null,
          doors:uniqueSorted(boundary?.doorIds),
          explicitPassage:!!explicit
        }
      });
    }
    return out.sort((a,b)=>(a.interval?.start??-1)-(b.interval?.start??-1)||(a.interval?.end??1)-(b.interval?.end??1));
  }
  function defaultFloorGeometry(){
    return {regionCount:1,edgeIntervals:{north:[{start:0,end:1}],east:[{start:0,end:1}],south:[{start:0,end:1}],west:[{start:0,end:1}]}};
  }
  function deriveCells(snapshot){
    const cells={};
    for(const [id,source] of Object.entries(snapshot.cells||{})){
      const structuralOpen=source.structuralOpen===true;
      let analysis=defaultFloorGeometry(),geometryBlocked=false;
      if(structuralOpen){
        const cached=snapshot.floorGeometryByCell?.[id];
        const result=cached||D.analyzeFloorTile(snapshot.solids||[],source.x,source.y,zOf(source));
        analysis={regionCount:result.regionCount,edgeIntervals:clone(result.edgeIntervals)};
        geometryBlocked=result.blocked===true;
      }
      cells[id]={
        id,
        x:source.x,
        y:source.y,
        z:zOf(source),
        structuralOpen,
        staticBlocked:source.staticBlocked===true,
        geometryBlocked,
        open:structuralOpen&&source.staticBlocked!==true&&!geometryBlocked,
        floorGeometry:analysis
      };
    }
    return cells;
  }
  function edgeResource(snapshot,a,b){
    const [from,to]=canonicalEndpoints(a,b);
    const space=snapshot.spaceId||'world',surface=snapshot.surfaceId||'floor';
    return `edge:${space}|${surface}|${zOf(from)}|${from.x},${from.y}<->${to.x},${to.y}`;
  }
  function cornerCoordinates(a,b){
    return {x:Math.max(a.x,b.x),y:Math.max(a.y,b.y),z:zOf(a)};
  }
  function cornerResource(snapshot,a,b){
    const corner=cornerCoordinates(a,b),space=snapshot.spaceId||'world',surface=snapshot.surfaceId||'floor';
    return `corner:${space}|${surface}|${corner.z}|${corner.x},${corner.y}`;
  }
  function localSolidKeys(snapshot,nodes){
    const out=[];
    for(const node of nodes||[])for(const rect of D.floorStartRects(snapshot.solids||[],node.x,node.y,zOf(node)))out.push(rect.solidKey);
    return uniqueSorted(out);
  }
  function topLevelConstraints(boundary,explicit,options,localSolids=[]){
    return {
      boundary:boundary?.id||null,
      doors:uniqueSorted(boundary?.doorIds),
      explicitPassage:!!explicit,
      solids:uniqueSorted([...localSolids,...(options||[]).flatMap(option=>option.constrainedBy?.solids||[])])
    };
  }
  function deriveCardinalConnection(snapshot,cells,a,b){
    const [from,to]=canonicalEndpoints(a,b);
    const distanceMeters=Number(snapshot.cellSizeMeters)||1;
    const boundary=boundaryConstraint(snapshot,from,to),explicit=passageConstraint(snapshot,from,to);
    let options=[];
    if(cells[cellId(from)]?.open&&cells[cellId(to)]?.open&&boundary?.passable!==false&&boundary?.kind!=='wall'){
      const source=D.edgeClearanceOptions(snapshot.solids||[],from,to,zOf(from));
      options=constrainCardinalOptions(source,{boundary,explicit});
    }
    return {
      from,to,kind:'cardinal',distanceMeters,
      status:options.length?'candidate':'blocked',
      options,
      constrainedBy:topLevelConstraints(boundary,explicit,options,localSolidKeys(snapshot,[from,to])),
      resource:edgeResource(snapshot,from,to)
    };
  }
  function edgeCornerParameter(a,b,corner){
    if(a.x!==b.x){
      const base=Math.min(a.x,b.x);
      return corner.x-base;
    }
    const base=Math.min(a.y,b.y);
    return corner.y-base;
  }
  function cornerOption(option,t,cellSizeMeters){
    if(t<-EPS||t>1+EPS)return null;
    const interval=option.interval;
    let extent;
    if(!interval){
      extent=option.clearanceWidth??1;
    }else if(t<=EPS){
      if(interval.start>EPS)return null;
      extent=interval.end;
    }else{
      if(interval.end<1-EPS)return null;
      extent=1-interval.start;
    }
    extent=Math.min(Number(cellSizeMeters)||1,extent*(Number(cellSizeMeters)||1));
    if(!(extent>EPS))return null;
    return {...clone(option),cornerClearanceWidth:extent};
  }
  function cartesian(groups,index=0,current=[],out=[]){
    if(index>=groups.length){out.push([...current]);return out;}
    for(const item of groups[index]){current.push(item);cartesian(groups,index+1,current,out);current.pop();}
    return out;
  }
  function diagonalOptions(edgeEntries,corner,cellSizeMeters){
    const groups=[];
    for(const entry of edgeEntries){
      const t=edgeCornerParameter(entry.a,entry.b,corner);
      const options=(entry.connection.options||[]).map(option=>cornerOption(option,t,cellSizeMeters)).filter(Boolean);
      if(!options.length)return [];
      groups.push(options);
    }
    const out=[],seen=new Set();
    for(const combination of cartesian(groups)){
      const clearanceWidth=Math.min(...combination.map(option=>option.cornerClearanceWidth));
      const clearanceHeight=nullableMin(combination.map(option=>option.clearanceHeight));
      const constrainedBy={
        solids:uniqueSorted(combination.flatMap(option=>option.constrainedBy?.solids||[])),
        boundaries:uniqueSorted(combination.map(option=>option.constrainedBy?.boundary)),
        doors:uniqueSorted(combination.flatMap(option=>option.constrainedBy?.doors||[])),
        explicitPassage:combination.some(option=>option.constrainedBy?.explicitPassage)
      };
      const signature=JSON.stringify([Number(clearanceWidth.toFixed(9)),clearanceHeight,constrainedBy]);
      if(seen.has(signature))continue;
      seen.add(signature);
      out.push({interval:null,clearanceWidth,clearanceHeight,constrainedBy});
    }
    return out.sort((a,b)=>b.clearanceWidth-a.clearanceWidth||(b.clearanceHeight??Infinity)-(a.clearanceHeight??Infinity));
  }
  function deriveDiagonalConnection(snapshot,cells,a,b,cardinalByPair){
    const [from,to]=canonicalEndpoints(a,b),corner=cornerCoordinates(from,to);
    const horizontal={x:to.x,y:from.y,z:zOf(from)};
    const vertical={x:from.x,y:to.y,z:zOf(from)};
    const edgePairs=[[from,horizontal],[horizontal,to],[from,vertical],[vertical,to]];
    const edgeEntries=edgePairs.map(([left,right])=>({
      a:left,b:right,
      connection:cardinalByPair.get(pairKey(left,right))||deriveCardinalConnection(snapshot,cells,left,right)
    }));
    let status='candidate',options=[];
    if(edgeEntries.some(entry=>entry.connection.status==='blocked')){
      status='blocked';
    }else{
      const local=[from,to,horizontal,vertical].map(node=>cells[cellId(node)]).filter(Boolean);
      if(local.some(cell=>cell.floorGeometry?.regionCount>1)){
        status='unsupported';
      }else{
        options=diagonalOptions(edgeEntries,corner,snapshot.cellSizeMeters);
        if(!options.length)status='unsupported';
      }
    }
    return {
      from,to,kind:'diagonal',
      distanceMeters:(Number(snapshot.cellSizeMeters)||1)*Math.SQRT2,
      status,
      options:status==='candidate'?options:[],
      constrainedBy:{
        boundaries:uniqueSorted(edgeEntries.map(entry=>entry.connection.constrainedBy?.boundary)),
        doors:uniqueSorted(edgeEntries.flatMap(entry=>entry.connection.constrainedBy?.doors||[])),
        explicitPassage:edgeEntries.some(entry=>entry.connection.constrainedBy?.explicitPassage),
        solids:uniqueSorted(edgeEntries.flatMap(entry=>entry.connection.constrainedBy?.solids||[]))
      },
      resource:cornerResource(snapshot,from,to)
    };
  }

  function deriveHorizontalGeometry(snapshot){
    if(!snapshot||!Number.isInteger(snapshot.width)||!Number.isInteger(snapshot.height)||!Number.isInteger(snapshot.z)){
      throw new TypeError('Horizontal geometry snapshot requires integer width / height / z.');
    }
    const cells=deriveCells(snapshot),cardinal=[],cardinalByPair=new Map();
    const at=(x,y)=>cells[x+','+y]||null;
    for(let y=0;y<snapshot.height;y++)for(let x=0;x<snapshot.width;x++){
      const source=at(x,y);
      if(!source)continue;
      for(const [dx,dy] of [[1,0],[0,1]]){
        const target=at(x+dx,y+dy);if(!target)continue;
        const a={x,y,z:snapshot.z},b={x:x+dx,y:y+dy,z:snapshot.z};
        const connection=deriveCardinalConnection(snapshot,cells,a,b);
        cardinalByPair.set(pairKey(a,b),connection);
        if(source.structuralOpen&&target.structuralOpen)cardinal.push(connection);
      }
    }
    const diagonal=[];
    for(let y=0;y<snapshot.height;y++)for(let x=0;x<snapshot.width;x++){
      const source=at(x,y);if(!source?.structuralOpen)continue;
      for(const dx of [-1,1]){
        const target=at(x+dx,y+1);if(!target?.structuralOpen)continue;
        const a={x,y,z:snapshot.z},b={x:x+dx,y:y+1,z:snapshot.z};
        diagonal.push(deriveDiagonalConnection(snapshot,cells,a,b,cardinalByPair));
      }
    }
    const horizontalConnections=[...cardinal,...diagonal].sort((left,right)=>
      compareNodes(left.from,right.from)||compareNodes(left.to,right.to)||left.kind.localeCompare(right.kind)
    );
    return {z:snapshot.z,width:snapshot.width,height:snapshot.height,cells,horizontalConnections};
  }

  window.SimHorizontalGeometry=Object.freeze({
    VERSION,
    canonicalEndpoints,
    pairKey,
    boundaryIdBetween,
    deriveHorizontalGeometry
  });
})();
