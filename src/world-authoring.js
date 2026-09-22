(() => {
  const D=window.SimFurnitureDefinitions;
  if(!D?.VERSION||!D?.getDefinition||!D?.listDefinitions||!D?.resolveInstance){
    throw new Error('SimFurnitureDefinitions must load before world-authoring.js.');
  }
  const VERSION='world-authoring-v6';
  const FURNITURE_CATALOG_VERSION=D.VERSION;
  const CELL_SIZE_METERS=1;
  const pos=(x,y,z=0)=>({x,y,z});
  const boundaryRef=(z,id)=>({z,id});

  function buildDefaultCells(){
    const cells={};
    for(let y=1;y<=6;y++)for(let x=1;x<=10;x++)cells[x+','+y]={terrain:'floor',material:'wood'};
    return cells;
  }

  function buildDefaultBoundaries(){
    const boundaries={};
    for(let x=1;x<=10;x++){
      boundaries['h:'+x+',1']={kind:'wall',material:'stone'};
      boundaries['h:'+x+',7']={kind:'wall',material:'stone'};
    }
    for(let y=1;y<=6;y++){
      boundaries['v:1,'+y]={kind:y===6?'opening':'wall',material:y===6?'wood':'stone'};
      boundaries['v:11,'+y]={kind:'wall',material:'stone'};
    }
    return boundaries;
  }

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  const DEFAULT_WORLD_AUTHORING={
    authoringSchema:VERSION,
    furnitureCatalogVersion:FURNITURE_CATALOG_VERSION,
    id:'mvp-default-house',
    label:'Current MVP Default World',
    scenario:{startDay:1,startMinute:12*60},
    map:{width:12,height:8,cellSizeMeters:CELL_SIZE_METERS,layers:[{z:0,cells:buildDefaultCells(),boundaries:buildDefaultBoundaries()}]},
    structures:{},
    furniture:{
      diningTable:{id:'diningTable',definitionId:'dining-table',origin:pos(5,2),orientation:'north'},
      chairNW:{id:'chairNW',definitionId:'chair-basic',origin:pos(4,2),orientation:'north',name:'餐椅 A'},
      chairNE:{id:'chairNE',definitionId:'chair-basic',origin:pos(7,2),orientation:'north',name:'餐椅 B'},
      chairSW:{id:'chairSW',definitionId:'chair-basic',origin:pos(4,3),orientation:'north',name:'餐椅 C'},
      chairSE:{id:'chairSE',definitionId:'chair-basic',origin:pos(7,3),orientation:'north',name:'餐椅 D'},
      sofa:{id:'sofa',definitionId:'sofa-basic',origin:pos(9,2),orientation:'north'},
      bed:{id:'bed',definitionId:'double-bed',origin:pos(9,5),orientation:'north'}
    },
    doors:{
      frontDoor:{id:'frontDoor',name:'大門',boundary:boundaryRef(0,'v:1,6'),state:'open'}
    },
    exits:{
      frontExit:{id:'frontExit',name:'大門外',kind:'offMap',boundary:boundaryRef(0,'v:1,6'),access:pos(1,6)}
    },
    entities:{
      containers:{
        mealTray:{id:'mealTray',name:'現成食物',icon:'🍲',roles:['readyFood'],capacity:100,emptyLoad:2.5,preferredResource:'food',contents:{food:68},portable:false,canEatFrom:true,access:1,position:pos(5,2),supportId:'diningTable',restock:{resource:'food',low:18,strategy:'logisticsContainer',sourceRole:'foodReserve'},interactions:{serve:{mode:'supportReach'},eatFrom:{mode:'reach'}}},
        plateA:{id:'plateA',name:'餐盤 A',icon:'🍽️',roles:['servingDish'],capacity:12,emptyLoad:.35,contents:{},portable:true,servingDish:true,canEatFrom:true,position:pos(5,2),supportId:'diningTable',interactions:{eatFrom:{mode:'reach'}}},
        plateB:{id:'plateB',name:'餐盤 B',icon:'🍽️',roles:['servingDish'],capacity:12,emptyLoad:.35,contents:{},portable:true,servingDish:true,canEatFrom:true,position:pos(6,3),supportId:'diningTable',interactions:{eatFrom:{mode:'reach'}}},
        foodPantry:{id:'foodPantry',name:'食物櫃',icon:'🗄️',roles:['foodReserve','externalSupplyDestination'],capacity:200,emptyLoad:8,preferredResource:'food',contents:{food:140},portable:false,access:1,position:pos(2,2)},
        basket:{id:'basket',name:'搬運籃',icon:'🧺',roles:['logisticsContainer'],capacity:55,emptyLoad:.8,contents:{},portable:true,transportResources:['food'],position:pos(3,2),interactions:{pickup:{mode:'occupy'},receive:{mode:'reach'},deposit:{mode:'reach'}}},
        waterBucket:{id:'waterBucket',name:'水桶',icon:'💧',roles:['waterReserve','refillable','drinkSource'],capacity:100,emptyLoad:1.3,preferredResource:'water',contents:{water:72},portable:true,canDrinkFrom:true,drinkPreference:.12,access:1,position:pos(5,5),restock:{resource:'water',low:24,strategy:'carryContainer',sourceRole:'resourceSource'},interactions:{pickup:{mode:'occupy'},drinkFrom:{mode:'reach'}}},
        cupA:{id:'cupA',name:'白色杯子',icon:'🥛',roles:['drinkVessel'],capacity:35,emptyLoad:.25,contents:{alcohol:20},portable:true,canDrinkFrom:true,drinkPreference:.95,position:pos(6,2),supportId:'diningTable'},
        cupB:{id:'cupB',name:'藍色杯子',icon:'🥛',roles:['drinkVessel'],capacity:35,emptyLoad:.25,contents:{},portable:true,canDrinkFrom:true,drinkPreference:.95,position:pos(6,3),supportId:'diningTable'},
        alcoholBottle:{id:'alcoholBottle',name:'酒瓶',icon:'🍾',roles:['drinkSource'],capacity:160,emptyLoad:.65,preferredResource:'alcohol',contents:{alcohol:120},portable:true,canDrinkFrom:true,drinkPreference:.28,position:pos(5,3),supportId:'diningTable'}
      },
      sources:{
        tap:{id:'tap',name:'水龍頭',icon:'🚰',roles:['resourceSource'],resource:'water',infinite:true,position:pos(6,5),interactions:{fill:{mode:'port'}},interactionPorts:[{id:'tap:west',label:'水龍頭左側',position:pos(5,5),edge:'east',affordances:['fill']}]}
      }
    },
    residents:{
      zhen:{id:'zhen',name:'阿真',kind:'human',traits:{alcoholLike:.25,social:.55,careful:.82,animalAffinity:.72,exertionSensitivity:.95,recoveryRate:1.05},initial:{needs:{hunger:34,thirst:29,fatigue:41,sleepNeed:34,social:38},wellbeing:{comfort:58,safety:80},status:{intoxication:0},placement:{mode:'exact',node:pos(9,3)},posture:{kind:'standing'}}},
      zhou:{id:'zhou',name:'老周',kind:'human',traits:{alcoholLike:.72,social:.32,careful:.48,animalAffinity:.46,exertionSensitivity:1.05,recoveryRate:.95},initial:{needs:{hunger:31,thirst:62,fatigue:46,sleepNeed:40,social:24},wellbeing:{comfort:55,safety:80},status:{intoxication:0},placement:{mode:'exact',node:pos(7,3)},posture:{kind:'standing'}}},
      orange:{id:'orange',name:'橘子',kind:'cat',traits:{curious:.7,careful:.62,social:.78,exertionSensitivity:.90,recoveryRate:1.10},initial:{needs:{hunger:26,thirst:22,fatigue:30,sleepNeed:44,social:28,groomingNeed:75},wellbeing:{comfort:70,safety:82},status:{intoxication:0},placement:{mode:'exact',node:pos(2,6)},posture:{kind:'standing'}}}
    }
  };

  const clone=value=>JSON.parse(JSON.stringify(value));
  const isRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const derivedMapFields=new Set(['tiles','rooms','roomRevision']);
  const derivedCellFields=new Set(['walkable','crawlOnly','roomId','furnitureIds']);
  const STRUCTURALLY_OPEN_TERRAINS=new Set(['floor']);
  const furnitureInstanceFields=new Set(['id','definitionId','origin','orientation','name']);
  const FURNITURE_ORIENTATIONS=new Set(D.ORIENTATIONS||[]);
  const BOUNDARY_ID_PATTERN=/^([vh]):(-?\d+),(-?\d+)$/;
  const BOUNDARY_KINDS=new Set(['wall','opening']);
  const DOOR_STATES=new Set(['open','closed']);
  const STRUCTURE_KINDS=new Set(['stair']);
  const structureFields=new Set(['id','kind','lower','upper','clearanceWidth','clearanceHeight']);

  function boundaryIdBetween(a,b){
    if(!a||!b||(a.z??0)!==(b.z??0)||Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)return null;
    if(a.y===b.y)return 'v:'+Math.max(a.x,b.x)+','+a.y;
    return 'h:'+a.x+','+Math.max(a.y,b.y);
  }
  function layerAt(authoring,z){return (authoring?.map?.layers||[]).find(layer=>layer.z===z)||null;}
  function boundaryAt(authoring,z,boundaryId){return layerAt(authoring,z)?.boundaries?.[boundaryId]||null;}
  function doorsForBoundary(authoring,z,boundaryId){return Object.values(authoring?.doors||{}).filter(door=>door?.boundary?.z===z&&door?.boundary?.id===boundaryId);}
  function boundaryPassable(authoring,z,boundaryId){
    const boundary=boundaryAt(authoring,z,boundaryId);
    if(!boundary)return true;
    if(boundary.kind==='wall')return false;
    if(boundary.kind!=='opening')return false;
    return doorsForBoundary(authoring,z,boundaryId).every(door=>door.state==='open');
  }
  function boundaryTouchesCell(boundaryId,position){
    const match=BOUNDARY_ID_PATTERN.exec(String(boundaryId||''));if(!match||!position)return false;
    const orientation=match[1],x=Number(match[2]),y=Number(match[3]);
    return orientation==='v'?position.y===y&&(position.x===x-1||position.x===x):position.x===x&&(position.y===y-1||position.y===y);
  }

  function resolveFurnitureInstance(instance){
    return D.resolveInstance(instance);
  }
  function listFurnitureDefinitions(){
    return D.listDefinitions();
  }
  function resolvedFurnitureMap(authoring){
    const out={};
    for(const [key,instance] of Object.entries(authoring?.furniture||{})){
      if(!isRecord(instance)||!D.getDefinition(instance.definitionId))continue;
      try{out[key]=resolveFurnitureInstance(instance);}catch{}
    }
    return out;
  }

  function authoringIssue(code,path,message,data={}){
    return {code,path,message,...data};
  }
  const samePosition=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&a.z===b.z;

  function validateAuthoring(authoring){
    const errors=[];
    if(!isRecord(authoring)){
      return {ok:false,errors:[authoringIssue('authoring_document_invalid','document','Authoring document must be an object.')]};
    }
    if(authoring.authoringSchema!==VERSION){
      errors.push(authoringIssue('authoring_schema_unsupported','authoringSchema',`Expected ${VERSION}; received ${String(authoring.authoringSchema)}.`));
    }
    if(authoring.furnitureCatalogVersion!==FURNITURE_CATALOG_VERSION){
      errors.push(authoringIssue('authoring_furniture_catalog_unsupported','furnitureCatalogVersion',`Expected ${FURNITURE_CATALOG_VERSION}; received ${String(authoring.furnitureCatalogVersion)}.`));
    }

    const map=authoring.map;
    const width=map?.width,height=map?.height;
    if(!Number.isInteger(width)||width<=0)errors.push(authoringIssue('authoring_width_invalid','map.width','map.width must be a positive integer.'));
    if(!Number.isInteger(height)||height<=0)errors.push(authoringIssue('authoring_height_invalid','map.height','map.height must be a positive integer.'));
    if(Number(map?.cellSizeMeters)!==CELL_SIZE_METERS)errors.push(authoringIssue('authoring_cell_size_invalid','map.cellSizeMeters','map.cellSizeMeters must equal '+CELL_SIZE_METERS+' for '+VERSION+'.'));
    if(isRecord(map)){
      for(const field of derivedMapFields)if(Object.prototype.hasOwnProperty.call(map,field)){
        errors.push(authoringIssue('authoring_derived_map_field',`map.${field}`,`Derived runtime field map.${field} must not be persisted in canonical authoring.`));
      }
    }

    const layers=map?.layers;
    const layerZs=new Set();
    if(!Array.isArray(layers)||layers.length===0){
      errors.push(authoringIssue('authoring_layers_invalid','map.layers','map.layers must contain at least one authored Z-level.'));
    }else{
      for(let i=0;i<layers.length;i++){
        const layer=layers[i],path=`map.layers[${i}]`;
        if(!isRecord(layer)){
          errors.push(authoringIssue('authoring_layer_invalid',path,'Each map layer must be an object.'));
          continue;
        }
        if(!Number.isInteger(layer.z)){
          errors.push(authoringIssue('authoring_layer_z_invalid',`${path}.z`,'Layer z must be an integer.'));
        }else if(layerZs.has(layer.z)){
          errors.push(authoringIssue('authoring_layer_z_duplicate',`${path}.z`,`Layer z=${layer.z} is duplicated.`,{z:layer.z}));
        }else layerZs.add(layer.z);

        if(!isRecord(layer.cells)){
          errors.push(authoringIssue('authoring_layer_cells_invalid',`${path}.cells`,'Layer cells must be an object keyed by "x,y".'));
          continue;
        }
        for(const [cellId,cell] of Object.entries(layer.cells)){
          const match=/^(-?\d+),(-?\d+)$/.exec(cellId);
          const cellPath=`${path}.cells[${JSON.stringify(cellId)}]`;
          if(!match){
            errors.push(authoringIssue('authoring_cell_id_invalid',cellPath,`Invalid authored cell id: ${cellId}`));
            continue;
          }
          const x=Number(match[1]),y=Number(match[2]);
          if(Number.isInteger(width)&&Number.isInteger(height)&&(x<0||y<0||x>=width||y>=height)){
            errors.push(authoringIssue('authoring_cell_out_of_bounds',cellPath,`Cell ${cellId} is outside ${width}×${height} map bounds.`,{x,y,z:layer.z}));
          }
          if(!isRecord(cell)){
            errors.push(authoringIssue('authoring_cell_invalid',cellPath,'Authored cell must be an object.'));
            continue;
          }
          if(typeof cell.terrain!=='string'||!cell.terrain){
            errors.push(authoringIssue('authoring_cell_terrain_missing',`${cellPath}.terrain`,'Authored cell terrain must be a non-empty string.'));
          }
          if(cell.terrain==='wall'||cell.terrain==='doorway')errors.push(authoringIssue('authoring_boundary_terrain_legacy',`${cellPath}.terrain`,'Walls and openings belong to layer boundaries in '+VERSION+'.'));
          for(const field of derivedCellFields)if(Object.prototype.hasOwnProperty.call(cell,field)){
            errors.push(authoringIssue('authoring_derived_cell_field',`${cellPath}.${field}`,`Derived runtime field ${field} must not be persisted in canonical authoring.`));
          }
        }

        if(!isRecord(layer.boundaries)){
          errors.push(authoringIssue('authoring_layer_boundaries_invalid',`${path}.boundaries`,'Each map layer must contain a boundaries object.'));
        }else{
          for(const [boundaryId,boundary] of Object.entries(layer.boundaries)){
            const boundaryPath=`${path}.boundaries[${JSON.stringify(boundaryId)}]`,match=BOUNDARY_ID_PATTERN.exec(boundaryId);
            if(!match){errors.push(authoringIssue('authoring_boundary_id_invalid',boundaryPath,'Invalid boundary id: '+boundaryId));continue;}
            const orientation=match[1],bx=Number(match[2]),by=Number(match[3]);
            const inRange=Number.isInteger(width)&&Number.isInteger(height)&&(orientation==='v'?(bx>=0&&bx<=width&&by>=0&&by<height):(bx>=0&&bx<width&&by>=0&&by<=height));
            if(!inRange)errors.push(authoringIssue('authoring_boundary_out_of_bounds',boundaryPath,'Boundary '+boundaryId+' is outside the authored grid.',{boundaryId,z:layer.z}));
            if(!isRecord(boundary)||!BOUNDARY_KINDS.has(boundary.kind)){errors.push(authoringIssue('authoring_boundary_kind_invalid',boundaryPath+'.kind','Boundary kind must be wall or opening.'));continue;}
            if(boundary.material!==undefined&&(typeof boundary.material!=='string'||!boundary.material.trim()))errors.push(authoringIssue('authoring_boundary_material_invalid',boundaryPath+'.material','Boundary material must be a non-empty string when provided.'));
            for(const field of ['thickness','height','clearanceWidth','clearanceHeight']){
              const value=boundary[field];
              if(value!==undefined&&(!Number.isFinite(Number(value))||Number(value)<=0))errors.push(authoringIssue('authoring_boundary_metric_invalid',boundaryPath+'.'+field,'Boundary '+field+' must be a positive SI-meter value.',{boundaryId,field}));
            }
          }
        }
      }
    }

    function validatePosition(position,path){
      if(!isRecord(position)){
        errors.push(authoringIssue('authoring_position_invalid',path,'Position must be an object containing integer x / y / z.'));
        return;
      }
      const z=position.z;
      if(!Number.isInteger(position.x)||!Number.isInteger(position.y)||!Number.isInteger(z)){
        errors.push(authoringIssue('authoring_position_coordinate_invalid',path,'Position x / y / z must all be integers.'));
        return;
      }
      if(Number.isInteger(width)&&Number.isInteger(height)&&(position.x<0||position.y<0||position.x>=width||position.y>=height)){
        errors.push(authoringIssue('authoring_position_out_of_bounds',path,`Position (${position.x},${position.y},${z}) is outside map bounds.`,{x:position.x,y:position.y,z}));
      }
      if(!layerZs.has(z)){
        errors.push(authoringIssue('authoring_position_layer_missing',path,`Position references missing Z-level ${z}.`,{z}));
      }
    }

    if(!isRecord(authoring.structures))errors.push(authoringIssue('authoring_structures_invalid','structures','structures must be an object.'));
    for(const [key,structure] of Object.entries(authoring.structures||{})){
      const basePath=`structures.${key}`;
      if(!isRecord(structure)){errors.push(authoringIssue('authoring_structure_invalid',basePath,'Structure entry must be an object.'));continue;}
      if(structure.id!==key)errors.push(authoringIssue('authoring_structure_id_mismatch',basePath+'.id','Structure key '+key+' does not match id '+String(structure.id)+'.'));
      if(!STRUCTURE_KINDS.has(structure.kind))errors.push(authoringIssue('authoring_structure_kind_invalid',basePath+'.kind','Current Structure kind must be stair.'));
      validatePosition(structure.lower,basePath+'.lower');
      validatePosition(structure.upper,basePath+'.upper');
      if(isRecord(structure.lower)&&isRecord(structure.upper)
        &&Number.isInteger(structure.lower.z)&&Number.isInteger(structure.upper.z)){
        if(samePosition(structure.lower,structure.upper))errors.push(authoringIssue('authoring_structure_endpoints_same',basePath,'Structure lower and upper endpoints must be different.'));
        if(structure.lower.z>=structure.upper.z)errors.push(authoringIssue('authoring_structure_vertical_order_invalid',basePath,'Structure lower.z must be below upper.z.'));
      }
      for(const field of ['clearanceWidth','clearanceHeight']){
        const value=structure[field];
        if(value!==undefined&&(!Number.isFinite(Number(value))||Number(value)<=0))errors.push(authoringIssue('authoring_structure_metric_invalid',basePath+'.'+field,'Structure '+field+' must be a positive SI-meter value.',{structureId:key,field}));
      }
      for(const field of Object.keys(structure))if(!structureFields.has(field)){
        errors.push(authoringIssue('authoring_structure_field_unsupported',basePath+'.'+field,'Structure field '+field+' is not part of compact '+VERSION+' Structure truth.',{structureId:key,field}));
      }
    }

    const slotIds=new Map();
    const resolvedFurniture={};
    for(const [key,instance] of Object.entries(authoring.furniture||{})){
      const basePath=`furniture.${key}`;
      if(!isRecord(instance)){
        errors.push(authoringIssue('authoring_furniture_invalid',basePath,'Furniture Instance must be an object.'));
        continue;
      }
      if(instance.id!==key)errors.push(authoringIssue('authoring_furniture_id_mismatch',`${basePath}.id`,`Furniture key ${key} does not match id ${String(instance.id)}.`));
      if(typeof instance.definitionId!=='string'||!instance.definitionId){
        errors.push(authoringIssue('authoring_furniture_definition_id_invalid',`${basePath}.definitionId`,'Furniture Instance definitionId must be a non-empty string.'));
      }else if(!D.getDefinition(instance.definitionId)){
        errors.push(authoringIssue('authoring_furniture_definition_missing',`${basePath}.definitionId`,`Furniture Definition ${instance.definitionId} does not exist.`,{definitionId:instance.definitionId}));
      }
      validatePosition(instance.origin,`${basePath}.origin`);
      if(!FURNITURE_ORIENTATIONS.has(instance.orientation)){
        errors.push(authoringIssue('authoring_furniture_orientation_invalid',`${basePath}.orientation`,'Furniture Instance orientation must be north / east / south / west.',{orientation:instance.orientation}));
      }
      if(instance.name!==undefined&&(typeof instance.name!=='string'||!instance.name.trim())){
        errors.push(authoringIssue('authoring_furniture_name_invalid',`${basePath}.name`,'Optional Furniture Instance name must be a non-empty string.'));
      }
      for(const field of Object.keys(instance))if(!furnitureInstanceFields.has(field)){
        errors.push(authoringIssue('authoring_furniture_instance_field_unsupported',`${basePath}.${field}`,`Furniture Instance field ${field} is not part of compact ${VERSION} ownership.`,{field}));
      }
      if(!D.getDefinition(instance.definitionId)||!isRecord(instance.origin)||!Number.isInteger(instance.origin.x)||!Number.isInteger(instance.origin.y)||!Number.isInteger(instance.origin.z)||!FURNITURE_ORIENTATIONS.has(instance.orientation))continue;
      let furniture;
      try{furniture=resolveFurnitureInstance(instance);}
      catch(error){
        errors.push(authoringIssue(error.code||'authoring_furniture_resolution_failed',basePath,error.message||String(error)));
        continue;
      }
      resolvedFurniture[key]=furniture;
      for(let i=0;i<(furniture.footprint||[]).length;i++)validatePosition(furniture.footprint[i],`${basePath}.resolvedFootprint[${i}]`);
      if(furniture.displayAt)validatePosition(furniture.displayAt,`${basePath}.resolvedDisplayAt`);
      for(let i=0;i<(furniture.slots||[]).length;i++){
        const slot=furniture.slots[i],slotPath=`${basePath}.resolvedSlots[${i}]`;
        validatePosition(slot.position,`${slotPath}.position`);
        const paths=slotIds.get(slot.id)||[];
        paths.push(slotPath);
        slotIds.set(slot.id,paths);
      }
    }
    for(const [slotId,paths] of slotIds)if(paths.length>1){
      errors.push(authoringIssue('authoring_slot_id_duplicate',paths[1],`Derived Furniture slot id ${slotId} is duplicated.`,{slotId,count:paths.length}));
    }

    for(const [key,container] of Object.entries(authoring.entities?.containers||{})){
      const basePath=`entities.containers.${key}`;
      if(!isRecord(container)){errors.push(authoringIssue('authoring_container_invalid',basePath,'Container entry must be an object.'));continue;}
      if(container.id!==undefined&&container.id!==key)errors.push(authoringIssue('authoring_container_id_mismatch',`${basePath}.id`,`Container key ${key} does not match id ${String(container.id)}.`));
      if(container.position)validatePosition(container.position,`${basePath}.position`);
      for(let i=0;i<(container.interactionPorts||[]).length;i++)if(container.interactionPorts[i]?.position)validatePosition(container.interactionPorts[i].position,`${basePath}.interactionPorts[${i}].position`);
      if(container.supportId){
        const support=resolvedFurniture[container.supportId];
        if(!support)errors.push(authoringIssue('authoring_support_missing',`${basePath}.supportId`,`Container supportId ${container.supportId} does not exist.`,{supportId:container.supportId}));
        else if(container.position&&!((support.footprint||[]).some(p=>samePosition(p,container.position)))){
          errors.push(authoringIssue('authoring_support_position_mismatch',`${basePath}.position`,`Container ${key} is positioned outside support ${container.supportId} footprint.`,{containerId:key,supportId:container.supportId}));
        }
      }
    }
    for(const [key,source] of Object.entries(authoring.entities?.sources||{})){
      const basePath=`entities.sources.${key}`;
      if(!isRecord(source)){errors.push(authoringIssue('authoring_source_invalid',basePath,'Source entry must be an object.'));continue;}
      if(source.id!==undefined&&source.id!==key)errors.push(authoringIssue('authoring_source_id_mismatch',`${basePath}.id`,`Source key ${key} does not match id ${String(source.id)}.`));
      if(source.position)validatePosition(source.position,`${basePath}.position`);
      for(let i=0;i<(source.interactionPorts||[]).length;i++)if(source.interactionPorts[i]?.position)validatePosition(source.interactionPorts[i].position,`${basePath}.interactionPorts[${i}].position`);
    }

    if(!isRecord(authoring.doors))errors.push(authoringIssue('authoring_doors_invalid','doors','doors must be an object.'));
    if(!isRecord(authoring.exits))errors.push(authoringIssue('authoring_exits_invalid','exits','exits must be an object.'));
    const doorBoundaries=new Set();
    for(const [key,door] of Object.entries(authoring.doors||{})){
      const basePath='doors.'+key;
      if(!isRecord(door)){errors.push(authoringIssue('authoring_door_invalid',basePath,'Door entry must be an object.'));continue;}
      if(door.id!==key)errors.push(authoringIssue('authoring_door_id_mismatch',basePath+'.id','Door key '+key+' does not match id '+String(door.id)+'.'));
      if(door.name!==undefined&&(typeof door.name!=='string'||!door.name.trim()))errors.push(authoringIssue('authoring_door_name_invalid',basePath+'.name','Door name must be a non-empty string when provided.'));
      if(!DOOR_STATES.has(door.state))errors.push(authoringIssue('authoring_door_state_invalid',basePath+'.state','Door state must be open or closed.'));
      const ref=door.boundary;
      if(!isRecord(ref)||!Number.isInteger(ref.z)||typeof ref.id!=='string'){errors.push(authoringIssue('authoring_door_boundary_invalid',basePath+'.boundary','Door boundary must contain integer z and boundary id.'));continue;}
      const boundary=boundaryAt(authoring,ref.z,ref.id);
      if(!boundary)errors.push(authoringIssue('authoring_door_boundary_missing',basePath+'.boundary','Door '+key+' references a missing boundary.',{boundaryId:ref.id,z:ref.z}));
      else if(boundary.kind!=='opening')errors.push(authoringIssue('authoring_door_boundary_not_opening',basePath+'.boundary','Door '+key+' must reference an opening boundary.'));
      const boundaryKey=ref.z+':'+ref.id;
      if(doorBoundaries.has(boundaryKey))errors.push(authoringIssue('authoring_door_boundary_duplicate',basePath+'.boundary','Only one Door may own an opening boundary.',{boundaryId:ref.id,z:ref.z}));
      doorBoundaries.add(boundaryKey);
    }

    for(const [key,exit] of Object.entries(authoring.exits||{})){
      const basePath='exits.'+key;
      if(!isRecord(exit)){errors.push(authoringIssue('authoring_exit_invalid',basePath,'Exit entry must be an object.'));continue;}
      if(exit.id!==key)errors.push(authoringIssue('authoring_exit_id_mismatch',basePath+'.id','Exit key '+key+' does not match id '+String(exit.id)+'.'));
      if(exit.kind!=='offMap')errors.push(authoringIssue('authoring_exit_kind_invalid',basePath+'.kind','Current world exits must use kind offMap.'));
      if(exit.name!==undefined&&(typeof exit.name!=='string'||!exit.name.trim()))errors.push(authoringIssue('authoring_exit_name_invalid',basePath+'.name','Exit name must be a non-empty string when provided.'));
      const ref=exit.boundary;
      if(!isRecord(ref)||!Number.isInteger(ref.z)||typeof ref.id!=='string'){
        errors.push(authoringIssue('authoring_exit_boundary_invalid',basePath+'.boundary','Exit boundary must contain integer z and boundary id.'));
      }else{
        const boundary=boundaryAt(authoring,ref.z,ref.id);
        if(!boundary)errors.push(authoringIssue('authoring_exit_boundary_missing',basePath+'.boundary','Exit '+key+' references a missing boundary.',{boundaryId:ref.id,z:ref.z}));
        else if(boundary.kind!=='opening')errors.push(authoringIssue('authoring_exit_boundary_not_opening',basePath+'.boundary','Exit '+key+' must reference an opening boundary.'));
        if(exit.access&&!boundaryTouchesCell(ref.id,exit.access))errors.push(authoringIssue('authoring_exit_access_boundary_mismatch',basePath+'.access','Exit access position must touch its boundary.',{boundaryId:ref.id}));
      }
      validatePosition(exit.access,basePath+'.access');
      const accessCell=exit.access&&layerAt(authoring,exit.access.z)?.cells?.[exit.access.x+','+exit.access.y];
      if(exit.access&&(!accessCell||accessCell.terrain!=='floor'))errors.push(authoringIssue('authoring_exit_access_not_floor',basePath+'.access','Exit access position must be an authored floor cell.'));
    }

    for(const [key,resident] of Object.entries(authoring.residents||{})){
      const basePath=`residents.${key}`;
      if(!isRecord(resident)){errors.push(authoringIssue('authoring_resident_invalid',basePath,'Resident entry must be an object.'));continue;}
      if(resident.id!==undefined&&resident.id!==key)errors.push(authoringIssue('authoring_resident_id_mismatch',`${basePath}.id`,`Resident key ${key} does not match id ${String(resident.id)}.`));
      const placement=resident.initial?.placement;
      if(placement?.mode==='exact')validatePosition(placement.node,`${basePath}.initial.placement.node`);
      if(placement?.mode==='anchor'&&placement.anchor?.kind==='furnitureSlot'){
        const matches=slotIds.get(placement.anchor.id)||[];
        if(matches.length===0)errors.push(authoringIssue('authoring_anchor_missing',`${basePath}.initial.placement.anchor.id`,`Resident anchor ${String(placement.anchor.id)} does not exist.`));
        else if(matches.length>1)errors.push(authoringIssue('authoring_anchor_ambiguous',`${basePath}.initial.placement.anchor.id`,`Resident anchor ${placement.anchor.id} is ambiguous.`));
      }
      const posture=resident.initial?.posture;
      if(posture?.slotId){
        const matches=slotIds.get(posture.slotId)||[];
        if(matches.length===0)errors.push(authoringIssue('authoring_posture_slot_missing',`${basePath}.initial.posture.slotId`,`Resident posture slot ${posture.slotId} does not exist.`));
      }
      if(posture?.furnitureId&&!authoring.furniture?.[posture.furnitureId])errors.push(authoringIssue('authoring_posture_furniture_missing',`${basePath}.initial.posture.furnitureId`,`Resident posture furniture ${posture.furnitureId} does not exist.`));
    }

    return {ok:errors.length===0,errors};
  }


  function assertCurrentSchema(authoring){
    if(!isRecord(authoring)||authoring.authoringSchema!==VERSION){
      const error=new Error('Unsupported authoringSchema: '+String(authoring?.authoringSchema));
      error.code='world_authoring_schema_unsupported';
      throw error;
    }
    if(authoring.furnitureCatalogVersion!==FURNITURE_CATALOG_VERSION){
      const error=new Error('Unsupported furnitureCatalogVersion: '+String(authoring?.furnitureCatalogVersion));
      error.code='furniture_catalog_unsupported';
      throw error;
    }
  }

  function deriveHorizontalTopology(authoring,{z=0}={}){
    assertCurrentSchema(authoring);
    const layer=(authoring.map?.layers||[]).find(item=>item.z===z);
    if(!layer)throw new RangeError('Missing authored Z-level '+z+'.');
    const width=authoring.map.width,height=authoring.map.height,cells={};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const id=x+','+y,cell=layer.cells?.[id]||null,terrain=cell?.terrain||'void';
      cells[id]={
        id,x,y,z,terrain,
        structuralOpen:STRUCTURALLY_OPEN_TERRAINS.has(terrain),
        staticBlocked:false,blockedBy:[],furnitureIds:[],under:[],adjacent:[],componentId:null
      };
    }
    const at=p=>p&&(p.z??0)===z?cells[p.x+','+p.y]||null:null;
    for(const [key,instance] of Object.entries(authoring.furniture||{})){
      const furniture=resolveFurnitureInstance(instance),id=furniture.id||key;
      for(const p of furniture.footprint||[]){
        const cell=at(p);if(!cell)continue;
        if(!cell.furnitureIds.includes(id))cell.furnitureIds.push(id);
        const floorMode=furniture.spatial?.floor?.mode;
        if(floorMode==='open')continue;
        if(floorMode==='under'){
          const under=furniture.spatial?.under;
          cell.under.push({
            furnitureId:id,
            clearanceHeight:Number.isFinite(Number(under?.clearance))?Number(under.clearance):null,
            clearanceWidth:Number.isFinite(Number(under?.clearanceWidth))?Number(under.clearanceWidth):null
          });
          continue;
        }
        if(floorMode==='solid'){
          cell.staticBlocked=true;
          cell.blockedBy.push('furniture:'+id);
        }
      }
    }
    for(const [key,container] of Object.entries(authoring.entities?.containers||{})){
      if(container.portable!==false||container.supportId)continue;
      const cell=at(container.position);if(!cell)continue;
      cell.staticBlocked=true;cell.blockedBy.push('container:'+(container.id||key));
    }
    for(const [key,source] of Object.entries(authoring.entities?.sources||{})){
      if(source.blocksMovement===false)continue;
      const cell=at(source.position);if(!cell)continue;
      cell.staticBlocked=true;cell.blockedBy.push('source:'+(source.id||key));
    }
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const cell of Object.values(cells)){
      cell.open=cell.structuralOpen&&!cell.staticBlocked;
      cell.furnitureIds.sort();
      cell.blockedBy.sort();
      cell.under.sort((a,b)=>a.furnitureId.localeCompare(b.furnitureId));
    }
    for(const cell of Object.values(cells)){
      if(!cell.open)continue;
      for(const [dx,dy] of dirs){
        const other=cells[(cell.x+dx)+','+(cell.y+dy)];
        if(!other?.open)continue;
        const boundaryId=boundaryIdBetween(cell,other);
        if(boundaryId&&boundaryPassable(authoring,z,boundaryId))cell.adjacent.push(other.id);
      }
      cell.adjacent.sort();
    }
    const components=[];let seq=0;
    for(const cell of Object.values(cells)){
      if(!cell.open||cell.componentId)continue;
      const id='component'+(++seq),queue=[cell],members=[];cell.componentId=id;
      while(queue.length){
        const cur=queue.shift();members.push(cur.id);
        for(const neighborId of cur.adjacent){
          const neighbor=cells[neighborId];
          if(neighbor&&!neighbor.componentId){neighbor.componentId=id;queue.push(neighbor);}
        }
      }
      members.sort();components.push({id,cells:members});
    }
    return {z,width,height,cells,components};
  }

  function deriveStructureConnections(authoring){
    assertCurrentSchema(authoring);
    const out=[];
    for(const [key,structure] of Object.entries(authoring.structures||{})){
      if(!isRecord(structure)||structure.kind!=='stair'||!isRecord(structure.lower)||!isRecord(structure.upper))continue;
      out.push({
        id:structure.id||key,
        kind:structure.kind,
        lower:clone(structure.lower),
        upper:clone(structure.upper),
        ...(Number.isFinite(Number(structure.clearanceWidth))?{clearanceWidth:Number(structure.clearanceWidth)}:{}),
        ...(Number.isFinite(Number(structure.clearanceHeight))?{clearanceHeight:Number(structure.clearanceHeight)}:{})
      });
    }
    return out.sort((a,b)=>a.id.localeCompare(b.id));
  }

  function assertValidAuthoring(authoring){
    const report=validateAuthoring(authoring);
    if(!report.ok){
      const error=new Error('Invalid '+VERSION+' authoring document: '+report.errors.map(x=>x.code).join(', '));
      error.code='world_authoring_invalid';
      error.issues=clone(report.errors);
      throw error;
    }
    return report;
  }

  function canonicalizeAuthoring(authoring){
    const copy=clone(authoring);
    if(Array.isArray(copy?.map?.layers))copy.map.layers.sort((a,b)=>(a?.z??0)-(b?.z??0));
    return copy;
  }

  function stableValue(value){
    if(Array.isArray(value))return value.map(stableValue);
    if(!isRecord(value))return value;
    const out={};
    for(const key of Object.keys(value).sort())out[key]=stableValue(value[key]);
    return out;
  }

  function semanticFingerprint(authoring){
    return JSON.stringify(stableValue(canonicalizeAuthoring(authoring)));
  }

  function serializeAuthoring(authoring,{space=2}={}){
    assertValidAuthoring(authoring);
    return JSON.stringify(stableValue(canonicalizeAuthoring(authoring)),null,space);
  }

  function parseAuthoringJSON(text){
    let parsed;
    try{parsed=JSON.parse(String(text));}
    catch(error){
      const wrapped=new Error('Invalid authoring JSON: '+error.message);
      wrapped.code='world_authoring_json_invalid';
      throw wrapped;
    }
    assertCurrentSchema(parsed);
    assertValidAuthoring(parsed);
    return canonicalizeAuthoring(parsed);
  }

  window.SimWorldAuthoring={
    VERSION,
    FURNITURE_CATALOG_VERSION,
    FURNITURE_ORIENTATIONS:Object.freeze(Array.from(FURNITURE_ORIENTATIONS)),
    CELL_SIZE_METERS,
    DEFAULT_WORLD_AUTHORING:deepFreeze(DEFAULT_WORLD_AUTHORING),
    cloneAuthoring:clone,
    listFurnitureDefinitions,
    resolveFurnitureInstance,
    resolvedFurnitureMap,
    boundaryIdBetween,
    boundaryAt,
    doorsForBoundary,
    boundaryPassable,
    boundaryTouchesCell,
    deriveHorizontalTopology,
    deriveStructureConnections,
    validateAuthoring,
    assertValidAuthoring,
    canonicalizeAuthoring,
    semanticFingerprint,
    serializeAuthoring,
    parseAuthoringJSON
  };
})();
