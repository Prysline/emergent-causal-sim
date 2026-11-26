(() => {
  const E=window.SimEngine,C=window.SimFoodCooking,P=window.SimPerception,SP=window.SimSpatial;
  if(!E?.registerDecisionOptionProvider||C?.VERSION!=='food-cooking-v4-contained-output'||!P?.classifyObjectPointVisualAvailability||!P?.lacksVisualPoseEnvelopeForSupportedLocomotion||!SP?.bestInteractionPositionResult)throw new Error('Cooking runtime requires canonical Engine, Food, Perception and Spatial contracts.');
  function candidate(st,a,ingredient,station,pot){
    const context=C.eligible(st,ingredient.id,station.id,{potId:pot.id});
    if(!context||context.location!=='exposed')return null;
    for(const key of ['object:'+ingredient.id,'object:'+pot.id,'furniture:'+station.id]){
      if(st.reservations?.[key]&&st.reservations[key]!==a.id)return null;
    }
    const visible=P.classifyObjectPointVisualAvailability(st,a,ingredient);
    const potVisible=P.classifyObjectPointVisualAvailability(st,a,pot);
    if(visible?.visualAvailable!==true||potVisible?.visualAvailable!==true)return null;
    const target=SP.bestInteractionPositionResult(st,a,{kind:'furniture',id:station.id},'default');
    const pickup=SP.bestInteractionPositionResult(st,a,{kind:'object',id:ingredient.id},'pickup');
    const receive=SP.bestInteractionPositionResult(st,a,{kind:'object',id:pot.id},'receive');
    if(![target,pickup,receive].every(result=>Number.isFinite(result?.traversalCost)))return null;
    const score=Math.max(0,24+Math.min(80,Number(a.needs?.hunger)||0)*.65-Math.min(18,target.traversalCost*1.8));
    return {id:'cookMeal',ingredientId:ingredient.id,stationId:station.id,potId:pot.id,
      observed:{ingredientId:ingredient.id,potId:pot.id,sourceId:context.sourceId,observedTick:st.tick},
      score,why:['已觀察到完整食材、合法容器與可到達的料理設備','從合法支撐表面拿取食材、搬至指定容器並完成單批料理'],
      decisionContributors:[
        {kind:'observation',key:'ingredientVisualAvailability',role:'evidence',objectId:ingredient.id,observedTick:st.tick},
        {kind:'observation',key:'cookwareVisualAvailability',role:'evidence',objectId:pot.id,observedTick:st.tick},
        {kind:'need',key:'hunger',role:'motivation',value:Number(a.needs?.hunger)||0},
        {kind:'spatial',key:'cookingStationTraversalCost',role:'cost',value:target.traversalCost}
      ]};
  }
  function decisionOptionFor(st,a){
    if(a?.kind!=='human'||a.offMap||a.held)return null;
    if(P.lacksVisualPoseEnvelopeForSupportedLocomotion(a))return null;
    const stations=Object.values(st?.furniture||{}).filter(f=>f.cookingStation===true).sort((a,b)=>a.id.localeCompare(b.id));
    const ingredients=Object.values(st?.objects||{}).filter(o=>window.SimIngredient.hasIngredient(o))
      .sort((a,b)=>a.id.localeCompare(b.id));
    const options=[];
    for(const station of stations)for(const ingredient of ingredients)for(const pot of C.potsOnStation(st,station.id)){
      const pick=candidate(st,a,ingredient,station,pot);if(pick)options.push(pick);
    }
    options.sort((a,b)=>b.score-a.score||a.stationId.localeCompare(b.stationId)||a.ingredientId.localeCompare(b.ingredientId)||a.potId.localeCompare(b.potId));
    return options[0]||null;
  }
  const O=window.SimObjectHandling;
  function available(st,a,key){return !st.reservations?.[key]||st.reservations[key]===a.id;}
  function furnitureKnown(st,a,f){
    if(SP.isAtInteraction(st,a,{kind:'furniture',id:f.id},'default'))return true;
    if(!f.spatial?.solids?.length||!P.classifyFurnitureVisualSensoryAvailability)return false;
    const sample=P.deriveFurnitureSightSamples(f).targetSamples[0].position;
    if(sample.x===a.position.x&&sample.y===a.position.y)return false;
    return P.classifyFurnitureVisualSensoryAvailability(st,a,f)?.visualAvailable===true;
  }
  function supportCost(st,a,f){
    const contacts=SP.supportContactNodes(st,f.id,a);
    // An accessible current route origin at a legal support contact has zero
    // movement cost. No other candidate can improve a nonnegative cost.
    const here=SP.nodeForAgent(st,a);
    if(!a.posture?.slotId&&here&&contacts.some(node=>SP.nodeSame(st,node,here))
      &&SP.routeOriginsForAgent(st,a,'walk').some(node=>SP.nodeSame(st,node,here)))return 0;
    return SP.bestCandidateNodeResult(st,a,contacts,{mode:window.SimLocomotion?'auto':'walk'})?.objectiveCost??Infinity;
  }
  // Pure eligibility projection of an already locally inspected child, not a World mutation.
  // Cooking remains the authority for recipe, cookware, footprint, storage and material balance.
  function stagingIngredientEligible(st,a,ingredient,storageSourceId,stationId,potId,sourceId){
    if(st!==E.getState()||!SP.isAtInteraction(st,a,{kind:'furniture',id:storageSourceId},'default')||!ingredient||ingredient.containedBy!==storageSourceId||a.held||!window.SimIngredient.validIngredient(ingredient)||!O.canHoldObject(st,a,ingredient))return false;
    if(!available(st,a,'object:'+ingredient.id))return false;
    const prep=st.furniture?.[sourceId],entry=SP.supportSurfaceForFurniture(st,prep);
    if(prep?.supportsObjects!==true||prep.cookingStation===true||!entry?.surface)return false;
    const position=SP.supportPlacementCells(st,ingredient,sourceId)[0];
    if(!position)return false;
    const exposed={...ingredient,position,supportId:sourceId};delete exposed.containedBy;
    const projected={...st,objects:{...st.objects,[ingredient.id]:exposed}};
    return C.eligible(projected,ingredient.id,stationId,{potId})?.location==='exposed';
  }
  function pantryDecisionOptionFor(st,a){
    if(a?.kind!=='human'||a.offMap||a.held||!O||O.availableSupportHands(st,a)<1||
      P.lacksVisualPoseEnvelopeForSupportedLocomotion(a))return null;
    if(st!==E.getState())return null; // contact inspection is bound to the live Engine state
    const furniture=Object.values(st.furniture||{}).sort((x,y)=>x.id.localeCompare(y.id));
    const storage=furniture.filter(f=>f.objectContainment===true&&available(st,a,'furniture:'+f.id)&&furnitureKnown(st,a,f))
      .map(f=>({f,contact:E.inspectContainedObjects(a,f.id)}));
    if(!storage.length)return null;
    const supports=furniture.filter(f=>f.supportsObjects===true&&f.cookingStation!==true&&available(st,a,'furniture:'+f.id)&&furnitureKnown(st,a,f));
    if(!supports.length)return null;
    // Query-local lazy costs only: never search routes for an impossible cookware/
    // source/support combination, and never keep results across decisions or ticks.
    const sourceCosts=new Map(),supportCosts=new Map();
    function costOnce(map,id,query){if(!map.has(id))map.set(id,query());return map.get(id);}
    const options=[];
    for(const station of furniture.filter(f=>f.cookingStation===true&&available(st,a,'furniture:'+f.id))){
      let target;
      for(const pot of C.potsOnStation(st,station.id)){
        const status=O.objectStorageStatus(st,pot);
        if(!available(st,a,'object:'+pot.id)||!status.withinCapacity||status.count!==0)continue;
        const pos=SP.objectPosition(st,pot.id);
        if(!pos||(pos.x===a.position.x&&pos.y===a.position.y)||P.classifyObjectPointVisualAvailability(st,a,pot)?.visualAvailable!==true)continue;
        target??=SP.bestInteractionPositionResult(st,a,{kind:'furniture',id:station.id},'default')||{traversalCost:Infinity};
        if(!Number.isFinite(target.traversalCost))continue;
        if(!Number.isFinite(SP.bestInteractionPositionResult(st,a,{kind:'object',id:pot.id},'receive')?.traversalCost))continue;
        for(const source of storage)for(const prepFurniture of supports){
          const prep={f:prepFurniture};
          if(source.f.id===prep.f.id)continue;
          // Only a real local inspection may use child identity. Remote selection is an
          // uncertain search for food, independent of the hidden inventory.
          if(source.contact&&!source.contact.objectIds.some(id=>stagingIngredientEligible(st,a,st.objects[id],source.f.id,station.id,pot.id,prep.f.id)))continue;
          const sourceCost=costOnce(sourceCosts,source.f.id,()=>SP.bestInteractionPositionResult(st,a,{kind:'furniture',id:source.f.id},'default')?.traversalCost??Infinity);
          if(!Number.isFinite(sourceCost))continue;
          const prepCost=costOnce(supportCosts,prep.f.id,()=>supportCost(st,a,prep.f));
          if(!Number.isFinite(prepCost))continue;
          const distance=SP.manhattan(station.displayAt,prep.f.displayAt);
          const score=Math.max(0,24+Math.min(80,Number(a.needs?.hunger)||0)*.65-Math.min(18,(sourceCost+prepCost+target.traversalCost)*1.8)-(source.contact?0:4));
          options.push({id:'cookMeal',storageSourceId:source.f.id,sourceId:prep.f.id,stationId:station.id,potId:pot.id,
            observed:{storageSourceId:source.f.id,sourceId:prep.f.id,potId:pot.id,observedTick:st.tick,storageContact:!!source.contact},
            score,prepDistance:distance,why:['已接觸或觀察到可到達的固定收納處及料理設備','到場檢視後才決定是否取出可料理食材'],
            decisionContributors:[
              {kind:'observation',key:'storageAvailability',role:'evidence',sourceId:source.f.id,observedTick:st.tick},
              {kind:'observation',key:'cookwareVisualAvailability',role:'evidence',objectId:pot.id,observedTick:st.tick},
              {kind:'need',key:'hunger',role:'motivation',value:Number(a.needs?.hunger)||0},
              {kind:'spatial',key:'storageTraversalCost',role:'cost',value:sourceCost}
            ]});
        }
      }
    }
    options.sort((x,y)=>y.score-x.score||x.prepDistance-y.prepDistance||x.storageSourceId.localeCompare(y.storageSourceId)||x.sourceId.localeCompare(y.sourceId)||x.stationId.localeCompare(y.stationId)||x.potId.localeCompare(y.potId));
    return options[0]||null;
  }
  function validatePantryCookingChoice(st,a,choice){
    if(choice.ingredientId!=null)return null;
    const current=pantryDecisionOptionFor(st,a),e=choice.observed;
    if(!current||e?.observedTick!==st.tick)return null;
    for(const key of ['storageSourceId','sourceId','stationId','potId'])if(current[key]!==choice[key])return null;
    for(const key of ['storageSourceId','sourceId','potId','storageContact'])if(e[key]!==current.observed[key])return null;
    return current;
  }
  E.registerDecisionOptionProvider('food.cooking',(st,a)=>decisionOptionFor(st,a)||pantryDecisionOptionFor(st,a),490);
  E.pantryCookingDecisionOption=pantryDecisionOptionFor;
  E.validatePantryCookingChoice=validatePantryCookingChoice;
  E.stagingIngredientEligible=stagingIngredientEligible;
  E.registerActionLabelResolver('food.cooking',(st,a)=>a.action?.kind==='cookMeal'?'料理・'+(a.action.phase==='cooking'?'持續加熱中':a.action.phase==='toPot'?'將食材放入鍋具':a.action.phase==='toStorage'?'前往收納處檢視食材':a.action.phase==='stageIngredient'?'搬運食材至指定檯面':'準備料理'):null,490);
  E.EMERGENCY_PREEMPTIBLE?.add('cookMeal');
  E.COOKING_VERSION=C.VERSION;
  E.cookingDecisionOption=decisionOptionFor;
})();
