(() => {
  const A=window.SimWorldAuthoring,M=window.SimEditorAuthoringMutations;
  if(!A?.cloneAuthoring||!A?.validateAuthoring||!A?.canonicalizeAuthoring||!A?.semanticFingerprint)throw new Error('SimWorldAuthoring must load before editor-standing-responsibility-authoring.js.');
  if(!M)throw new Error('SimEditorAuthoringMutations must load before editor-standing-responsibility-authoring.js.');
  const VERSION='editor-standing-responsibility-authoring-v1';
  const clone=value=>A.cloneAuthoring(value);
  const issue=(code,message,data={})=>({code,message,...data});
  const resourceLabel=resource=>({food:'食物',water:'水',alcohol:'酒'}[resource]||resource);

  function mutationResult(authoring,apply){
    const input=A.validateAuthoring(authoring);
    if(!input.ok)return {ok:false,candidate:null,issues:clone(input.errors),meta:{phase:'input-validation'}};
    const before=A.semanticFingerprint(authoring),candidate=clone(authoring);
    let meta={};
    try{meta=apply(candidate)||{};}catch(error){return {ok:false,candidate:null,issues:[issue(error.code||'editor_mutation_exception',error.message||String(error))],meta:{phase:'apply'}};}
    const report=A.validateAuthoring(candidate);
    if(!report.ok)return {ok:false,candidate:null,issues:clone(report.errors),meta:{...clone(meta),phase:'candidate-validation'}};
    const canonical=A.canonicalizeAuthoring(candidate);
    return {ok:true,candidate:canonical,issues:[],meta:{...clone(meta),beforeFingerprint:before,afterFingerprint:A.semanticFingerprint(canonical)}};
  }
  function availableRestockResources(authoring){
    return [...new Set(Object.values(authoring?.entities?.objects||{}).map(object=>object?.restock?.resource).filter(resource=>typeof resource==='string'&&resource))].sort();
  }
  function responsibilityId(residentId,resource){return `responsibility:${residentId}:restock:${resource}`;}
  function listResidentRestockResponsibilities(authoring,residentId){
    return (authoring?.resourceResponsibilityAssignments||[]).filter(assignment=>assignment?.principal?.kind==='agent'&&assignment.principal.id===residentId&&assignment.responsibility==='restock').map(clone);
  }
  function setResidentRestockResponsibility(authoring,{residentId,resource,assigned}){
    return mutationResult(authoring,candidate=>{
      if(!candidate.residents?.[residentId]){const error=new Error(`Resident ${residentId} does not exist.`);error.code='standing_responsibility_resident_missing';throw error;}
      if(!availableRestockResources(candidate).includes(resource)){const error=new Error(`Resource ${resource} has no authored restock policy.`);error.code='standing_responsibility_resource_unsupported';throw error;}
      candidate.resourceResponsibilityAssignments=Array.isArray(candidate.resourceResponsibilityAssignments)?candidate.resourceResponsibilityAssignments:[];
      const semantic=assignment=>assignment?.principal?.kind==='agent'&&assignment.principal.id===residentId&&assignment.responsibility==='restock'&&assignment.scope?.resource===resource;
      candidate.resourceResponsibilityAssignments=candidate.resourceResponsibilityAssignments.filter(assignment=>!semantic(assignment));
      if(assigned)candidate.resourceResponsibilityAssignments.push({id:responsibilityId(residentId,resource),principal:{kind:'agent',id:residentId},responsibility:'restock',scope:{resource}});
      return {residentId,resource,assigned:!!assigned};
    });
  }

  Object.assign(M,{STANDING_RESPONSIBILITY_AUTHORING_VERSION:VERSION,availableRestockResources,listResidentRestockResponsibilities,setResidentRestockResponsibility});
  window.SimEditorStandingResponsibilityAuthoring={VERSION,availableRestockResources,listResidentRestockResponsibilities,setResidentRestockResponsibility};

  if(typeof document==='undefined')return;
  const E=window.SimWorldEditor;
  if(!E?.getDocument||!E?.getSession||!E?.loadDocument||!E?.semanticFingerprint||!E?.selectEntity)return;
  const actions=document.getElementById('selectionActions'),dirtyPill=document.getElementById('dirtyStatus');if(!actions)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const nativeLoadDocument=E.loadDocument.bind(E),nativeGetSession=E.getSession.bind(E);
  let baselineFingerprint=E.semanticFingerprint(),inheritedDirty=nativeGetSession().dirty===true;
  function dirty(){return inheritedDirty||E.semanticFingerprint()!==baselineFingerprint;}
  E.getSession=()=>({...nativeGetSession(),dirty:dirty()});
  E.loadDocument=next=>{const result=nativeLoadDocument(next);baselineFingerprint=E.semanticFingerprint();inheritedDirty=false;renderUi();return result;};
  function syncDirty(){if(!dirtyPill)return;const value=dirty();dirtyPill.textContent=value?'有未匯出修改':'未修改';dirtyPill.classList.toggle('clean',!value);dirtyPill.classList.toggle('dirty',value);}
  function renderUi(){
    const existing=actions.querySelector('[data-standing-responsibility-editor]'),selection=E.getSession().selection;
    if(selection?.kind!=='entity'||selection.type!=='resident'){existing?.remove();syncDirty();return;}
    const authoring=E.getDocument(),resources=availableRestockResources(authoring),assigned=new Set(listResidentRestockResponsibilities(authoring,selection.id).map(item=>item.scope.resource));
    const signature=JSON.stringify([selection.id,resources,[...assigned].sort()]);
    if(existing?.dataset.signature===signature){syncDirty();return;}
    existing?.remove();
    const section=document.createElement('div');section.dataset.standingResponsibilityEditor='';section.dataset.signature=signature;section.className='selection-card';
    section.innerHTML=`<strong>長期責任</strong><p class="hint">這裡以居民為入口設定，但正式 truth 保存在 World-level Resource Responsibility Assignment；第一版只支援補貨責任。</p>${resources.length?resources.map(resource=>`<label><input type="checkbox" data-standing-responsibility-resource="${esc(resource)}" ${assigned.has(resource)?'checked':''}> 補充 ${esc(resourceLabel(resource))}</label>`).join(''):'<p class="hint">目前沒有可設定的 restock policy。</p>'}`;
    actions.append(section);syncDirty();
  }
  actions.addEventListener('change',event=>{
    const input=event.target.closest?.('[data-standing-responsibility-resource]');if(!input)return;
    const selection=E.getSession().selection;if(selection?.kind!=='entity'||selection.type!=='resident')return;
    const result=setResidentRestockResponsibility(E.getDocument(),{residentId:selection.id,resource:input.dataset.standingResponsibilityResource,assigned:input.checked});
    if(!result.ok){input.checked=!input.checked;throw new Error((result.issues||[]).map(item=>item.message||item.code).join('; ')||'Standing Responsibility editor mutation rejected.');}
    nativeLoadDocument(result.candidate);E.selectEntity('resident',selection.id);renderUi();
  });
  const observer=new MutationObserver(()=>renderUi());observer.observe(actions,{childList:true});
  document.getElementById('exportWorld')?.addEventListener('click',()=>setTimeout(()=>{if(nativeGetSession().dirty===false){baselineFingerprint=E.semanticFingerprint();inheritedDirty=false;renderUi();}},0));
  document.getElementById('resetWorld')?.addEventListener('click',()=>setTimeout(()=>{if(nativeGetSession().dirty===false){baselineFingerprint=E.semanticFingerprint();inheritedDirty=false;renderUi();}},0));
  document.getElementById('importWorld')?.addEventListener('change',()=>setTimeout(()=>{if(nativeGetSession().dirty===false){baselineFingerprint=E.semanticFingerprint();inheritedDirty=false;renderUi();}},120));
  renderUi();
})();
