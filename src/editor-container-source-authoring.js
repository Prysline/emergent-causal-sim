(() => {
  const A=window.SimWorldAuthoring,M=window.SimEditorAuthoringMutations;
  if(!A?.cloneAuthoring||!A?.validateAuthoring||!A?.canonicalizeAuthoring||!A?.semanticFingerprint||!A?.resolveFurnitureInstance){
    throw new Error('SimWorldAuthoring must load before editor-container-source-authoring.js.');
  }
  if(!M?.moveObject)throw new Error('SimEditorAuthoringMutations must load before editor-container-source-authoring.js.');

  const VERSION='editor-container-source-authoring-v1';
  const clone=value=>A.cloneAuthoring(value);
  const samePosition=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&(a.z??0)===(b.z??0);
  const issue=(code,message,data={})=>({code,message,...data});
  const reject=(code,message,data={},meta={})=>({reject:true,issues:[issue(code,message,data)],meta});

  const openRetention=(tiltLow,tiltHigh,impactLow,impactHigh,oscLow,oscHigh)=>({
    tilt:{lowRiskExposure:tiltLow,highRiskExposure:tiltHigh},
    impact:{lowRiskExposure:impactLow,highRiskExposure:impactHigh},
    oscillation:{lowRiskExposure:oscLow,highRiskExposure:oscHigh}
  });

  const CONTAINER_PRESETS=Object.freeze({
    'ready-food':Object.freeze({
      id:'ready-food',label:'現成食物（Debug）',icon:'🍲',instanceIdBase:'mealTray',
      authored:Object.freeze({name:'現成食物',icon:'🍲',roles:['readyFood'],capacity:100,emptyLoad:2.5,preferredResource:'food',contents:{food:68},portable:false,canEatFrom:true,access:1,restock:{resource:'food',low:18,strategy:'logisticsContainer',sourceRole:'foodReserve'},interactions:{serve:{mode:'supportReach'},eatFrom:{mode:'reach'}}})
    }),
    plate:Object.freeze({
      id:'plate',label:'餐盤',icon:'🍽️',instanceIdBase:'plate',
      authored:Object.freeze({name:'餐盤',icon:'🍽️',roles:['servingDish'],capacity:12,emptyLoad:.35,contents:{},portable:true,handling:{carryGeometry:{width:.30,height:.05,length:.30},handsRequired:1,containment:'open',contentRetention:openRetention(.10,.48,.16,.70,.24,.95)},servingDish:true,canEatFrom:true,interactions:{eatFrom:{mode:'reach'}}})
    }),
    'food-pantry':Object.freeze({
      id:'food-pantry',label:'食物櫃',icon:'🗄️',instanceIdBase:'foodPantry',floorOnly:true,
      authored:Object.freeze({name:'食物櫃',icon:'🗄️',roles:['foodReserve','externalSupplyDestination'],capacity:200,emptyLoad:8,preferredResource:'food',contents:{food:140},portable:false,access:1})
    }),
    basket:Object.freeze({
      id:'basket',label:'搬運籃',icon:'🧺',instanceIdBase:'basket',
      authored:Object.freeze({name:'搬運籃',icon:'🧺',roles:['logisticsContainer'],capacity:55,emptyLoad:.8,contents:{},portable:true,handling:{carryGeometry:{width:.55,height:.30,length:.40},handsRequired:2,containment:'open',contentRetention:openRetention(.24,.78,.24,.82,.36,1.25)},transportResources:['food'],interactions:{pickup:{mode:'occupy'},receive:{mode:'reach'},deposit:{mode:'reach'}}})
    }),
    'water-bucket':Object.freeze({
      id:'water-bucket',label:'水桶',icon:'💧',instanceIdBase:'waterBucket',
      authored:Object.freeze({name:'水桶',icon:'💧',roles:['waterReserve','refillable','drinkSource'],capacity:100,emptyLoad:1.3,preferredResource:'water',contents:{water:72},portable:true,handling:{carryGeometry:{width:.32,height:.35,length:.32},handsRequired:1,containment:'open',contentRetention:openRetention(.08,.44,.14,.64,.20,.82)},canDrinkFrom:true,drinkPreference:.12,access:1,restock:{resource:'water',low:24,strategy:'carryContainer',sourceRole:'resourceSource'},interactions:{pickup:{mode:'occupy'},drinkFrom:{mode:'reach'}}})
    }),
    'white-cup':Object.freeze({
      id:'white-cup',label:'白色杯子',icon:'🥛',instanceIdBase:'cupWhite',
      authored:Object.freeze({name:'白色杯子',icon:'🥛',roles:['drinkVessel'],capacity:35,emptyLoad:.25,contents:{},portable:true,handling:{carryGeometry:{width:.10,height:.12,length:.10},handsRequired:1,containment:'open',contentRetention:openRetention(.06,.34,.10,.52,.14,.66)},canDrinkFrom:true,drinkPreference:.95})
    }),
    'blue-cup':Object.freeze({
      id:'blue-cup',label:'藍色杯子',icon:'🥛',instanceIdBase:'cupBlue',
      authored:Object.freeze({name:'藍色杯子',icon:'🥛',roles:['drinkVessel'],capacity:35,emptyLoad:.25,contents:{},portable:true,handling:{carryGeometry:{width:.10,height:.12,length:.10},handsRequired:1,containment:'open',contentRetention:openRetention(.06,.34,.10,.52,.14,.66)},canDrinkFrom:true,drinkPreference:.95})
    }),
    'alcohol-bottle':Object.freeze({
      id:'alcohol-bottle',label:'酒瓶',icon:'🍾',instanceIdBase:'alcoholBottle',
      authored:Object.freeze({name:'酒瓶',icon:'🍾',roles:['drinkSource'],capacity:160,emptyLoad:.65,preferredResource:'alcohol',contents:{alcohol:120},portable:true,handling:{carryGeometry:{width:.10,height:.30,length:.10},handsRequired:1,containment:'sealed',contentRetention:openRetention(.06,.34,.10,.52,.14,.66)},canDrinkFrom:true,drinkPreference:.28})
    })
  });

  const SOURCE_PRESETS=Object.freeze({
    tap:Object.freeze({
      id:'tap',label:'水龍頭',icon:'🚰',instanceIdBase:'tap',
      authored:Object.freeze({name:'水龍頭',icon:'🚰',roles:['resourceSource'],resource:'water',infinite:true,interactions:{fill:{mode:'port'}}}),
      ports:Object.freeze([{suffix:'west',label:'水龍頭左側',offset:{x:-1,y:0,z:0},edge:'east',affordances:['fill']}])
    })
  });

  function listContainerPresets(){return Object.values(CONTAINER_PRESETS).map(clone);}
  function listSourcePresets(){return Object.values(SOURCE_PRESETS).map(clone);}
  function getContainerPreset(id){return CONTAINER_PRESETS[id]?clone(CONTAINER_PRESETS[id]):null;}
  function getSourcePreset(id){return SOURCE_PRESETS[id]?clone(SOURCE_PRESETS[id]):null;}

  function mutationResult(authoring,apply){
    const inputReport=A.validateAuthoring(authoring);
    if(!inputReport.ok)return {ok:false,candidate:null,issues:clone(inputReport.errors),meta:{phase:'input-validation'}};
    const before=A.semanticFingerprint(authoring);
    const candidate=clone(authoring);
    let meta={};
    try{
      const outcome=apply(candidate)||{};
      if(outcome.reject)return {ok:false,candidate:null,issues:clone(outcome.issues||[]),meta:clone(outcome.meta||{})};
      meta=outcome.meta||{};
    }catch(error){
      return {ok:false,candidate:null,issues:[issue(error.code||'editor_mutation_exception',error.message||String(error))],meta:{phase:'apply'}};
    }
    const report=A.validateAuthoring(candidate);
    if(!report.ok)return {ok:false,candidate:null,issues:clone(report.errors),meta:{...clone(meta),phase:'candidate-validation'}};
    const canonical=A.canonicalizeAuthoring(candidate);
    return {ok:true,candidate:canonical,issues:[],meta:{...clone(meta),beforeFingerprint:before,afterFingerprint:A.semanticFingerprint(canonical)}};
  }

  function validTarget(target){return !!target&&Number.isInteger(target.x)&&Number.isInteger(target.y)&&Number.isInteger(target.z??0);}

  function listSupportCandidates(authoring,target){
    if(!target)return [];
    const out=[];
    for(const id of Object.keys(authoring?.furniture||{}).sort()){
      let furniture=null;
      try{furniture=A.resolveFurnitureInstance(authoring.furniture[id]);}catch{}
      if(!furniture||furniture.supportsObjects!==true)continue;
      if((furniture.footprint||[]).some(position=>samePosition(position,target)))out.push({id,name:furniture.name||id});
    }
    return out;
  }

  function resolveSupportChoice(authoring,target,supportChoice,{floorOnly=false}={}){
    const candidates=floorOnly?[]:listSupportCandidates(authoring,target);
    if(!supportChoice){
      if(candidates.length)return reject('support_choice_required','此位置有合法家具承載面；請明確選擇地面或家具。',{target:clone(target)},{candidates:clone(candidates)});
      return {supportId:null,candidates};
    }
    if(supportChoice.kind==='floor')return {supportId:null,candidates};
    if(!floorOnly&&supportChoice.kind==='furniture'){
      const selected=candidates.find(item=>item.id===supportChoice.furnitureId);
      if(!selected)return reject('support_choice_invalid','指定的家具不是此位置的合法承載面。',{target:clone(target),supportChoice:clone(supportChoice)},{candidates:clone(candidates)});
      return {supportId:selected.id,candidates};
    }
    return reject('support_choice_invalid','此 preset 的承載選擇無效。',{target:clone(target),supportChoice:clone(supportChoice)},{candidates:clone(candidates)});
  }

  function nextInstanceId(authoring,collection,base){
    const values=authoring?.entities?.[collection]||{};
    for(let index=1;index<100000;index++){
      const id=`${base}-${index}`;
      if(!Object.hasOwn(values,id))return id;
    }
    throw new Error(`Unable to allocate ${collection} instance ID.`);
  }

  function createContainerFromPreset(authoring,{presetId,target,supportChoice=null}={}){
    const preset=CONTAINER_PRESETS[presetId];
    if(!preset)return {ok:false,candidate:null,issues:[issue('container_preset_unknown','找不到指定的 Container preset。',{presetId})],meta:{}};
    if(!validTarget(target))return {ok:false,candidate:null,issues:[issue('container_create_target_invalid','Container 建立需要有效的 x / y / z。',{presetId,target:clone(target||null)})],meta:{}};
    return mutationResult(authoring,candidate=>{
      const support=resolveSupportChoice(candidate,target,supportChoice,{floorOnly:preset.floorOnly===true});
      if(support.reject)return support;
      candidate.entities??={};
      candidate.entities.containers??={};
      const newId=nextInstanceId(candidate,'containers',preset.instanceIdBase);
      const container={id:newId,...clone(preset.authored),position:clone({...target,z:target.z??0})};
      if(support.supportId)container.supportId=support.supportId;
      candidate.entities.containers[newId]=container;
      return {meta:{operation:'createContainerFromPreset',presetId,newId,supportId:support.supportId||null,target:clone(container.position)}};
    });
  }

  function constructedCell(authoring,position){
    const layer=(authoring?.map?.layers||[]).find(item=>item.z===(position.z??0));
    return !!layer?.cells?.[`${position.x},${position.y}`];
  }

  function createSourceFromPreset(authoring,{presetId,target}={}){
    const preset=SOURCE_PRESETS[presetId];
    if(!preset)return {ok:false,candidate:null,issues:[issue('source_preset_unknown','找不到指定的 Source preset。',{presetId})],meta:{}};
    if(!validTarget(target))return {ok:false,candidate:null,issues:[issue('source_create_target_invalid','Source 建立需要有效的 x / y / z。',{presetId,target:clone(target||null)})],meta:{}};
    return mutationResult(authoring,candidate=>{
      candidate.entities??={};
      candidate.entities.sources??={};
      const newId=nextInstanceId(candidate,'sources',preset.instanceIdBase);
      const position=clone({...target,z:target.z??0});
      const interactionPorts=(preset.ports||[]).map(port=>({
        id:`${newId}:${port.suffix}`,
        label:port.label,
        position:{x:position.x+port.offset.x,y:position.y+port.offset.y,z:position.z+(port.offset.z??0)},
        edge:port.edge,
        affordances:clone(port.affordances||[])
      }));
      const invalidPort=interactionPorts.find(port=>!constructedCell(candidate,port.position));
      if(invalidPort)return reject('source_port_target_invalid','此 Source preset 的互動位置必須落在已建構 Cell。',{presetId,target:clone(position),port:clone(invalidPort)});
      candidate.entities.sources[newId]={id:newId,...clone(preset.authored),position,interactionPorts};
      return {meta:{operation:'createSourceFromPreset',presetId,newId,target:clone(position),interactionPortIds:interactionPorts.map(port=>port.id)}};
    });
  }

  function deleteContainer(authoring,{containerId}={}){
    return mutationResult(authoring,candidate=>{
      const container=candidate.entities?.containers?.[containerId];
      if(!container)return reject('container_missing','找不到 Container '+String(containerId)+'.',{entityType:'container',entityId:containerId});
      const removedContents=clone(container.contents||{});
      delete candidate.entities.containers[containerId];
      return {meta:{operation:'deleteContainer',containerId,removedContents}};
    });
  }

  function deleteSource(authoring,{sourceId}={}){
    return mutationResult(authoring,candidate=>{
      const source=candidate.entities?.sources?.[sourceId];
      if(!source)return reject('source_missing','找不到 Source '+String(sourceId)+'.',{entityType:'source',entityId:sourceId});
      const interactionPortIds=(source.interactionPorts||[]).map(port=>port.id).filter(Boolean);
      delete candidate.entities.sources[sourceId];
      return {meta:{operation:'deleteSource',sourceId,interactionPortIds}};
    });
  }

  M.listContainerPresets=listContainerPresets;
  M.listSourcePresets=listSourcePresets;
  M.createContainerFromPreset=createContainerFromPreset;
  M.createSourceFromPreset=createSourceFromPreset;
  M.deleteContainer=deleteContainer;
  M.deleteSource=deleteSource;

  window.SimEditorContainerSourceAuthoring={
    VERSION,
    listContainerPresets,
    listSourcePresets,
    getContainerPreset,
    getSourcePreset,
    listSupportCandidates,
    createContainerFromPreset,
    createSourceFromPreset,
    deleteContainer,
    deleteSource
  };

  if(typeof document==='undefined')return;
  const E=window.SimWorldEditor;
  if(!E?.getDocument||!E?.getSession||!E?.loadDocument||!E?.semanticFingerprint||!E?.selectEntity)return;

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const addPane=document.querySelector('[data-sidebar-section="add"]');
  if(!addPane)throw new Error('Container / Source preset authoring requires the World Editor Add pane.');

  const host=document.createElement('div');
  host.dataset.containerSourceAuthoring='';
  host.innerHTML='<div class="sidebar-add-category" data-add-category="container"><h3>容器</h3><p class="hint scene-hint">以已核准 preset 建立完整 canonical Container；內部設定目前唯讀。</p><div id="containerPresetCatalog" class="scene-list" aria-label="Container preset 目錄"></div></div><div class="sidebar-add-category" data-add-category="source"><h3>資源源頭</h3><p class="hint scene-hint">以已核准 preset 建立完整 canonical Source；內部設定目前唯讀。</p><div id="sourcePresetCatalog" class="scene-list" aria-label="Source preset 目錄"></div></div><div id="containerSourceOperation" class="validation-list" aria-live="polite"></div>';
  addPane.append(host);

  const nativeLoadDocument=E.loadDocument.bind(E);
  const nativeGetSession=E.getSession.bind(E);
  let baselineFingerprint=E.semanticFingerprint();
  let inheritedDirty=nativeGetSession().dirty===true;
  let pending=null;
  let status='';

  function dirty(){return inheritedDirty||E.semanticFingerprint()!==baselineFingerprint;}
  E.getSession=()=>({...nativeGetSession(),dirty:dirty()});
  E.loadDocument=next=>{
    const result=nativeLoadDocument(next);
    baselineFingerprint=E.semanticFingerprint();
    inheritedDirty=false;
    pending=null;
    status='';
    renderUi();
    return result;
  };

  function markCleanBaseline(){
    baselineFingerprint=E.semanticFingerprint();
    inheritedDirty=false;
    pending=null;
    status='';
    renderUi();
  }

  function syncDirtyUi(){
    const pill=$('dirtyStatus');
    if(!pill)return;
    const value=dirty();
    pill.textContent=value?'有未匯出修改':'未修改';
    pill.classList.toggle('clean',!value);
    pill.classList.toggle('dirty',value);
  }

  function renderCatalogs(){
    $('containerPresetCatalog').innerHTML=listContainerPresets().map(preset=>`<button type="button" class="scene-item" data-container-preset-id="${esc(preset.id)}"><span>${esc(preset.icon||'◈')}</span><span><b>${esc(preset.label)}</b><small>${esc(preset.id)}</small></span></button>`).join('');
    $('sourcePresetCatalog').innerHTML=listSourcePresets().map(preset=>`<button type="button" class="scene-item" data-source-preset-id="${esc(preset.id)}"><span>${esc(preset.icon||'◆')}</span><span><b>${esc(preset.label)}</b><small>${esc(preset.id)}</small></span></button>`).join('');
  }

  function renderOperation(){
    const operation=$('containerSourceOperation');
    if(!operation)return;
    if(pending?.kind==='support'){
      operation.innerHTML=`<div>此位置可選擇地面或家具承載面。</div><div class="selection-actions"><button type="button" data-container-source-support="floor">放在地面</button>${(pending.candidates||[]).map(item=>`<button type="button" data-container-source-support="furniture" data-support-id="${esc(item.id)}">放在 ${esc(item.name||item.id)}</button>`).join('')}<button type="button" data-container-source-cancel>取消</button></div>`;
      return;
    }
    if(pending?.kind==='place'){
      const preset=pending.entityType==='container'?getContainerPreset(pending.presetId):getSourcePreset(pending.presetId);
      operation.innerHTML=`<div>下一次點擊地圖：建立 ${esc(preset?.label||pending.presetId)}。</div><button type="button" data-container-source-cancel>取消</button>`;
      return;
    }
    operation.textContent=status||'';
  }

  function decorateSelectionActions(){
    const actions=$('selectionActions');
    if(!actions)return;
    const existing=actions.querySelector('[data-container-source-action="remove"]');
    const selection=E.getSession().selection;
    const eligible=selection?.kind==='entity'&&['container','source'].includes(selection.type);
    if(!eligible){existing?.remove();return;}
    if(existing)return;
    const button=document.createElement('button');
    button.type='button';
    button.className='danger-action';
    button.dataset.containerSourceAction='remove';
    button.textContent=selection.type==='container'?'移除容器':'移除資源源頭';
    actions.querySelector('.action-row')?.append(button);
  }

  function renderUi(){
    renderCatalogs();
    renderOperation();
    decorateSelectionActions();
    syncDirtyUi();
  }

  function commit(result,successMessage,{selectType=null,selectId=null}={}){
    if(!result?.ok){
      status=(result?.issues||[]).map(item=>item.message||item.code).join('；')||'操作被拒絕。';
      renderUi();
      return false;
    }
    nativeLoadDocument(result.candidate);
    pending=null;
    status=successMessage;
    if(selectType&&selectId)E.selectEntity(selectType,selectId);
    renderUi();
    return true;
  }

  function executeCreate(target,supportChoice=null){
    const operation=pending;
    if(!operation)return;
    const documentValue=E.getDocument();
    const result=operation.entityType==='container'
      ?createContainerFromPreset(documentValue,{presetId:operation.presetId,target,supportChoice})
      :createSourceFromPreset(documentValue,{presetId:operation.presetId,target});
    if(!result.ok&&result.issues?.some(item=>item.code==='support_choice_required')){
      pending={kind:'support',entityType:'container',presetId:operation.presetId,target:clone(target),candidates:clone(result.meta?.candidates||[])};
      status='';
      renderUi();
      return;
    }
    const newId=result?.meta?.newId;
    commit(result,result.ok?`已建立 ${newId}。`:'',{selectType:operation.entityType,selectId:newId});
  }

  host.addEventListener('click',event=>{
    const container=event.target.closest('[data-container-preset-id]');
    if(container){pending={kind:'place',entityType:'container',presetId:container.dataset.containerPresetId};status='';renderUi();return;}
    const source=event.target.closest('[data-source-preset-id]');
    if(source){pending={kind:'place',entityType:'source',presetId:source.dataset.sourcePresetId};status='';renderUi();return;}
    const support=event.target.closest('[data-container-source-support]');
    if(support&&pending?.kind==='support'){
      const operation=pending;
      pending={kind:'place',entityType:'container',presetId:operation.presetId};
      executeCreate(operation.target,support.dataset.containerSourceSupport==='floor'?{kind:'floor'}:{kind:'furniture',furnitureId:support.dataset.supportId});
      return;
    }
    if(event.target.closest('[data-container-source-cancel]')){pending=null;status='';renderUi();}
  });

  $('editorMap').addEventListener('click',event=>{
    if(pending?.kind!=='place')return;
    const cell=event.target.closest('[data-cell]');
    if(!cell)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const [x,y]=cell.dataset.cell.split(',').map(Number);
    executeCreate({x,y,z:E.getSession().currentZ});
  },true);

  $('selectionActions').addEventListener('click',event=>{
    const button=event.target.closest('[data-container-source-action="remove"]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const selection=E.getSession().selection;
    if(selection?.kind!=='entity')return;
    const result=selection.type==='container'
      ?deleteContainer(E.getDocument(),{containerId:selection.id})
      :selection.type==='source'
        ?deleteSource(E.getDocument(),{sourceId:selection.id})
        :null;
    if(result)commit(result,result.ok?`已移除 ${selection.id}。`:'');
  },true);

  $('exportWorld')?.addEventListener('click',()=>setTimeout(()=>{
    if(nativeGetSession().dirty===false)markCleanBaseline();
  },0));
  $('resetWorld')?.addEventListener('click',()=>setTimeout(()=>{
    if(nativeGetSession().dirty===false)markCleanBaseline();
  },0));
  $('importWorld')?.addEventListener('change',()=>setTimeout(()=>{
    if(nativeGetSession().dirty===false)markCleanBaseline();
  },120));

  const observer=new MutationObserver(()=>decorateSelectionActions());
  observer.observe($('selectionActions'),{childList:true,subtree:true});
  renderUi();
})();
