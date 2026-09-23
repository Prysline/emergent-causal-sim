(() => {
  const VERSION='furniture-definitions-v6';
  const local=(x,y,z=0)=>({x,y,z});
  const clone=value=>JSON.parse(JSON.stringify(value));
  const isRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const ORIENTATIONS=Object.freeze(['north','east','south','west']);
  const ORIENTATION_INDEX=Object.freeze({north:0,east:1,south:2,west:3});

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  const DEFINITIONS={
    'dining-table':{
      id:'dining-table',
      name:'餐桌',
      icon:'▰',
      kind:'table',
      supportsObjects:true,
      footprint:[local(0,0),local(1,0),local(0,1),local(1,1)],
      displayOffset:local(0,0),
      slots:[],
      spatial:{
        solids:[
          {key:'tabletop',bounds:{x:.30,y:.61,z:.72,width:1.40,depth:.78,height:.02}},
          {key:'legNW',bounds:{x:.38,y:.69,z:0,width:.06,depth:.06,height:.72}},
          {key:'legNE',bounds:{x:1.56,y:.69,z:0,width:.06,depth:.06,height:.72}},
          {key:'legSW',bounds:{x:.38,y:1.25,z:0,width:.06,depth:.06,height:.72}},
          {key:'legSE',bounds:{x:1.56,y:1.25,z:0,width:.06,depth:.06,height:.72}}
        ],
        surface:{key:'surface',label:'餐桌桌面',onSolid:{key:'tabletop',face:'top'},traversable:true,allowKinds:['human','cat']}
      }
    },
    'chair-basic':{
      id:'chair-basic',
      name:'餐椅',
      icon:'🪑',
      kind:'chair',
      footprint:[local(0,0)],
      displayOffset:local(0,0),
      slots:[
        {key:'seat',label:'座位',offset:local(0,0),approachEdges:['north','east','west'],canRest:true,allowKinds:['human'],activitySuitability:{rest:.48}}
      ],
      spatial:{
        solids:[
          {key:'seat',bounds:{x:.29,y:.255,z:.43,width:.42,depth:.44,height:.04}},
          {key:'back',bounds:{x:.29,y:.695,z:.43,width:.42,depth:.05,height:.47}},
          {key:'frontLeftLeg',bounds:{x:.31,y:.275,z:0,width:.04,depth:.04,height:.43}},
          {key:'frontRightLeg',bounds:{x:.65,y:.275,z:0,width:.04,depth:.04,height:.43}},
          {key:'rearLeftLeg',bounds:{x:.31,y:.635,z:0,width:.04,depth:.04,height:.43}},
          {key:'rearRightLeg',bounds:{x:.65,y:.635,z:0,width:.04,depth:.04,height:.43}}
        ]
      }
    },
    'sofa-basic':{
      id:'sofa-basic',
      name:'沙發',
      icon:'🛋️',
      kind:'sofa',
      footprint:[local(0,0),local(1,0)],
      displayOffset:local(0,0),
      slots:[
        {key:'left',label:'左側',offset:local(0,0),approachEdges:['south'],canRest:true,canSleep:true,allowKinds:['human','cat'],activitySuitability:{rest:.82,sleep:.62}},
        {key:'right',label:'右側',offset:local(1,0),approachEdges:['south'],canRest:true,canSleep:true,allowKinds:['human','cat'],activitySuitability:{rest:.82,sleep:.62}}
      ],
      spatial:{
        solids:[
          {key:'base',bounds:{x:.10,y:0,z:0,width:1.80,depth:.88,height:.42}},
          {key:'back',bounds:{x:.10,y:0,z:.42,width:1.80,depth:.18,height:.38}}
        ]
      }
    },
    'double-bed':{
      id:'double-bed',
      name:'雙人床',
      icon:'🛏️',
      kind:'bed',
      footprint:[local(0,0),local(1,0),local(0,1),local(1,1)],
      displayOffset:local(0,0),
      slots:[
        {key:'left',label:'左側',offset:local(0,0),approachEdges:['west'],canRest:true,canSleep:true,restPosture:'lying',allowKinds:['human'],activitySuitability:{rest:.98,sleep:1}},
        {key:'right',label:'右側',offset:local(1,0),approachEdges:['east'],canRest:true,canSleep:true,restPosture:'lying',allowKinds:['human'],activitySuitability:{rest:.98,sleep:1}}
      ],
      spatial:{
        solids:[
          {key:'body',bounds:{x:.30,y:0,z:0,width:1.40,depth:2.00,height:.55}}
        ]
      }
    }
  };

  function assertLocalPosition(position,path){
    if(!isRecord(position)||!Number.isInteger(position.x)||!Number.isInteger(position.y)||!Number.isInteger(position.z)){
      throw new Error(path+' must contain integer x / y / z local coordinates.');
    }
  }

  function assertCostMap(costs,path){
    if(costs===undefined)return;
    if(!isRecord(costs))throw new Error(path+' must be an object keyed by agent kind.');
    for(const [kind,value] of Object.entries(costs)){
      if(!kind||!Number.isFinite(value)||value<0)throw new Error(path+' has invalid cost for '+String(kind)+'.');
    }
  }

  const CARDINAL_DIRECTIONS=new Set(ORIENTATIONS);
  const finite=value=>Number.isFinite(Number(value));
  function assertBounds(bounds,path,frame){
    if(!isRecord(bounds))throw new Error(path+' must be a bounds object.');
    for(const field of ['x','y','z','width','depth','height'])if(!finite(bounds[field]))throw new Error(path+'.'+field+' must be finite.');
    if(bounds.width<=0||bounds.depth<=0||bounds.height<=0)throw new Error(path+' width / depth / height must be positive.');
    if(bounds.x<0||bounds.y<0||bounds.z<0)throw new Error(path+' x / y / z must be non-negative.');
    if(bounds.x+bounds.width>frame.width+1e-9||bounds.y+bounds.depth>frame.height+1e-9)throw new Error(path+' horizontal projection must stay inside the footprint frame.');
  }

  function assertSpatialGeometry(definition,key){
    const spatial=definition.spatial,frame=definitionFrame(definition);
    if(!isRecord(spatial)||!Array.isArray(spatial.solids)||!spatial.solids.length)throw new Error('Furniture Definition '+key+' requires non-empty spatial.solids.');
    if(spatial.floor!==undefined||spatial.under!==undefined)throw new Error('Furniture Definition '+key+' must use spatial.solids instead of spatial.floor / spatial.under.');
    const solidKeys=new Set();
    for(let index=0;index<spatial.solids.length;index++){
      const solid=spatial.solids[index],path=key+'.spatial.solids['+index+']';
      if(!isRecord(solid)||typeof solid.key!=='string'||!solid.key||solid.key.includes(':'))throw new Error(path+' requires a stable key.');
      if(solidKeys.has(solid.key))throw new Error('Furniture Definition '+key+' duplicates solid key '+solid.key+'.');
      solidKeys.add(solid.key);assertBounds(solid.bounds,path+'.bounds',frame);
    }
    const surface=spatial.surface;
    if(surface===undefined)return;
    if(isRecord(surface)&&(Object.prototype.hasOwnProperty.call(surface,'id')||Object.prototype.hasOwnProperty.call(surface,'cells')))throw new Error('Furniture Definition '+key+' spatial.surface must not persist runtime id / cells.');
    if(!isRecord(surface)||typeof surface.key!=='string'||!surface.key||surface.key.includes(':'))throw new Error('Furniture Definition '+key+' has invalid spatial.surface.key.');
    if(typeof surface.label!=='string'||!surface.label)throw new Error('Furniture Definition '+key+' spatial.surface requires label.');
    if(!isRecord(surface.onSolid)||typeof surface.onSolid.key!=='string'||surface.onSolid.face!=='top'||!solidKeys.has(surface.onSolid.key))throw new Error('Furniture Definition '+key+' spatial.surface.onSolid must reference an existing solid top face.');
    if(typeof surface.traversable!=='boolean')throw new Error('Furniture Definition '+key+' spatial.surface.traversable must be boolean.');
    if(surface.allowKinds!==undefined&&(!Array.isArray(surface.allowKinds)||surface.allowKinds.some(kind=>typeof kind!=='string'||!kind)))throw new Error('Furniture Definition '+key+' spatial.surface.allowKinds must contain non-empty strings.');
    assertCostMap(surface.moveCost,key+'.spatial.surface.moveCost');
    assertCostMap(surface.transitionCost,key+'.spatial.surface.transitionCost');
  }

  function assertDefinition(definition,key){
    if(!isRecord(definition)||definition.id!==key)throw new Error('Furniture Definition id mismatch: '+key);
    if(Object.prototype.hasOwnProperty.call(definition,'blocksMovement'))throw new Error('Furniture Definition '+key+' must use spatial.floor.mode instead of blocksMovement.');
    if(typeof definition.name!=='string'||!definition.name)throw new Error('Furniture Definition '+key+' requires name.');
    if(typeof definition.kind!=='string'||!definition.kind)throw new Error('Furniture Definition '+key+' requires kind.');
    if(!Array.isArray(definition.footprint)||!definition.footprint.length)throw new Error('Furniture Definition '+key+' requires footprint.');
    definition.footprint.forEach((position,index)=>assertLocalPosition(position,key+'.footprint['+index+']'));
    const minX=Math.min(...definition.footprint.map(position=>position.x));
    const minY=Math.min(...definition.footprint.map(position=>position.y));
    if(minX!==0||minY!==0)throw new Error('Furniture Definition '+key+' footprint must use canonical north local frame with minX = 0 and minY = 0.');
    assertLocalPosition(definition.displayOffset,key+'.displayOffset');
    if(definition.slots!==undefined&&!Array.isArray(definition.slots))throw new Error('Furniture Definition '+key+' slots must be an array.');
    const keys=new Set();
    for(let index=0;index<(definition.slots||[]).length;index++){
      const slot=definition.slots[index];
      if(!isRecord(slot)||typeof slot.key!=='string'||!slot.key||slot.key.includes(':'))throw new Error('Furniture Definition '+key+' has invalid slot key.');
      if(keys.has(slot.key))throw new Error('Furniture Definition '+key+' duplicates slot key '+slot.key+'.');
      keys.add(slot.key);
      assertLocalPosition(slot.offset,key+'.slots['+index+'].offset');
      if(!Array.isArray(slot.approachEdges)||!slot.approachEdges.length||new Set(slot.approachEdges).size!==slot.approachEdges.length||slot.approachEdges.some(edge=>!CARDINAL_DIRECTIONS.has(edge)))throw new Error('Furniture Definition '+key+' slot '+slot.key+' requires unique cardinal approachEdges.');
      for(const activity of ['rest','sleep']){
        const value=slot.activitySuitability?.[activity];
        if(value!==undefined&&(!Number.isFinite(value)||value<0))throw new Error('Furniture Definition '+key+' has invalid '+activity+' suitability.');
      }
    }
    assertSpatialGeometry(definition,key);
  }

  for(const [key,definition] of Object.entries(DEFINITIONS))assertDefinition(definition,key);
  deepFreeze(DEFINITIONS);

  const add=(origin,offset)=>({x:origin.x+offset.x,y:origin.y+offset.y,z:origin.z+offset.z});
  const subtract=(position,origin)=>({x:position.x-origin.x,y:position.y-origin.y,z:position.z-origin.z});

  function assertOrientation(orientation,path='Furniture orientation'){
    if(!ORIENTATIONS.includes(orientation)){
      const error=new RangeError(path+' must be north / east / south / west.');
      error.code='furniture_orientation_invalid';
      throw error;
    }
  }

  function definitionFrame(definition){
    const width=Math.max(...definition.footprint.map(position=>position.x))+1;
    const height=Math.max(...definition.footprint.map(position=>position.y))+1;
    return {width,height};
  }

  function transformLocalBounds(definition,bounds,orientation){
    assertOrientation(orientation);
    const {width:W,height:D}=definitionFrame(definition),b=clone(bounds);
    if(orientation==='north')return b;
    if(orientation==='east')return {x:D-(b.y+b.depth),y:b.x,z:b.z,width:b.depth,depth:b.width,height:b.height};
    if(orientation==='south')return {x:W-(b.x+b.width),y:D-(b.y+b.depth),z:b.z,width:b.width,depth:b.depth,height:b.height};
    return {x:b.y,y:W-(b.x+b.width),z:b.z,width:b.depth,depth:b.width,height:b.height};
  }
  function metricBoundsToWorld(definition,instance,bounds){
    const oriented=transformLocalBounds(definition,bounds,instance.orientation);
    return {x:instance.origin.x+oriented.x,y:instance.origin.y+oriented.y,z:oriented.z,width:oriented.width,depth:oriented.depth,height:oriented.height};
  }
  function surfaceCellsForBounds(bounds,layerZ){
    const out=[];
    const minX=Math.floor(bounds.x),maxX=Math.ceil(bounds.x+bounds.width-1e-9);
    const minY=Math.floor(bounds.y),maxY=Math.ceil(bounds.y+bounds.depth-1e-9);
    for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){
      const overlapX=Math.min(x+1,bounds.x+bounds.width)-Math.max(x,bounds.x);
      const overlapY=Math.min(y+1,bounds.y+bounds.depth)-Math.max(y,bounds.y);
      if(overlapX>1e-9&&overlapY>1e-9)out.push({x,y,z:layerZ});
    }
    return out;
  }

  function transformLocalPosition(definition,position,orientation){
    assertLocalPosition(position,'Furniture local position');
    assertOrientation(orientation);
    const {width,height}=definitionFrame(definition);
    if(orientation==='north')return {x:position.x,y:position.y,z:position.z};
    if(orientation==='east')return {x:height-1-position.y,y:position.x,z:position.z};
    if(orientation==='south')return {x:width-1-position.x,y:height-1-position.y,z:position.z};
    return {x:position.y,y:width-1-position.x,z:position.z};
  }

  function inverseTransformLocalPosition(definition,position,orientation){
    assertLocalPosition(position,'Furniture oriented local position');
    assertOrientation(orientation);
    const {width,height}=definitionFrame(definition);
    if(orientation==='north')return {x:position.x,y:position.y,z:position.z};
    if(orientation==='east')return {x:position.y,y:height-1-position.x,z:position.z};
    if(orientation==='south')return {x:width-1-position.x,y:height-1-position.y,z:position.z};
    return {x:width-1-position.y,y:position.x,z:position.z};
  }

  function localToWorld(definition,instance,position){
    if(!isRecord(instance?.origin)||!Number.isInteger(instance.origin.x)||!Number.isInteger(instance.origin.y)||!Number.isInteger(instance.origin.z)){
      const error=new TypeError('Furniture Instance '+String(instance?.id)+' requires integer origin x / y / z.');
      error.code='furniture_instance_origin_invalid';
      throw error;
    }
    assertOrientation(instance.orientation,'Furniture Instance '+String(instance.id)+' orientation');
    return add(instance.origin,transformLocalPosition(definition,position,instance.orientation));
  }

  function worldToLocal(definition,instance,position){
    assertLocalPosition(position,'Furniture world position');
    if(!isRecord(instance?.origin)||!Number.isInteger(instance.origin.x)||!Number.isInteger(instance.origin.y)||!Number.isInteger(instance.origin.z)){
      const error=new TypeError('Furniture Instance '+String(instance?.id)+' requires integer origin x / y / z.');
      error.code='furniture_instance_origin_invalid';
      throw error;
    }
    assertOrientation(instance.orientation,'Furniture Instance '+String(instance.id)+' orientation');
    return inverseTransformLocalPosition(definition,subtract(position,instance.origin),instance.orientation);
  }

  function reorientCardinalDirection(direction,fromOrientation,toOrientation){
    assertOrientation(direction,'Furniture-local cardinal direction');
    assertOrientation(fromOrientation,'Furniture previous orientation');
    assertOrientation(toOrientation,'Furniture next orientation');
    const turns=(ORIENTATION_INDEX[toOrientation]-ORIENTATION_INDEX[fromOrientation]+4)%4;
    return ORIENTATIONS[(ORIENTATION_INDEX[direction]+turns)%4];
  }

  const EPS=1e-9;
  function mergeIntervals(intervals){
    const sorted=(intervals||[]).filter(x=>x&&x.end-x.start>EPS).map(x=>({start:Math.max(0,x.start),end:Math.min(1,x.end)})).filter(x=>x.end-x.start>EPS).sort((a,b)=>a.start-b.start||a.end-b.end);
    const out=[];
    for(const item of sorted){
      const last=out[out.length-1];
      if(last&&item.start<=last.end+EPS)last.end=Math.max(last.end,item.end);
      else out.push({...item});
    }
    return out;
  }
  function intersectIntervals(a,b){
    const out=[];
    for(const x of a||[])for(const y of b||[]){const start=Math.max(x.start,y.start),end=Math.min(x.end,y.end);if(end-start>EPS)out.push({start,end});}
    return mergeIntervals(out);
  }
  function resolvedSolidsForLayer(solids,layerZ){
    return (solids||[]).filter(solid=>solid?.layerZ===layerZ&&isRecord(solid.bounds));
  }
  function clippedRect(bounds,x,y){
    const left=Math.max(x,bounds.x),right=Math.min(x+1,bounds.x+bounds.width),top=Math.max(y,bounds.y),bottom=Math.min(y+1,bounds.y+bounds.depth);
    return right-left>EPS&&bottom-top>EPS?{left,right,top,bottom}:null;
  }
  function floorRects(solids,x,y,layerZ,height){
    const out=[];
    for(const solid of resolvedSolidsForLayer(solids,layerZ)){
      const b=solid.bounds;
      if(b.z>=height-EPS||b.z+b.height<=EPS)continue;
      const rect=clippedRect(b,x,y);if(rect)out.push({...rect,solidKey:solid.key});
    }
    return out;
  }
  function floorStartRects(solids,x,y,layerZ){
    const out=[];
    for(const solid of resolvedSolidsForLayer(solids,layerZ)){
      const b=solid.bounds;
      if(b.z>EPS||b.z+b.height<=EPS)continue;
      const rect=clippedRect(b,x,y);if(rect)out.push({...rect,solidKey:solid.key});
    }
    return out;
  }
  function analyzeFloorTile(solids,x,y,layerZ){
    const rects=floorStartRects(solids,x,y,layerZ);
    const xs=[x,x+1],ys=[y,y+1];
    for(const r of rects){xs.push(r.left,r.right);ys.push(r.top,r.bottom);}
    const X=[...new Set(xs.map(v=>Number(v.toFixed(9))))].sort((a,b)=>a-b),Y=[...new Set(ys.map(v=>Number(v.toFixed(9))))].sort((a,b)=>a-b);
    const cells=[];
    for(let iy=0;iy<Y.length-1;iy++)for(let ix=0;ix<X.length-1;ix++){
      const left=X[ix],right=X[ix+1],top=Y[iy],bottom=Y[iy+1];if(right-left<=EPS||bottom-top<=EPS)continue;
      const cx=(left+right)/2,cy=(top+bottom)/2,blocked=rects.some(r=>cx>r.left-EPS&&cx<r.right+EPS&&cy>r.top-EPS&&cy<r.bottom+EPS);
      if(!blocked)cells.push({ix,iy,left,right,top,bottom});
    }
    if(!cells.length)return {blocked:true,regionCount:0,edgeIntervals:{north:[],east:[],south:[],west:[]}};
    const byKey=new Map(cells.map(c=>[c.ix+','+c.iy,c])),seen=new Set();let regionCount=0;
    for(const cell of cells){
      const key=cell.ix+','+cell.iy;if(seen.has(key))continue;regionCount++;const queue=[cell];seen.add(key);
      while(queue.length){const cur=queue.shift();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nk=(cur.ix+dx)+','+(cur.iy+dy),next=byKey.get(nk);if(next&&!seen.has(nk)){seen.add(nk);queue.push(next);}}}
    }
    const edgeIntervals={north:[],east:[],south:[],west:[]};
    for(const c of cells){
      if(Math.abs(c.top-y)<=EPS)edgeIntervals.north.push({start:c.left-x,end:c.right-x});
      if(Math.abs(c.bottom-(y+1))<=EPS)edgeIntervals.south.push({start:c.left-x,end:c.right-x});
      if(Math.abs(c.left-x)<=EPS)edgeIntervals.west.push({start:c.top-y,end:c.bottom-y});
      if(Math.abs(c.right-(x+1))<=EPS)edgeIntervals.east.push({start:c.top-y,end:c.bottom-y});
    }
    for(const key of Object.keys(edgeIntervals))edgeIntervals[key]=mergeIntervals(edgeIntervals[key]);
    return {blocked:false,regionCount,edgeIntervals};
  }
  function envelopeFitsTile(solids,x,y,layerZ,clearanceHeight,clearanceWidth){
    if(!finite(clearanceHeight)||!finite(clearanceWidth)||clearanceHeight<=0||clearanceWidth<=0||clearanceWidth>1+EPS)return false;
    const rects=floorRects(solids,x,y,layerZ,clearanceHeight);
    const size=Number(clearanceWidth),xs=[x,x+1-size],ys=[y,y+1-size];
    for(const r of rects){xs.push(r.right,r.left-size);ys.push(r.bottom,r.top-size);}
    for(const left of xs)for(const top of ys){
      if(left<x-EPS||top<y-EPS||left+size>x+1+EPS||top+size>y+1+EPS)continue;
      const overlap=rects.some(r=>Math.min(left+size,r.right)-Math.max(left,r.left)>EPS&&Math.min(top+size,r.bottom)-Math.max(top,r.top)>EPS);
      if(!overlap)return true;
    }
    return false;
  }
  function edgeDirection(from,to){
    if(!from||!to||from.z!==to.z)return null;
    if(to.x===from.x+1&&to.y===from.y)return'east';
    if(to.x===from.x-1&&to.y===from.y)return'west';
    if(to.y===from.y+1&&to.x===from.x)return'south';
    if(to.y===from.y-1&&to.x===from.x)return'north';
    return null;
  }
  function edgeClearanceOptions(solids,from,to,layerZ){
    const direction=edgeDirection(from,to);if(!direction)return[];
    const vertical=direction==='east'||direction==='west',edge=vertical?(direction==='east'?from.x+1:from.x):(direction==='south'?from.y+1:from.y);
    const base=vertical?Math.min(from.y,to.y):Math.min(from.x,to.x),breaks=[0,1],relevant=[];
    for(const solid of resolvedSolidsForLayer(solids,layerZ)){
      const b=solid.bounds;
      const crosses=vertical?(b.x<=edge+EPS&&b.x+b.width>=edge-EPS):(b.y<=edge+EPS&&b.y+b.depth>=edge-EPS);
      if(!crosses)continue;
      const start=(vertical?b.y:b.x)-base,end=start+(vertical?b.depth:b.width);
      const a=Math.max(0,start),z=Math.min(1,end);if(z-a<=EPS)continue;
      relevant.push({start:a,end:z,bottom:b.z,key:solid.key});breaks.push(a,z);
    }
    const points=[...new Set(breaks.map(v=>Number(v.toFixed(9))))].sort((a,b)=>a-b),options=[];
    for(let i=0;i<points.length-1;i++){
      const start=points[i],end=points[i+1];if(end-start<=EPS)continue;const mid=(start+end)/2;
      const hits=relevant.filter(r=>mid>r.start-EPS&&mid<r.end+EPS),bottoms=hits.map(r=>r.bottom).filter(v=>v>=0);
      const clearanceHeight=bottoms.length?Math.min(...bottoms):null;
      if(clearanceHeight!==null&&clearanceHeight<=EPS)continue;
      options.push({interval:{start,end},clearanceWidth:end-start,clearanceHeight,constrainedBy:{solids:hits.map(r=>r.key).sort()}});
    }
    return options;
  }

  function getDefinition(definitionId){
    return DEFINITIONS[definitionId]||null;
  }

  function listDefinitions(){
    return Object.values(DEFINITIONS);
  }

  function resolveWithDefinition(definition,instance){
    if(!isRecord(instance)||typeof instance.id!=='string'||!instance.id)throw new Error('Furniture Instance requires id.');
    const origin=instance.origin;
    if(!isRecord(origin)||!Number.isInteger(origin.x)||!Number.isInteger(origin.y)||!Number.isInteger(origin.z)){
      const error=new TypeError('Furniture Instance '+instance.id+' requires integer origin x / y / z.');
      error.code='furniture_instance_origin_invalid';
      throw error;
    }
    assertOrientation(instance.orientation,'Furniture Instance '+instance.id+' orientation');
    const footprint=definition.footprint.map(offset=>localToWorld(definition,instance,offset));
    const resolved={
      id:instance.id,
      name:instance.name||definition.name,
      icon:definition.icon,
      kind:definition.kind,
      orientation:instance.orientation,
      footprint,
      displayAt:localToWorld(definition,instance,definition.displayOffset),
      slots:(definition.slots||[]).map(slot=>{
        const out={
          id:instance.id+':'+slot.key,
          label:slot.label||slot.key,
          position:localToWorld(definition,instance,slot.offset),
          approachEdges:slot.approachEdges.map(edge=>reorientCardinalDirection(edge,'north',instance.orientation))
        };
        if(slot.canRest===true)out.canRest=true;
        if(slot.canSleep===true)out.canSleep=true;
        if(slot.restPosture)out.restPosture=slot.restPosture;
        if(Array.isArray(slot.allowKinds))out.allowKinds=clone(slot.allowKinds);
        if(Number.isFinite(slot.activitySuitability?.rest))out.restQuality=slot.activitySuitability.rest;
        if(Number.isFinite(slot.activitySuitability?.sleep))out.sleepQuality=slot.activitySuitability.sleep;
        return out;
      })
    };
    if(definition.supportsObjects===true)resolved.supportsObjects=true;
    if(definition.spatial){
      resolved.spatial={solids:definition.spatial.solids.map(solid=>({key:solid.key,layerZ:instance.origin.z,bounds:metricBoundsToWorld(definition,instance,solid.bounds)}))};
      if(definition.spatial.surface){
        const source=resolved.spatial.solids.find(solid=>solid.key===definition.spatial.surface.onSolid.key);
        resolved.spatial.surface=clone(definition.spatial.surface);
        resolved.spatial.surface.id=instance.id+':'+resolved.spatial.surface.key;
        resolved.spatial.surface.cells=surfaceCellsForBounds(source.bounds,instance.origin.z);
        resolved.spatial.surface.sourceSolidKey=source.key;
        delete resolved.spatial.surface.key;
        delete resolved.spatial.surface.onSolid;
      }
    }
    return resolved;
  }

  function resolveDefinitionInstance(definition,instance){
    if(!isRecord(definition)||typeof definition.id!=='string'||!definition.id)throw new Error('Furniture Definition requires id.');
    assertDefinition(definition,definition.id);
    if(instance?.definitionId!==undefined&&instance.definitionId!==definition.id){
      throw new Error('Furniture Instance definitionId mismatch: '+String(instance.definitionId));
    }
    return resolveWithDefinition(definition,instance);
  }

  function resolveInstance(instance){
    const definition=getDefinition(instance?.definitionId);
    if(!definition){
      const error=new RangeError('Unknown Furniture Definition: '+String(instance?.definitionId));
      error.code='furniture_definition_missing';
      throw error;
    }
    return resolveWithDefinition(definition,instance);
  }

  window.SimFurnitureDefinitions=Object.freeze({
    VERSION,
    DEFINITIONS,
    ORIENTATIONS,
    definitionFrame,
    transformLocalPosition,
    inverseTransformLocalPosition,
    transformLocalBounds,
    metricBoundsToWorld,
    surfaceCellsForBounds,
    mergeIntervals,
    intersectIntervals,
    floorStartRects,
    analyzeFloorTile,
    envelopeFitsTile,
    edgeClearanceOptions,
    localToWorld,
    worldToLocal,
    reorientCardinalDirection,
    getDefinition,
    listDefinitions,
    resolveDefinitionInstance,
    resolveInstance
  });
})();