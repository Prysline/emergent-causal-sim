(() => {
  const A=window.SimWorldAuthoring,M=window.SimEditorAuthoringMutations;
  if(!A?.cloneAuthoring||!A?.validateAuthoring||!A?.canonicalizeAuthoring||!A?.semanticFingerprint||!A?.resolveFurnitureInstance){
    throw new Error('SimWorldAuthoring must load before editor-ordinary-object-authoring.js.');
  }
  if(!M?.moveObject)throw new Error('SimEditorAuthoringMutations must load before editor-ordinary-object-authoring.js.');

  const VERSION='editor-ordinary-object-authoring-v3';
  const clone=value=>A.cloneAuthoring(value);
  const samePosition=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&(a.z??0)===(b.z??0);
  const issue=(code,message,data={})=>({code,message,...data});
  const reject=(code,message,data={},meta={})=>({reject:true,issues:[issue(code,message,data)],meta});

  const TEMPLATES=Object.freeze({
    'readable-book':Object.freeze({
      id:'readable-book',
      label:'可閱讀的書',
      icon:'📖',
      instanceIdBase:'readable-book',
      authored:Object.freeze({
        name:'一本書',
        icon:'📖',
        portable:true,
        handling:Object.freeze({carryGeometry:Object.freeze({width:.22,height:.04,length:.30}),handsRequired:1}),
        affordances:Object.freeze(['read']),
        interactions:Object.freeze({read:Object.freeze({mode:'supportReach'})})
      })
    })
  });

  function listTemplates(){return Object.values(TEMPLATES).map(clone);}
  function getTemplate(id){return TEMPLATES[id]?clone(TEMPLATES[id]):null;}

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

  function listSupportCandidates(authoring,target){
    if(!target)return [];
    const out=[];
    for(const id of Object.keys(authoring?.furniture||{}).sort()){
      let furniture=null;
      try{furniture=A.resolveFurnitureInstance(authoring.furniture[id]);}catch{}
      if(!furniture||furniture.supportsObjects!==true)continue;
      if((furniture.footprint||[]).some(position=>samePosition(position,target))){
        out.push({id,name:furniture.name||id});
      }
    }
    return out;
  }

  function resolveSupportChoice(authoring,target,supportChoice){
    const candidates=listSupportCandidates(authoring,target);
    if(!supportChoice){
      if(candidates.length)return reject('support_choice_required','此位置有合法家具承載面；請明確選擇地面或家具。',{target:clone(target)},{candidates:clone(candidates)});
      return {supportId:null,candidates};
    }
    if(supportChoice.kind==='floor')return {supportId:null,candidates};
    if(supportChoice.kind==='furniture'){
      const selected=candidates.find(item=>item.id===supportChoice.furnitureId);
      if(!selected)return reject('support_choice_invalid','指定的家具不是此位置的合法承載面。',{target:clone(target),supportChoice:clone(supportChoice)},{candidates:clone(candidates)});
      return {supportId:selected.id,candidates};
    }
    return reject('support_choice_invalid','承載選擇必須是 floor 或明確 furniture。',{target:clone(target),supportChoice:clone(supportChoice)},{candidates:clone(candidates)});
  }

  function nextInstanceId(authoring,base){
    const objects=authoring?.entities?.objects||{};
    for(let index=1;index<100000;index++){
      const id=`${base}-${index}`;
      if(!Object.hasOwn(objects,id))return id;
    }
    throw new Error('Unable to allocate Object instance ID.');
  }

  function createOrdinaryObjectFromTemplate(authoring,{templateId,target,supportChoice=null}={}){
    const template=TEMPLATES[templateId];
    if(!template)return {ok:false,candidate:null,issues:[issue('ordinary_object_template_unknown','找不到指定的物件 authoring template。',{templateId})],meta:{}};
    if(!target||!Number.isInteger(target.x)||!Number.isInteger(target.y)||!Number.isInteger(target.z??0)){
      return {ok:false,candidate:null,issues:[issue('ordinary_object_create_target_invalid','物件建立需要有效的 x / y / z。',{templateId,target:clone(target||null)})],meta:{}};
    }
    return mutationResult(authoring,candidate=>{
      const support=resolveSupportChoice(candidate,target,supportChoice);
      if(support.reject)return support;
      candidate.entities??={};
      candidate.entities.objects??={};
      const newId=nextInstanceId(candidate,template.instanceIdBase);
      const object={id:newId,...clone(template.authored),position:clone({...target,z:target.z??0})};
      if(support.supportId)object.supportId=support.supportId;
      candidate.entities.objects[newId]=object;
      return {meta:{operation:'createOrdinaryObjectFromTemplate',templateId,newId,supportId:support.supportId||null,target:clone(object.position)}};
    });
  }

  function moveOrdinaryObject(authoring,{objectId,target,supportChoice=null}={}){
    if(!target||!Number.isInteger(target.x)||!Number.isInteger(target.y)||!Number.isInteger(target.z??0)){
      return {ok:false,candidate:null,issues:[issue('object_move_target_invalid','物件移動需要有效的 x / y / z。',{objectId,target:clone(target||null)})],meta:{}};
    }
    return mutationResult(authoring,candidate=>{
      const object=candidate.entities?.objects?.[objectId];
      if(!object)return reject('object_missing','找不到 Object '+String(objectId)+'.',{entityType:'object',entityId:objectId});
      const support=resolveSupportChoice(candidate,target,supportChoice);
      if(support.reject)return support;
      object.position=clone({...target,z:target.z??0});
      delete object.containedBy;
      if(support.supportId)object.supportId=support.supportId;
      else delete object.supportId;
      return {meta:{operation:'moveOrdinaryObject',objectId,supportId:support.supportId||null,target:clone(object.position)}};
    });
  }

  function deleteOrdinaryObject(authoring,{objectId}={}){
    return mutationResult(authoring,candidate=>{
      const object=candidate.entities?.objects?.[objectId];
      if(!object)return reject('object_missing','找不到 Object '+String(objectId)+'.',{entityType:'object',entityId:objectId});
      delete candidate.entities.objects[objectId];
      return {meta:{operation:'deleteOrdinaryObject',objectId}};
    });
  }

  const baseMoveObject=M.moveObject.bind(M);
  M.listOrdinaryObjectTemplates=listTemplates;
  M.createOrdinaryObjectFromTemplate=createOrdinaryObjectFromTemplate;
  M.moveOrdinaryObject=moveOrdinaryObject;
  M.deleteOrdinaryObject=deleteOrdinaryObject;
  M.moveObject=(authoring,args={})=>args.entityType==='object'
    ?moveOrdinaryObject(authoring,{objectId:args.entityId,target:args.target,supportChoice:args.supportChoice})
    :baseMoveObject(authoring,args);

  const API=window.SimEditorOrdinaryObjectAuthoring={
    VERSION,
    listTemplates,
    getTemplate,
    listSupportCandidates,
    createOrdinaryObjectFromTemplate,
    moveOrdinaryObject,
    deleteOrdinaryObject
  };

  if(typeof document==='undefined')return;
  const E=window.SimWorldEditor;
  if(!E?.getDocument||!E?.getSession||!E?.loadDocument||!E?.semanticFingerprint||!E?.selectEntity)return;

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const nativeLoadDocument=E.loadDocument.bind(E);
  const nativeGetSession=E.getSession.bind(E);
  let baselineFingerprint=E.semanticFingerprint();
  let inheritedDirty=nativeGetSession().dirty===true;
  let pending=null;
  let status='';

  const host=$('ordinaryObjectCatalogHost')||document.querySelector('[data-sidebar-section="add"]');
  if(!host)throw new Error('Ordinary Object authoring requires the World Editor Add pane.');
  const palette=document.createElement('div');
  palette.className='sidebar-add-category';
  palette.dataset.ordinaryObjectAuthoring='';
  palette.innerHTML='<h3>物件</h3><p class="hint scene-hint">從最小 authoring template 建立 canonical Object；Scene / Map / Inspector 由 core Editor 投影同一份 Object truth。</p><div id="ordinaryObjectCatalog" class="scene-list" aria-label="物件 authoring template 目錄"></div><div id="ordinaryObjectOperation" class="validation-list" aria-live="polite"></div>';
  host.append(palette);

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

  function currentDocument(){return E.getDocument();}
  function supportButtons(candidates){
    return `<div class="selection-actions"><button type="button" data-ordinary-support-kind="floor">放在地面</button>${candidates.map(item=>`<button type="button" data-ordinary-support-kind="furniture" data-ordinary-support-id="${esc(item.id)}">放在 ${esc(item.name||item.id)}</button>`).join('')}<button type="button" data-ordinary-object-cancel>取消</button></div>`;
  }
  function renderOperation(){
    const operation=$('ordinaryObjectOperation');if(!operation)return;
    if(pending?.kind==='support')operation.innerHTML=`<div>此位置可選擇地面或家具承載面。</div>${supportButtons(pending.candidates||[])}`;
    else if(pending?.kind==='create')operation.innerHTML=`<div>下一次點擊地圖：建立 ${esc(getTemplate(pending.templateId)?.label||pending.templateId)}。</div><button type="button" data-ordinary-object-cancel>取消</button>`;
    else operation.textContent=status||'';
  }
  function renderCatalog(){
    const catalog=$('ordinaryObjectCatalog');if(!catalog)return;
    catalog.innerHTML=listTemplates().map(template=>`<button type="button" class="scene-item" data-object-template-id="${esc(template.id)}"><span>${esc(template.icon||'◈')}</span><span><b>${esc(template.label)}</b><small>${esc(template.id)}</small></span></button>`).join('');
  }
  function renderUi(){renderCatalog();renderOperation();syncDirtyUi();}

  function commit(result,successMessage,{selectId=null}={}){
    if(!result?.ok){status=(result?.issues||[]).map(item=>item.message||item.code).join('；')||'操作被拒絕。';renderUi();return false;}
    nativeLoadDocument(result.candidate);
    pending=null;
    status=successMessage;
    if(selectId)E.selectEntity('object',selectId);
    renderUi();
    return true;
  }
  function executeCreate(target,supportChoice=null){
    const operation=pending;if(operation?.kind!=='create')return;
    const result=createOrdinaryObjectFromTemplate(currentDocument(),{templateId:operation.templateId,target,supportChoice});
    if(!result.ok&&result.issues?.some(item=>item.code==='support_choice_required')){
      pending={kind:'support',templateId:operation.templateId,target:clone(target),candidates:clone(result.meta?.candidates||[])};
      status='';renderUi();return;
    }
    const newId=result?.meta?.newId;
    commit(result,newId?`已建立物件 ${newId}。`:'已建立物件。',{selectId:newId});
  }

  palette.addEventListener('click',event=>{
    const templateButton=event.target.closest('[data-object-template-id]');
    if(templateButton){pending={kind:'create',templateId:templateButton.dataset.objectTemplateId};status='';renderUi();return;}
    const support=event.target.closest('[data-ordinary-support-kind]');
    if(support&&pending?.kind==='support'){
      const operation=pending;
      pending={kind:'create',templateId:operation.templateId};
      executeCreate(operation.target,support.dataset.ordinarySupportKind==='floor'?{kind:'floor'}:{kind:'furniture',furnitureId:support.dataset.ordinarySupportId});
      return;
    }
    if(event.target.closest('[data-ordinary-object-cancel]')){pending=null;status='';renderUi();}
  });

  $('editorMap')?.addEventListener('click',event=>{
    if(pending?.kind!=='create')return;
    const cell=event.target.closest('[data-cell]');if(!cell)return;
    event.preventDefault();event.stopImmediatePropagation();
    const [x,y]=cell.dataset.cell.split(',').map(Number);
    executeCreate({x,y,z:E.getSession().currentZ});
  },true);

  $('exportWorld')?.addEventListener('click',()=>setTimeout(()=>{if(nativeGetSession().dirty===false)markCleanBaseline();},0));
  $('resetWorld')?.addEventListener('click',()=>setTimeout(()=>{if(nativeGetSession().dirty===false)markCleanBaseline();},0));
  $('importWorld')?.addEventListener('change',()=>setTimeout(()=>{if(nativeGetSession().dirty===false)markCleanBaseline();},120));
  renderUi();
  API.renderEditorProjection=renderUi;
})();
