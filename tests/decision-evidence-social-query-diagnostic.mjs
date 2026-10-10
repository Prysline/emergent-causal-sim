import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {productionScriptsBefore,readRepoFile} from './helpers/production-loader.mjs';

const SELF=fileURLToPath(import.meta.url);
const CHILD_VARIANT=process.env.DECISION_EVIDENCE_SOCIAL_QUERY_VARIANT||'';
const CHILD_TICKS=Number(process.env.DECISION_EVIDENCE_SOCIAL_QUERY_TICKS||0);
const CHILD_OUTPUT=process.env.DECISION_EVIDENCE_SOCIAL_QUERY_OUTPUT||'';

function replaceRequired(source,from,to,label){
  assert.ok(source.includes(from),'diagnostic source anchor missing: '+label);
  return source.replace(from,to);
}

function applyCandidatePatch(source){
  return replaceRequired(
    source,
    "const baseUtility=E.utilityForIntent(st,a,intentKind,{intent:null}),e=E.targetEvaluation(st,a,target,intentKind,baseUtility);",
    "const baseUtility=E.utilityForIntent(st,a,intentKind,{intent:null,socialTarget:target}),e=E.targetEvaluation(st,a,target,intentKind,baseUtility);",
    'selected social target base-utility availability reuse'
  );
}

function instrumentSource(relativePath,source){
  if(relativePath==='src/systems/intent/deliberation.js'){
    source=replaceRequired(
      source,
      "function nearestAgent(st,a,kind,{awakeOnly=false}={}){",
      "function nearestAgent(st,a,kind,{awakeOnly=false}={}){globalThis.__decisionEvidenceSocialQueryDiag.track('nearestAgent',(a?.id||'?')+'>'+kind+'|awake:'+awakeOnly);",
      'nearestAgent instrumentation'
    );
  }
  if(relativePath==='src/systems/intent/decision-evidence.js'){
    source=replaceRequired(
      source,
      'function selectedSocialTargetContributor(st,a,action,source){',
      "function selectedSocialTargetContributor(st,a,action,source){globalThis.__decisionEvidenceSocialQueryDiag.track('selectedSocialTargetContributor',(a?.id||'?')+'>'+String(action?.targetAgent||'?')+'|'+String(source?.intentKind||a?.activeIntent?.kind||'?'));",
      'selectedSocialTargetContributor instrumentation'
    );
  }
  if(relativePath==='src/spatial-traversal.js'){
    source=replaceRequired(
      source,
      "function bestInteractionPositionResult(st,a,target,affordance='default'){",
      "function bestInteractionPositionResult(st,a,target,affordance='default'){globalThis.__decisionEvidenceSocialQueryDiag.track('bestInteractionPositionResult',(a?.id||'?')+'>'+String(target?.id||target?.kind||'?')+'|'+affordance);",
      'bestInteractionPositionResult instrumentation'
    );
    source=replaceRequired(
      source,
      'function routeStateSearch(st,start,aOrId=null,options={}){',
      "function routeStateSearch(st,start,aOrId=null,options={}){globalThis.__decisionEvidenceSocialQueryDiag.track('routeStateSearch',(typeof aOrId==='string'?aOrId:aOrId?.id||'?')+'|'+String(options?.objective||'traversalCost'));",
      'routeStateSearch instrumentation'
    );
  }
  if(relativePath==='src/spatial-passage.js'){
    source=replaceRequired(
      source,
      'function traversalFeasibility(st,agent,from,to){',
      "function traversalFeasibility(st,agent,from,to){globalThis.__decisionEvidenceSocialQueryDiag.track('traversalFeasibility',agent?.id||agent?.kind||'?');",
      'traversalFeasibility instrumentation'
    );
  }
  return source;
}

function createCounter(){
  const store=new Map();
  return {
    track(name,key='all'){
      let row=store.get(name);
      if(!row){row={calls:0,keys:new Map()};store.set(name,row);}
      row.calls++;
      row.keys.set(String(key),(row.keys.get(String(key))||0)+1);
    },
    reset(){store.clear();},
    snapshot(){
      const out={};
      for(const [name,row] of store){
        out[name]={
          calls:row.calls,
          uniqueKeys:row.keys.size,
          top:[...row.keys.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([key,count])=>({key,count}))
        };
      }
      return out;
    }
  };
}

function quiet(a){
  for(const key of ['hunger','thirst','fatigue','sleepNeed','social','groomingNeed'])if(a.needs&&key in a.needs)a.needs[key]=0;
  if(a.traits){a.traits.social=0;a.traits.animalAffinity=0;a.traits.alcoholLike=0;}
  if(a.status)a.status.intoxication=0;
}

