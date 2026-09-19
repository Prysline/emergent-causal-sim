(() => {
  const VERSION='world-authoring-v1';
  const pos=(x,y,z=0)=>({x,y,z});

  function buildDefaultCells(){
    const width=12,height=8,cells={};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const boundary=x===0||y===0||x===width-1||y===height-1;
      const door=x===0&&y===6;
      cells[x+','+y]={
        terrain:door?'doorway':boundary?'wall':'floor',
        material:boundary&&!door?'stone':'wood'
      };
    }
    return cells;
  }

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  const DEFAULT_WORLD_AUTHORING={
    authoringSchema:VERSION,
    id:'mvp-default-house',
    label:'Current MVP Default World',
    scenario:{startDay:1,startMinute:12*60},
    map:{width:12,height:8,layers:[{z:0,cells:buildDefaultCells()}]},
    furniture:{
      diningTable:{id:'diningTable',name:'餐桌',icon:'▰',kind:'table',blocksMovement:true,supportsObjects:true,value:30,
        footprint:[pos(5,2),pos(6,2),pos(5,3),pos(6,3)],displayAt:pos(5,2),slots:[]},
      chairNW:{id:'chairNW',name:'餐椅 A',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
        footprint:[pos(4,2)],displayAt:pos(4,2),slots:[{id:'chairNW:seat',label:'座位',position:pos(4,2),canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
      chairNE:{id:'chairNE',name:'餐椅 B',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
        footprint:[pos(7,2)],displayAt:pos(7,2),slots:[{id:'chairNE:seat',label:'座位',position:pos(7,2),canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
      chairSW:{id:'chairSW',name:'餐椅 C',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
        footprint:[pos(4,3)],displayAt:pos(4,3),slots:[{id:'chairSW:seat',label:'座位',position:pos(4,3),canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
      chairSE:{id:'chairSE',name:'餐椅 D',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
        footprint:[pos(7,3)],displayAt:pos(7,3),slots:[{id:'chairSE:seat',label:'座位',position:pos(7,3),canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
      sofa:{id:'sofa',name:'沙發',icon:'🛋️',kind:'sofa',blocksMovement:false,value:35,
        footprint:[pos(9,2),pos(10,2)],displayAt:pos(9,2),slots:[
          {id:'sofa:left',label:'左側',position:pos(9,2),canRest:true,canSleep:true,restQuality:.82,sleepQuality:.62,allowKinds:['human','cat']},
          {id:'sofa:right',label:'右側',position:pos(10,2),canRest:true,canSleep:true,restQuality:.82,sleepQuality:.62,allowKinds:['human','cat']}
        ]},
      bed:{id:'bed',name:'雙人床',icon:'🛏️',kind:'bed',blocksMovement:false,value:55,
        footprint:[pos(9,5),pos(10,5)],displayAt:pos(9,5),slots:[
          {id:'bed:left',label:'左側',position:pos(9,5),canRest:true,canSleep:true,restQuality:.98,sleepQuality:1,restPosture:'lying',allowKinds:['human']},
          {id:'bed:right',label:'右側',position:pos(10,5),canRest:true,canSleep:true,restQuality:.98,sleepQuality:1,restPosture:'lying',allowKinds:['human']}
        ]},
      frontDoor:{id:'frontDoor',name:'大門',icon:'🚪',kind:'door',blocksMovement:true,value:18,
        footprint:[pos(0,6)],displayAt:pos(0,6),slots:[{id:'frontDoor:inside',label:'門內',position:pos(1,6),canExit:true,allowKinds:['human','cat']}]}
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
  const derivedCellFields=new Set(['walkable','roomId','furnitureIds']);
  const derivedSlotFields=new Set(['furnitureId']);

  function authoringIssue(code,path,message,data={}){
    return {code,path,message,...data};
  }

  function validateAuthoring(authoring){
    const errors=[];
    if(!isRecord(authoring)){
      return {ok:false,errors:[authoringIssue('authoring_document_invalid',','Authoring document must be an object.')]};
    }
    if(authoring.authoringSchema!==VERSION){
      errors.push(authoringIssue('authoring_schema_unsupported','authoringSchema',`Expected ${VERSION}; received ${String(authoring.authoringSchema)}.`));
    }

    const map=authoring.map;
    const width=map?.width,height=map?.height;
    if(!Number.isInteger(width)||width<=0)errors.push(authoringIssue('authoring_width_invalid','map.width','map.width must be a positive integer.'));
    if(!Number.isInteger(height)||height<=0)errors.push(authoringIssue('authoring_height_invalid','map.height','map.height must be a positive integer.'));
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
          for(const field of derivedCellFields)if(Object.prototype.hasOwnProperty.call(cell,field)){
            errors.push(authoringIssue('authoring_derived_cell_field',`${cellPath}.${field}`,`Derived runtime field ${field} must not be persisted in canonical authoring.`));
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

    const slotIds=new Map();
    for(const [key,furniture] of Object.entries(authoring.furniture||{})){
      const basePath=`furniture.${key}`;
      if(!isRecord(furniture)){
        errors.push(authoringIssue('authoring_furniture_invalid',basePath,'Furniture entry must be an object.'));
        continue;
      }
      if(furniture.id!==undefined&&furniture.id!==key)errors.push(authoringIssue('authoring_furniture_id_mismatch',`${basePath}.id`,`Furniture key ${key} does not match id ${String(furniture.id)}.`));
      if(!Array.isArray(furniture.footprint))errors.push(authoringIssue('authoring_furniture_footprint_invalid',`${basePath}.footprint`,'Furniture footprint must be an array.'));
      else furniture.footprint.forEach((p,index)=>validatePosition(p,`${basePath}.footprint[${index}]`));
      if(furniture.displayAt!==undefined&&furniture.displayAt!==null)validatePosition(furniture.displayAt,`${basePath}.displayAt`);
      if(furniture.slots!==undefined&&!Array.isArray(furniture.slots))errors.push(authoringIssue('authoring_furniture_slots_invalid',`${basePath}.slots`,'Furniture slots must be an array.'));
      for(let i=0;i<(furniture.slots||[]).length;i++){
        const slot=furniture.slots[i],slotPath=`${basePath}.slots[${i}]`;
        if(!isRecord(slot)){
          errors.push(authoringIssue('authoring_slot_invalid',slotPath,'Furniture slot must be an object.'));
          continue;
        }
        for(const field of derivedSlotFields)if(Object.prototype.hasOwnProperty.call(slot,field)){
          errors.push(authoringIssue('authoring_derived_slot_field',`${slotPath}.${field}`,`Derived runtime field ${field} must not be persisted in canonical authoring.`));
        }
        if(typeof slot.id!=='string'||!slot.id)errors.push(authoringIssue('authoring_slot_id_invalid',`${slotPath}.id`,'Furniture slot id must be a non-empty string.'));
        else{
          const paths=slotIds.get(slot.id)||[];
          paths.push(slotPath);
          slotIds.set(slot.id,paths);
        }
        validatePosition(slot.position,`${slotPath}.position`);
      }
    }
    for(const [slotId,paths] of slotIds)if(paths.length>1){
      errors.push(authoringIssue('authoring_slot_id_duplicate',paths[1]+`.id`,`Furniture slot id ${slotId} is duplicated.`,{slotId,count:paths.length}));
    }

    for(const [key,container] of Object.entries(authoring.entities?.containers||{})){
      const basePath=`entities.containers.${key}`;
      if(!isRecord(container)){errors.push(authoringIssue('authoring_container_invalid',basePath,'Container entry must be an object.'));continue;}
      if(container.id!==undefined&&container.id!==key)errors.push(authoringIssue('authoring_container_id_mismatch',`${basePath}.id`,`Container key ${key} does not match id ${String(container.id)}.`));
      if(container.position)validatePosition(container.position,`${basePath}.position`);
      for(let i=0;i<(container.interactionPorts||[]).length;i++)if(container.interactionPorts[i]?.position)validatePosition(container.interactionPorts[i].position,`${basePath}.interactionPorts[${i}].position`);
      if(container.supportId&&!authoring.furniture?.[container.supportId])errors.push(authoringIssue('authoring_support_missing',`${basePath}.supportId`,`Container supportId ${container.supportId} does not exist.`,{supportId:container.supportId}));
    }
    for(const [key,source] of Object.entries(authoring.entities?.sources||{})){
      const basePath=`entities.sources.${key}`;
      if(!isRecord(source)){errors.push(authoringIssue('authoring_source_invalid',basePath,'Source entry must be an object.'));continue;}
      if(source.id!==undefined&&source.id!==key)errors.push(authoringIssue('authoring_source_id_mismatch',`${basePath}.id`,`Source key ${key} does not match id ${String(source.id)}.`));
      if(source.position)validatePosition(source.position,`${basePath}.position`);
      for(let i=0;i<(source.interactionPorts||[]).length;i++)if(source.interactionPorts[i]?.position)validatePosition(source.interactionPorts[i].position,`${basePath}.interactionPorts[${i}].position`);
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
    assertValidAuthoring(parsed);
    return canonicalizeAuthoring(parsed);
  }

  window.SimWorldAuthoring={
    VERSION,
    DEFAULT_WORLD_AUTHORING:deepFreeze(DEFAULT_WORLD_AUTHORING),
    cloneAuthoring:clone,
    validateAuthoring,
    assertValidAuthoring,
    canonicalizeAuthoring,
    semanticFingerprint,
    serializeAuthoring,
    parseAuthoringJSON
  };
})();