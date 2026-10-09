(() => {
  const A=window.SimWorldAuthoring,M=window.SimEditorAuthoringMutations;
  if(!A?.cloneAuthoring||!A?.validateAuthoring||!A?.canonicalizeAuthoring||!A?.semanticFingerprint||!A?.resolveFurnitureInstance){
    throw new Error('SimWorldAuthoring must load before editor-ordinary-object-authoring.js.');
  }
  if(!M?.moveObject)throw new Error('SimEditorAuthoringMutations must load before editor-ordinary-object-authoring.js.');

  const VERSION='editor-ordinary-object-authoring-v1';
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
    throw new Error('Unable to allocate ordinary object instance ID.');
  }

  function createOrdinaryObjectFromTemplate(authoring,{templateId,target,supportChoice=null}={}){
    const template=TEMPLATES[templateId];
    if(!template)return {ok:false,candidate:null,issues:[issue('ordinary_object_template_unknown','找不到指定的一般物件 authoring template。',{templateId})],meta:{}};
    if(!target||!Number.isInteger(target.x)||!Number.isInteger(target.y)||!Number.isInteger(target.z??0)){
      return {ok:false,candidate:null,issues:[issue('ordinary_object_create_target_invalid','一般物件建立需要有效的 x / y / z。',{templateId,target:clone(target||null)})],meta:{}};
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
      return {ok:false,candidate:null,issues:[issue('object_move_target_invalid','一般物件移動需要有效的 x / y / z。',{objectId,target:clone(target||null)})],meta:{}};
    }
    return mutationResult(authoring,candidate=>{
      const object=candidate.entities?.objects?.[objectId];
      if(!object)return reject('object_missing','找不到 ordinary object '+String(objectId)+'.',{entityType:'object',entityId:objectId});
      const support=resolveSupportChoice(candidate,target,supportChoice);
      if(support.reject)return support;
      object.position=clone({...target,z:target.z??0});
      if(support.supportId)object.supportId=support.supportId;
      else delete object.supportId;
      return {meta:{operation:'moveOrdinaryObject',objectId,supportId:support.supportId||null,target:clone(object.position)}};
    });
  }

  function deleteOrdinaryObject(authoring,{objectId}={}){
    return mutationResult(authoring,candidate=>{
      const object=candidate.entities?.objects?.[objectId];
      if(!object)return reject('object_missing','找不到 ordinary object '+String(objectId)+'.',{entityType:'object',entityId:objectId});
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
  if(!E?.getDocument||!E?.getSession||!E?.loadDocument||!E?.semanticFingerprint)return;

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const nativeLoadDocument=E.loadDocument.bind(E);
  const nativeGetSession=E.getSession.bind(E);
  let baselineFingerprint=E.semanticFingerprint();
  let pending=null;
  let selectedId=null;
  let status='';
  let observer=null;
  let renderQueued=false;

  const sceneSection=$('sceneList')?.closest('section');
  const paletteSection=document.createElement('section');
  paletteSection.dataset.ordinaryObjectAuthoring='';
  paletteSection.innerHTML='<h2>一般物件目錄</h2><p class="hint scene-hint">從最小 authoring template 建立 canonical ordinary object；Furniture 仍使用上方 system-owned Furniture Catalog。</p><div id="ordinaryObjectCatalog" class="scene-list" aria-label="一般物件 authoring template 目錄"></div><div id="ordinaryObjectOperation" class="validation-list" aria-live="polite"></div>';
  sceneSection?.before(paletteSection);

  function dirty(){return E.semanticFingerprint()!==baselineFingerprint;}
  E.getSession=()=>({...nativeGetSession(),dirty:dirty()});
  E.loadDocument=next=>{
    const result=nativeLoadDocument(next);
    baselineFingerprint=E.semanticFingerprint();
    pending=null;
    selectedId=null;
    status='';
    queueRender();
    return result;
  };

  function markCleanBaseline(){
    baselineFingerprint=E.semanticFingerprint();
    pending=null;
    status='';
    queueRender();
  }

  function syncDirtyUi(){
    const pill=$('dirtyStatus');
    if(!pill)return;
    const value=dirty();
    pill.textContent=value?'已修改':'未修改';
    pill.classList.toggle('clean',!value);
    pill.classList.toggle('dirty',value);
  }

  function currentDocument(){return E.getDocument();}
  function currentObject(){return selectedId?currentDocument().entities?.objects?.[selectedId]||null:null;}

  function supportButtons(candidates){
    return `<div class="selection-actions"><button type="button" data-ordinary-support-kind="floor">放在地面</button>${candidates.map(item=>`<button type="button" data-ordinary-support-kind="furniture" data-ordinary-support-id="${esc(item.id)}">放在 ${esc(item.name||item.id)}</button>`).join('')}<button type="button" data-ordinary-object-cancel>取消</button></div>`;
  }

  function renderOperation(){
    const host=$('ordinaryObjectOperation');
    if(!host)return;
    if(pending?.kind==='support'){
      host.innerHTML=`<div>此位置可選擇地面或家具承載面。</div>${supportButtons(pending.candidates||[])}`;
      return;
    }
    host.textContent=status||'';
  }

  function renderCatalog(){
    const host=$('ordinaryObjectCatalog');
    if(!host)return;
    host.innerHTML=listTemplates().map(template=>`<button type="button" class="scene-item" data-object-template-id="${esc(template.id)}"><span>${esc(template.icon||'◈')}</span><span><b>${esc(template.label)}</b><small>${esc(template.id)}</small></span></button>`).join('');
  }

  function renderSceneObjects(){
    const host=$('sceneList');
    if(!host)return;
    host.querySelectorAll('[data-ordinary-object-scene-id]').forEach(node=>node.remove());
    for(const [id,object] of Object.entries(currentDocument().entities?.objects||{}).sort(([a],[b])=>a.localeCompare(b))){
      const button=document.createElement('button');
      button.type='button';
      button.className='scene-item editor-ordinary-object-scene';
      button.dataset.ordinaryObjectSceneId=id;
      button.innerHTML=`<span>${esc(object.icon||'◈')}</span><span><b>${esc(object.name||id)}</b><small>一般物件 · ${esc(id)}</small></span>`;
      host.append(button);
    }
  }

  function renderMapObjects(){
    const map=$('editorMap');
    if(!map)return;
    map.querySelectorAll('.editor-ordinary-object-projection').forEach(node=>node.remove());
    const z=E.getSession().currentZ;
    for(const [id,object] of Object.entries(currentDocument().entities?.objects||{})){
      const position=object.position;
      if(!position||(position.z??0)!==z)continue;
      const cell=map.querySelector(`[data-cell="${position.x},${position.y}"]`);
      if(!cell)continue;
      const wrapper=document.createElement('span');
      wrapper.className='entity-markers editor-ordinary-object-projection';
      wrapper.innerHTML=`<span class="entity-marker marker-object ${selectedId===id?'selected':''}" data-entity-type="object" data-entity-id="${esc(id)}" data-editor-ordinary-object-id="${esc(id)}" title="一般物件：${esc(object.name||id)}">${esc(object.icon||'◈')}</span>`;
      cell.append(wrapper);
    }
  }

  function renderInspector(){
    const object=currentObject();
    if(!object)return;
    const position=object.position||{};
    const summary=$('selectionSummary'),actions=$('selectionActions');
    if(summary)summary.innerHTML=`<b>${esc(object.icon||'◈')} ${esc(object.name||selectedId)}</b><div>一般物件 · ID：<code>${esc(selectedId)}</code></div><div>位置：(${esc(position.x)}, ${esc(position.y)}, ${esc(position.z??0)})</div><div>承載：${object.supportId?`家具 <code>${esc(object.supportId)}</code>`:'地面／無家具 support'}</div><div>Affordances：${esc((object.affordances||[]).join(', ')||'—')}</div>`;
    if(actions)actions.innerHTML=`<button type="button" data-ordinary-object-action="move">移動一般物件</button><button type="button" class="danger-text" data-ordinary-object-action="remove">移除一般物件</button>`;
  }

  function render(){
    observer?.disconnect();
    renderCatalog();
    renderSceneObjects();
    renderMapObjects();
    renderOperation();
    renderInspector();
    syncDirtyUi();
    observer?.observe($('editorMap'),{childList:true,subtree:true});
  }

  function queueRender(){
    if(renderQueued)return;
    renderQueued=true;
    queueMicrotask(()=>{renderQueued=false;render();});
  }

  function commit(result,successMessage,{selectId=null}={}){
    if(!result?.ok){
      status=(result?.issues||[]).map(item=>item.message||item.code).join('；')||'操作被拒絕。';
      queueRender();
      return false;
    }
    nativeLoadDocument(result.candidate);
    selectedId=selectId;
    pending=null;
    status=successMessage;
    queueRender();
    return true;
  }

  function beginSupportResolution(base,result){
    pending={kind:'support',base,candidates:clone(result.meta?.candidates||[])};
    status='';
    queueRender();
  }

  function executeAt(target,supportChoice=null){
    const op=pending;
    if(!op)return;
    let result=null,selectId=null,message='';
    if(op.kind==='create'){
      result=createOrdinaryObjectFromTemplate(currentDocument(),{templateId:op.templateId,target,supportChoice});
      selectId=result?.meta?.newId||null;
      message=selectId?`已建立一般物件 ${selectId}。`:'已建立一般物件。';
    }else if(op.kind==='move'){
      result=moveOrdinaryObject(currentDocument(),{objectId:op.objectId,target,supportChoice});
      selectId=op.objectId;
      message=`已移動 ${op.objectId}。`;
    }else return;
    if(!result.ok&&result.issues?.some(item=>item.code==='support_choice_required')){
      beginSupportResolution({kind:op.kind,templateId:op.templateId,objectId:op.objectId,target:clone(target)},result);
      return;
    }
    commit(result,message,{selectId});
  }

  function resolveSupport(choice){
    if(pending?.kind!=='support')return;
    const base=pending.base;
    pending={...base};
    executeAt(base.target,choice);
  }

  document.addEventListener('click',event=>{
    const templateButton=event.target.closest('[data-object-template-id]');
    if(templateButton){
      pending={kind:'create',templateId:templateButton.dataset.objectTemplateId};
      selectedId=null;
      status='請在地圖上選擇一般物件的位置。';
      queueRender();
      return;
    }
    const sceneButton=event.target.closest('[data-ordinary-object-scene-id]');
    const marker=event.target.closest('[data-editor-ordinary-object-id]');
    if(sceneButton||marker){
      event.preventDefault();
      event.stopImmediatePropagation();
      selectedId=(sceneButton?.dataset.ordinaryObjectSceneId||marker?.dataset.editorOrdinaryObjectId);
      pending=null;
      status='';
      const object=currentObject();
      const z=object?.position?.z??0;
      const layer=$('layerSelect');
      if(layer&&String(E.getSession().currentZ)!==String(z)){
        layer.value=String(z);
        layer.dispatchEvent(new Event('change',{bubbles:true}));
      }
      queueRender();
      return;
    }
    const action=event.target.closest('[data-ordinary-object-action]');
    if(action&&selectedId){
      if(action.dataset.ordinaryObjectAction==='move'){
        pending={kind:'move',objectId:selectedId};
        status='請在地圖上選擇新的位置。';
        queueRender();
      }else if(action.dataset.ordinaryObjectAction==='remove'){
        const id=selectedId;
        const result=deleteOrdinaryObject(currentDocument(),{objectId:id});
        if(commit(result,`已移除一般物件 ${id}。`))selectedId=null;
      }
      return;
    }
    const support=event.target.closest('[data-ordinary-support-kind]');
    if(support){
      resolveSupport(support.dataset.ordinarySupportKind==='floor'?{kind:'floor'}:{kind:'furniture',furnitureId:support.dataset.ordinarySupportId});
      return;
    }
    if(event.target.closest('[data-ordinary-object-cancel]')){
      pending=null;
      status='已取消一般物件操作。';
      queueRender();
      return;
    }
    if((pending?.kind==='create'||pending?.kind==='move')&&event.target.closest('#editorMap [data-cell]')){
      event.preventDefault();
      event.stopImmediatePropagation();
      const cell=event.target.closest('[data-cell]');
      const [x,y]=cell.dataset.cell.split(',').map(Number);
      executeAt({x,y,z:E.getSession().currentZ});
    }
  },true);

  window.addEventListener('beforeunload',event=>{
    if(!dirty())return;
    event.preventDefault();
    event.returnValue='';
  });

  $('exportWorld')?.addEventListener('click',()=>setTimeout(markCleanBaseline,0));
  $('resetWorld')?.addEventListener('click',()=>setTimeout(()=>{
    baselineFingerprint=E.semanticFingerprint();
    pending=null;selectedId=null;status='';queueRender();
  },0));
  $('importWorld')?.addEventListener('change',()=>setTimeout(()=>{
    baselineFingerprint=E.semanticFingerprint();
    pending=null;selectedId=null;status='';queueRender();
  },100));

  observer=new MutationObserver(()=>queueRender());
  observer.observe($('editorMap'),{childList:true,subtree:true});
  render();
  API.renderEditorProjection=render;
})();
