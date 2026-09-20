(() => {
  const A=window.SimWorldAuthoring,I=window.SimWorldInitializer;
  if(!A?.validateAuthoring||!A?.serializeAuthoring||!A?.parseAuthoringJSON||!I?.analyzeRuntimeCompatibility){
    throw new Error('World authoring and initializer compatibility helpers must load before editor-preview-bridge.js.');
  }

  const STORAGE_KEY='emergent-causal-sim.editor-preview.v1';
  const PREVIEW_PARAM='preview';
  const PREVIEW_VALUE='editor';
  const RESTORE_PARAM='restore';
  const RESTORE_VALUE='preview';
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const issue=(code,message,data={})=>({code,message,...data});

  function isPreviewRequested(){
    try{return new URLSearchParams(window.location.search).get(PREVIEW_PARAM)===PREVIEW_VALUE;}
    catch{return false;}
  }
  function isRestoreRequested(){
    try{return new URLSearchParams(window.location.search).get(RESTORE_PARAM)===RESTORE_VALUE;}
    catch{return false;}
  }

  function canonicalize(authoring){
    return A.canonicalizeAuthoring(A.cloneAuthoring(authoring));
  }

  function preflight(authoring){
    let canonical;
    try{canonical=canonicalize(authoring);}
    catch(error){
      return {ok:false,stage:'schema',issues:[issue(error.code||'preview_authoring_invalid',error.message||String(error))],diagnostics:[]};
    }
    const report=I.analyzeRuntimeCompatibility(canonical);
    if(!report.ok)return {ok:false,stage:report.stage||'runtime',issues:clone(report.hardErrors||[]),diagnostics:clone(report.diagnostics||[])};
    return {
      ok:true,
      stage:'ready',
      authoring:canonical,
      fingerprint:A.semanticFingerprint(canonical),
      issues:[],
      diagnostics:clone(report.diagnostics||[])
    };
  }

  function storePreview(authoring){
    const result=preflight(authoring);
    if(!result.ok)return result;
    try{window.sessionStorage.setItem(STORAGE_KEY,A.serializeAuthoring(result.authoring));}
    catch(error){
      return {ok:false,stage:'storage',issues:[issue('preview_storage_unavailable',error.message||String(error))],diagnostics:[]};
    }
    return result;
  }

  function loadStoredPreview(){
    let raw;
    try{raw=window.sessionStorage.getItem(STORAGE_KEY);}
    catch(error){
      return {ok:false,stage:'storage',issues:[issue('preview_storage_unavailable',error.message||String(error))],diagnostics:[]};
    }
    if(!raw)return {ok:false,stage:'storage',issues:[issue('preview_payload_missing','Editor Preview handoff is missing from this browser session.')],diagnostics:[]};
    try{return preflight(A.parseAuthoringJSON(raw));}
    catch(error){
      return {ok:false,stage:'schema',issues:[issue(error.code||'preview_payload_invalid',error.message||String(error))],diagnostics:[]};
    }
  }

  const requested=isPreviewRequested();
  const active=requested?loadStoredPreview():{ok:true,stage:'default',authoring:null,fingerprint:null,issues:[],diagnostics:[]};

  function getActivePreview(){
    return {
      requested,
      ok:!!active.ok,
      stage:active.stage,
      authoring:active.authoring?A.cloneAuthoring(active.authoring):null,
      fingerprint:active.fingerprint||null,
      issues:clone(active.issues||[]),
      diagnostics:clone(active.diagnostics||[])
    };
  }

  function getRestorePreview(){
    if(!isRestoreRequested())return {requested:false,ok:true,stage:'default',authoring:null,fingerprint:null,issues:[],diagnostics:[]};
    const result=loadStoredPreview();
    return {requested:true,...result,authoring:result.authoring?A.cloneAuthoring(result.authoring):null};
  }

  function updateIndicator(){
    const banner=document.getElementById('editorPreviewBanner');
    if(!banner)return;
    if(!requested){banner.hidden=true;return;}
    banner.hidden=false;
    banner.classList.toggle('preview-error',!active.ok);
    const title=banner.querySelector('[data-preview-title]');
    const detail=banner.querySelector('[data-preview-detail]');
    const editorLink=document.getElementById('worldEditorLink');
    if(editorLink)editorLink.href=requested&&active.ok?'editor.html?restore=preview':'editor.html';
    if(active.ok){
      if(title)title.textContent='Editor Preview';
      if(detail)detail.textContent='此模擬器由本次 Editor snapshot 啟動；重置會重建同一份 preview world。';
      document.body.dataset.previewMode='editor';
    }else{
      if(title)title.textContent='Editor Preview 無法啟動';
      if(detail)detail.textContent=(active.issues||[]).map(item=>item.message||item.code).join('；')||'Preview handoff 無效。';
      document.body.dataset.previewMode='error';
    }
  }

  window.SimEditorPreviewBridge={
    STORAGE_KEY,PREVIEW_PARAM,PREVIEW_VALUE,RESTORE_PARAM,RESTORE_VALUE,
    isPreviewRequested,isRestoreRequested,
    preflight,
    storePreview,
    loadStoredPreview,
    getActivePreview,
    getRestorePreview,
    startUI:updateIndicator,
    previewUrl:'index.html?preview=editor',
    restoreUrl:'editor.html?restore=preview'
  };
})();