function runChild(){
  assert.ok(CHILD_VARIANT==='baseline'||CHILD_VARIANT==='candidate','child variant must be baseline or candidate');
  assert.ok(CHILD_TICKS===1||CHILD_TICKS===10,'child ticks must be 1 or 10');
  assert.ok(CHILD_OUTPUT,'child output path required');

  globalThis.window=globalThis;
  globalThis.__decisionEvidenceSocialQueryDiag=createCounter();

  for(const relativePath of productionScriptsBefore('src/ui/core.js')){
    let source=readRepoFile(relativePath);
    if(CHILD_VARIANT==='candidate'&&relativePath==='src/systems/intent/decision-evidence.js')source=applyCandidatePatch(source);
    source=instrumentSource(relativePath,source);
    vm.runInThisContext(source,{filename:relativePath});
  }

  const E=globalThis.SimEngine;
  assert.ok(E?.tick&&E?.candidateIntents&&E?.utilityForIntent&&E?.targetEvaluation,'diagnostic requires full production deliberation + Decision Evidence runtime');
  E.reset(3604);
  const st=E.getState(),actor=st.agents.zhen,target=st.agents.zhou;
  assert.ok(actor&&target,'diagnostic fixture requires zhen and zhou');
  for(const other of Object.values(st.agents||{}))if(other.id!==actor.id&&other.id!==target.id)other.offMap=true;
  actor.offMap=false;
  target.offMap=false;
  quiet(actor);
  actor.needs.social=95;
  actor.traits.social=1;
  actor.action=null;
  actor.activeIntent=null;
  target.action=null;
  target.activeIntent=null;

  const preflight=E.candidateIntents(st,actor).find(c=>c.intentKind==='socialize');
  assert.ok(preflight&&preflight.targetAgent===target.id,'fixture must expose zhou as the reachable socialize target');

  globalThis.__decisionEvidenceSocialQueryDiag.reset();
  const started=performance.now();
  let firstDecisionEvidence=null;
  for(let i=0;i<CHILD_TICKS;i++){
    E.tick();
    if(i===0){
      const current=E.getState().agents.zhen;
      assert.equal(current.action?.kind,'talk','first diagnostic tick must adopt talk');
      const contributor=current.decisionEvidence?.contributors?.find(c=>c?.kind==='socialTarget');
      assert.ok(contributor,'first diagnostic tick must freeze selected social target evidence');
      assert.equal(contributor.targetAgent,current.action.targetAgent,'frozen social target evidence must match the adopted Action target');
      firstDecisionEvidence=JSON.stringify(current.decisionEvidence);
    }
  }
  const elapsedMs=performance.now()-started;
  const finalState=E.getState();
  const queries=globalThis.__decisionEvidenceSocialQueryDiag.snapshot();
  assert.ok((queries.selectedSocialTargetContributor?.calls||0)>0,'fixture must exercise selectedSocialTargetContributor');
  fs.writeFileSync(CHILD_OUTPUT,JSON.stringify({
    variant:CHILD_VARIANT,
    ticks:CHILD_TICKS,
    elapsedMs,
    stateJson:JSON.stringify(finalState),
    rngState:finalState.rngState,
    firstDecisionEvidence,
    queries
  }));
}

function runCase(tmpDir,variant,ticks){
  const output=path.join(tmpDir,`${variant}-${ticks}.json`);
  const child=spawnSync(process.execPath,[SELF],{
    env:{...process.env,DECISION_EVIDENCE_SOCIAL_QUERY_VARIANT:variant,DECISION_EVIDENCE_SOCIAL_QUERY_TICKS:String(ticks),DECISION_EVIDENCE_SOCIAL_QUERY_OUTPUT:output},
    encoding:'utf8',
    maxBuffer:8*1024*1024
  });
  assert.equal(child.status,0,`${variant} ${ticks}-tick child failed:\n${child.stderr||child.stdout}`);
  return JSON.parse(fs.readFileSync(output,'utf8'));
}

function calls(result,name){return result.queries?.[name]?.calls||0;}
function compareCase(label,baseline,candidate){
  assert.equal(candidate.stateJson,baseline.stateJson,label+' candidate must preserve exact canonical simulation state');
  assert.deepEqual(candidate.rngState,baseline.rngState,label+' candidate must preserve RNG state');
  assert.equal(candidate.firstDecisionEvidence,baseline.firstDecisionEvidence,label+' candidate must preserve the exact frozen Decision Evidence payload');
  assert.equal(calls(candidate,'selectedSocialTargetContributor'),calls(baseline,'selectedSocialTargetContributor'),label+' candidate must not suppress final social-target evidence formation');
  for(const name of ['nearestAgent','bestInteractionPositionResult','routeStateSearch','traversalFeasibility']){
    assert.ok(calls(candidate,name)<calls(baseline,name),`${label} candidate must reduce ${name}: baseline=${calls(baseline,name)}, candidate=${calls(candidate,name)}`);
  }
  return {
    baseline:{elapsedMs:baseline.elapsedMs,queries:baseline.queries},
    candidate:{elapsedMs:candidate.elapsedMs,queries:candidate.queries},
    delta:{
      elapsedMs:candidate.elapsedMs-baseline.elapsedMs,
      selectedSocialTargetContributor:calls(candidate,'selectedSocialTargetContributor')-calls(baseline,'selectedSocialTargetContributor'),
      nearestAgent:calls(candidate,'nearestAgent')-calls(baseline,'nearestAgent'),
      bestInteractionPositionResult:calls(candidate,'bestInteractionPositionResult')-calls(baseline,'bestInteractionPositionResult'),
      routeStateSearch:calls(candidate,'routeStateSearch')-calls(baseline,'routeStateSearch'),
      traversalFeasibility:calls(candidate,'traversalFeasibility')-calls(baseline,'traversalFeasibility')
    }
  };
}

if(CHILD_VARIANT){
  runChild();
}else{
  const tmpDir=fs.mkdtempSync(path.join(os.tmpdir(),'decision-evidence-social-query-'));
  try{
    const singleBaseline=runCase(tmpDir,'baseline',1);
    const singleCandidate=runCase(tmpDir,'candidate',1);
    const step10Baseline=runCase(tmpDir,'baseline',10);
    const step10Candidate=runCase(tmpDir,'candidate',10);
    const report={
      note:'Diagnostic-only test-served Decision Evidence social availability reuse. No production source is modified.',
      single:compareCase('single tick',singleBaseline,singleCandidate),
      step10:compareCase('step(10)',step10Baseline,step10Candidate)
    };
    console.log('DECISION_EVIDENCE_SOCIAL_QUERY_DIAGNOSTIC '+JSON.stringify(report));
    console.log('Decision Evidence social query diagnostic: exact state/RNG/evidence parity + query reduction ok');
  } finally {
    fs.rmSync(tmpDir,{recursive:true,force:true});
  }
}
