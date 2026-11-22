(() => {
  // This is the single final canonical DEFAULT_WORLD_AUTHORING projection.
  // Earlier authoring layers own their schemas; the Core Default World B
  // projection owns only the assembled starting house and authored placements.
  const Base=window.SimWorldAuthoring,I=window.SimIngredient,F=window.SimFood;
  if(Base?.VERSION!=='world-authoring-v24'||I?.VERSION!=='food-ingredient-v1'||F?.VERSION!=='food-v2-meal-serving')
    throw new Error('Core Default World B requires World Authoring v24, Ingredient v1 and Food v2.');
  const VERSION='world-authoring-v27',clone=Base.cloneAuthoring;
  const p=(x,y)=>({x,y,z:0});
  function baseDocument(source){const out=clone(source||{});out.authoringSchema=Base.VERSION;return out;}
  function validateAuthoring(source){
    const report=Base.validateAuthoring(baseDocument(source)),errors=[...report.errors];
    if(source?.authoringSchema!==VERSION)
      errors.push({code:'authoring_schema_unsupported',path:'authoringSchema',message:'Expected '+VERSION});
    return {ok:errors.length===0,errors};
  }
  function assertValidAuthoring(source){
    const report=validateAuthoring(source);if(report.ok)return source;
    const error=new Error(report.errors.map(issue=>issue.path+': '+issue.message).join('\n'));
    error.code='world_authoring_invalid';error.issues=report.errors;throw error;
  }
  function canonicalizeAuthoring(source){
    assertValidAuthoring(source);
    const doc=Base.canonicalizeAuthoring(baseDocument(source));doc.authoringSchema=VERSION;return doc;
  }
  function buildBDefault(){
    const doc=clone(Base.DEFAULT_WORLD_AUTHORING);
    doc.authoringSchema=VERSION;
    doc.label='Core Default World B｜公共／私人分區住宅';
    const cells={},boundaries={};
    for(let y=1;y<=8;y++)for(let x=1;x<=14;x++)
      cells[x+','+y]={terrain:'floor',material:'wood'};
    for(let x=1;x<=14;x++){
      boundaries['h:'+x+',1']={kind:'wall',material:'stone'};
      boundaries['h:'+x+',9']={kind:'wall',material:'stone'};
    }
    for(let y=1;y<=8;y++){
      boundaries['v:1,'+y]={kind:'wall',material:'stone'};
      boundaries['v:15,'+y]={kind:'wall',material:'stone'};
    }
    boundaries['h:4,9']={kind:'opening',material:'wood'};
    for(let x=1;x<=6;x++)
      boundaries['h:'+x+',5']={kind:x===6?'opening':'wall',material:'stone'};
    for(let y=1;y<=4;y++)boundaries['v:7,'+y]={kind:'wall',material:'stone'};
    doc.map={width:16,height:10,cellSizeMeters:1,layers:[{z:0,cells,boundaries}]};
    doc.doors={
      frontDoor:{id:'frontDoor',name:'大門',boundary:{z:0,id:'h:4,9'},state:'open'},
      bedroomDoor:{id:'bedroomDoor',name:'臥室門',boundary:{z:0,id:'h:6,5'},state:'open'}
    };
    doc.exits={frontExit:{id:'frontExit',name:'大門外',kind:'offMap',
      boundary:{z:0,id:'h:4,9'},access:p(4,8)}};
    const furniture={
      stoveA:[12,2,'gas-stove'],counterA:[11,2,'kitchen-counter'],
      diningTable:[11,5,'dining-table'],chairNW:[10,5,'chair-basic'],
      chairNE:[13,5,'chair-basic'],chairSW:[10,6,'chair-basic'],
      chairSE:[13,6,'chair-basic'],sofa:[3,6,'sofa-basic'],
      bed:[3,2,'double-bed'],bookshelfA:[6,6,'bookshelf-basic'],pantryA:[14,2,'cabinet-tall'],
      catbed:[7,7,'pet-bed-small']
    };
    const originalFurniture=doc.furniture,orientation={
      chairNW:'east',chairNE:'west',chairSW:'east',chairSE:'west',bed:'north'
    };
    doc.furniture={};
    for(const [id,[x,y,definitionId]] of Object.entries(furniture)){
      const name=originalFurniture[id]?.name;
      doc.furniture[id]={id,definitionId,origin:p(x,y),orientation:orientation[id]||'south'};
      if(name!==undefined)doc.furniture[id].name=name;
    }
    const objects=doc.entities.objects;
    // The production B world contains only physical Ingredient / Meal food.
    for(const id of ['legacyResourcePlateA','legacyResourcePlateB','legacyResourceMealTray','legacyResourceFoodPantry','legacyResourceBasket'])delete objects[id];
    doc.resourceResponsibilityAssignments=(doc.resourceResponsibilityAssignments||[]).filter(relation=>relation.scope?.resource!=='food');
    const positions={
      bookA:[11,5],waterBucket:[10,3],cupA:[12,5],
      cupB:[12,6],alcoholBottle:[11,6],readyMealF0:[11,5]
    };
    for(const [id,[x,y]] of Object.entries(positions))objects[id].position=p(x,y);
    objects.bookA.handling.massKg=.5;
    objects.bookA.physicalVolumeCubicMeters=.00264;
    objects.basketA={id:'basketA',name:'搬運籃',icon:'🧺',portable:true,objectContainment:true,
      objectStorage:{capacityCubicMeters:.024},physicalVolumeCubicMeters:.004,
      handling:{carryGeometry:{width:.55,height:.30,length:.40},handsRequired:2,massKg:.8},
      position:p(13,3)};
    function servingPlate(id,name,x,y){
      return {id,name,icon:'🍽️',portable:true,canEatFrom:true,
        objectContainment:true,objectStorage:{capacityCubicMeters:.00035},
        handling:{carryGeometry:{width:.30,height:.05,length:.30},
          handsRequired:1,massKg:.30},
        position:p(x,y),supportId:'diningTable',
        interactions:{pickup:{mode:'supportReach'},eatFrom:{mode:'supportReach'}}};
    }
    objects.plateA=servingPlate('plateA','餐盤 A',11,5);
    objects.plateB=servingPlate('plateB','餐盤 B',12,6);
    objects.potA={
      id:'potA',name:'料理鍋',icon:'🍲',cookingEligible:true,portable:true,
      objectContainment:true,objectStorage:{capacityCubicMeters:.0006},
      handling:{carryGeometry:{width:.35,height:.25,length:.35},
        handsRequired:1,massKg:.8},
      position:p(12,2),supportId:'stoveA'
    };
    objects.ingredientA1=I.createIngredientObject({
      id:'ingredientA1',typeId:'A',position:p(11,2),supportId:'counterA'
    });
    const tap=doc.entities.sources.tap;
    tap.position=p(10,2);
    tap.interactionPorts=[{id:'tap:south',label:'水龍頭南側',
      position:p(10,3),edge:'north',affordances:['fill']}];
    for(const [id,[x,y]] of Object.entries({
      zhen:[10,4],zhou:[5,7],orange:[8,7]
    }))doc.residents[id].initial.placement={mode:'exact',node:p(x,y)};
    return doc;
  }
  const DEFAULT_WORLD_AUTHORING=Object.freeze(canonicalizeAuthoring(buildBDefault()));
  function serializeAuthoring(source){return JSON.stringify(canonicalizeAuthoring(source),null,2)+'\n';}
  function parseAuthoringJSON(value){
    let parsed;try{parsed=JSON.parse(String(value));}
    catch(error){const e=new Error('Invalid authoring JSON: '+error.message);e.code='world_authoring_json_invalid';throw e;}
    return canonicalizeAuthoring(parsed);
  }
  window.SimWorldAuthoring={...Base,VERSION,DEFAULT_WORLD_AUTHORING,
    validateAuthoring,assertValidAuthoring,canonicalizeAuthoring,
    serializeAuthoring,parseAuthoringJSON,
    semanticFingerprint:source=>JSON.stringify(canonicalizeAuthoring(source))};
})();
