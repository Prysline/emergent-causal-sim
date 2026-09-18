(() => {
  const A=window.SimWorldAuthoring;
  if(!A?.DEFAULT_WORLD_AUTHORING)throw new Error('SimWorldAuthoring must load before world-initializer.js.');
  const clone=value=>JSON.parse(JSON.stringify(value));

  function runtimePosition(position){
    if(!position)return null;
    const z=position.z??0;
    if(z!==0)throw new Error('world-authoring-v1 runtime adapter only supports z=0; received z='+z+'.');
    const out={x:position.x,y:position.y};
    if(position.spaceId!==undefined)out.spaceId=position.spaceId;
    if(position.surfaceId!==undefined)out.surfaceId=position.surfaceId;
    return out;
  }

  function singleRuntimeLayer(authoring){
    if(authoring?.authoringSchema!==A.VERSION)throw new Error('Unsupported authoringSchema: '+String(authoring?.authoringSchema));
    const layers=authoring?.map?.layers;
    if(!Array.isArray(layers)||layers.length!==1||layers[0]?.z!==0)throw new Error('world-authoring-v1 runtime adapter requires exactly one z=0 layer.');
    return layers[0];
  }

  function buildTiles(authoring){
    const layer=singleRuntimeLayer(authoring),width=authoring.map.width,height=authoring.map.height,tiles={};
    if(!Number.isInteger(width)||width<=0||!Number.isInteger(height)||height<=0)throw new Error('World authoring map width/height must be positive integers.');
    for(const [id,cell] of Object.entries(layer.cells||{})){
      const parts=id.split(','),x=Number(parts[0]),y=Number(parts[1]);
      if(parts.length!==2||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height)throw new Error('Invalid authored cell id: '+id);
      if(!cell?.terrain)throw new Error('Authored cell '+id+' is missing terrain.');
      tiles[id]={id,x,y,terrain:cell.terrain,material:cell.material??null,walkable:cell.terrain==='floor',surface:{contents:{}},roomId:null,furnitureIds:[]};
    }
    if(Object.keys(tiles).length!==width*height)throw new Error('Authored z=0 layer must define every map cell for Slice A.');
    return tiles;
  }

  function buildFurniture(authoring){
    const furniture=clone(authoring.furniture||{});
    for(const f of Object.values(furniture)){
      f.footprint=(f.footprint||[]).map(runtimePosition);
      if(f.displayAt)f.displayAt=runtimePosition(f.displayAt);
      for(const slot of f.slots||[]){
        slot.position=runtimePosition(slot.position);
        slot.furnitureId=f.id;
      }
    }
    return furniture;
  }

  function buildContainers(authoring){
    const containers=clone(authoring.entities?.containers||{});
    for(const c of Object.values(containers))if(c.position)c.position=runtimePosition(c.position);
    return containers;
  }

  function buildSources(authoring){
    const sources=clone(authoring.entities?.sources||{});
    for(const s of Object.values(sources)){
      if(s.position)s.position=runtimePosition(s.position);
      for(const port of s.interactionPorts||[])if(port.position)port.position=runtimePosition(port.position);
    }
    return sources;
  }

  function contactState(kind){
    return kind==='cat'?{paws:{}}:{hands:{},feet:{}};
  }

  function buildResidents(authoring){
    const agents={};
    for(const [id,entry] of Object.entries(authoring.residents||{})){
      const initial=entry.initial||{},placement=initial.placement;
      if(placement?.mode!=='exact'||!placement.node)throw new Error('Slice A only supports exact resident placement: '+id);
      const contacts=contactState(entry.kind);
      agents[id]={
        id:entry.id||id,
        name:entry.name||id,
        kind:entry.kind,
        position:runtimePosition(placement.node),
        needs:clone(initial.needs||{}),
        wellbeing:clone(initial.wellbeing||{}),
        status:clone(initial.status||{}),
        contacts:clone(contacts),
        causes:{intoxication:null,contacts:clone(contacts)},
        traits:clone(entry.traits||{}),
        metrics:{exertionToday:0,lastExertion:null},
        held:null,
        posture:{kind:initial.posture?.kind||'standing',slotId:null,furnitureId:null},
        action:null,
        offMap:false
      };
    }
    return agents;
  }

  function createInitialState(authoring,{seed=20260911,version,supplyTrigger=70}={}){
    const n=(Number(seed)>>>0)||20260911;
    const map={width:authoring.map.width,height:authoring.map.height,tiles:buildTiles(authoring),rooms:{},roomRevision:0};
    const lowLevel=authoring.compatibility?.passageConstraints;
    if(lowLevel&&Object.keys(lowLevel).length)map.passageConstraints=clone(lowLevel);
    const furniture=buildFurniture(authoring);
    const state={
      version,tick:0,day:authoring.scenario?.startDay??1,minute:authoring.scenario?.startMinute??12*60,seed:n,rngState:n,
      map,
      furniture,activityAreas:{},reservations:{},noiseEvents:[],endpointCauses:{},
      supply:{trigger:supplyTrigger,trips:0,totalProduced:0},
      containers:buildContainers(authoring),
      sources:buildSources(authoring),
      agents:buildResidents(authoring),
      events:[],causes:{},thoughts:{}
    };
    for(const f of Object.values(furniture))for(const p of f.footprint||[]){
      const tile=state.map.tiles[p.x+','+p.y];
      if(tile&&!tile.furnitureIds.includes(f.id))tile.furnitureIds.push(f.id);
    }
    return state;
  }

  window.SimWorldInitializer={createInitialState};
})();