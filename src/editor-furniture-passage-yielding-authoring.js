(() => {
  const A=window.SimWorldAuthoring,M=window.SimEditorAuthoringMutations;
  if(!A?.resolveFurniturePassageYieldingContract||!A?.validateAuthoring||!A?.canonicalizeAuthoring||!A?.semanticFingerprint)throw new Error('editor-furniture-passage-yielding-authoring.js requires World Authoring v17.');
  if(!M)throw new Error('editor-furniture-passage-yielding-authoring.js requires SimEditorAuthoringMutations.');
  const VERSION='editor-furniture-passage-yielding-authoring-v1',clone=value=>A.cloneAuthoring(value),issue=(code,message,data={})=>({code,message,...data});

  function mutationResult(authoring,apply){
    const input=A.validateAuthoring(authoring);if(!input.ok)return {ok:false,candidate:null,issues:clone(input.errors),meta:{phase:'input-validation'}};
    const before=A.semanticFingerprint(authoring),candidate=clone(authoring);let meta={};
    try{meta=apply(candidate)||{};}catch(error){return {ok:false,candidate:null,issues:[issue(error.code||'editor_mutation_exception',error.message||String(error))],meta:{phase:'apply'}};}
    const report=A.validateAuthoring(candidate);if(!report.ok)return {ok:false,candidate:null,issues:clone(report.errors),meta:{...clone(meta),phase:'candidate-validation'}};
    const canonical=A.canonicalizeAuthoring(candidate);return {ok:true,candidate:canonical,issues:[],meta:{...clone(meta),beforeFingerprint:before,afterFingerprint:A.semanticFingerprint(canonical)}};
  }
  function setFurniturePassageYielding(authoring,{furnitureId,enabled,useDefault=true,parkedOrigin=null}={}){
    return mutationResult(authoring,candidate=>{
      const furniture=candidate.furniture?.[furnitureId];if(!furniture){const error=new Error(`Furniture ${String(furnitureId)} does not exist.`);error.code='passage_yielding_furniture_missing';throw error;}
      if(!enabled){delete furniture.passageYielding;delete furniture.parkedPlacement;return {furnitureId,enabled:false};}
      furniture.passageYielding=true;
      if(useDefault){delete furniture.parkedPlacement;}
      else{
        if(!parkedOrigin||![parkedOrigin.x,parkedOrigin.y,parkedOrigin.z].every(Number.isInteger)){const error=new Error('Explicit parked placement requires integer x / y / z.');error.code='passage_yielding_parked_origin_invalid';throw error;}
        furniture.parkedPlacement={origin:clone(parkedOrigin),orientation:furniture.orientation};
      }
      return {furnitureId,enabled:true,useDefault:!furniture.parkedPlacement,parkedPlacement:clone(A.resolveFurniturePassageYieldingContract(furniture)?.parkedPlacement||null)};
    });
  }
  Object.assign(M,{FURNITURE_PASSAGE_YIELDING_AUTHORING_VERSION:VERSION,setFurniturePassageYielding});
  window.SimEditorFurniturePassageYieldingAuthoring={VERSION,setFurniturePassageYielding};

  if(typeof document==='undefined')return;
  const E=window.SimWorldEditor;if(!E?.getDocument||!E?.getSession||!E?.loadDocument||!E?.selectEntity)return;
  const actions=document.getElementById('selectionActions');if(!actions)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const nativeLoadDocument=E.loadDocument.bind(E);
  function commit(result,furnitureId){if(!result.ok)throw new Error((result.issues||[]).map(item=>item.message||item.code).join('; ')||'Passage Yielding editor mutation rejected.');nativeLoadDocument(result.candidate);E.selectEntity('furniture',furnitureId);renderUi();}
  function renderUi(){
    const existing=actions.querySelector('[data-furniture-passage-yielding-editor]'),selection=E.getSession().selection;
    if(selection?.kind!=='entity'||selection.type!=='furniture'){existing?.remove();return;}
    const authoring=E.getDocument(),furniture=authoring.furniture?.[selection.id];if(!furniture){existing?.remove();return;}
    const contract=A.resolveFurniturePassageYieldingContract(furniture),enabled=furniture.passageYielding===true,explicit=!!furniture.parkedPlacement,parked=contract?.parkedPlacement||null,signature=JSON.stringify([selection.id,enabled,explicit,parked]);
    if(existing?.dataset.signature===signature)return;existing?.remove();
    const section=document.createElement('div');section.dataset.furniturePassageYieldingEditor='';section.dataset.signature=signature;section.className='selection-card';
    section.innerHTML=`<strong>通道讓路</strong><p class="hint">只 author bounded Passage Yielding contract；runtime 仍會重新檢查觀測、接觸位置、依賴與完整 3D geometry。</p><label><input type="checkbox" data-passage-yielding-enabled ${enabled?'checked':''}> 允許局部收回至 parked placement</label>${enabled?`<label>Parked 來源 <select data-passage-yielding-mode><option value="default" ${explicit?'':'selected'}>Facing 前方一格（default）</option><option value="explicit" ${explicit?'selected':''}>Explicit override</option></select></label><div class="summary-grid"><span>固定 parked</span><b>${parked?`${esc(parked.origin.x)}, ${esc(parked.origin.y)}, Z ${esc(parked.origin.z)} · ${esc(parked.orientation)}`:'不可推導'}</b></div>${explicit&&parked?`<div class="summary-grid"><label>X <input type="number" step="1" data-passage-yielding-coordinate="x" value="${esc(parked.origin.x)}"></label><label>Y <input type="number" step="1" data-passage-yielding-coordinate="y" value="${esc(parked.origin.y)}"></label><label>Z <input type="number" step="1" data-passage-yielding-coordinate="z" value="${esc(parked.origin.z)}"></label></div>`:''}`:''}`;
    actions.append(section);
  }
  actions.addEventListener('change',event=>{
    const selection=E.getSession().selection;if(selection?.kind!=='entity'||selection.type!=='furniture')return;const furnitureId=selection.id,authoring=E.getDocument();
    const enabledInput=event.target.closest?.('[data-passage-yielding-enabled]');if(enabledInput){commit(setFurniturePassageYielding(authoring,{furnitureId,enabled:enabledInput.checked,useDefault:true}),furnitureId);return;}
    const mode=event.target.closest?.('[data-passage-yielding-mode]');if(mode){const furniture=authoring.furniture[furnitureId],contract=A.resolveFurniturePassageYieldingContract(furniture);commit(setFurniturePassageYielding(authoring,{furnitureId,enabled:true,useDefault:mode.value==='default',parkedOrigin:contract?.parkedPlacement?.origin}),furnitureId);return;}
    const coord=event.target.closest?.('[data-passage-yielding-coordinate]');if(coord){const furniture=authoring.furniture[furnitureId],contract=A.resolveFurniturePassageYieldingContract(furniture),origin=clone(contract?.parkedPlacement?.origin||{});origin[coord.dataset.passageYieldingCoordinate]=Number(coord.value);commit(setFurniturePassageYielding(authoring,{furnitureId,enabled:true,useDefault:false,parkedOrigin:origin}),furnitureId);}
  });
  new MutationObserver(()=>renderUi()).observe(actions,{childList:true});renderUi();
})();