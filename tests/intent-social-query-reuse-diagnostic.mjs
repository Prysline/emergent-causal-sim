import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {productionScriptsBefore,readRepoFile} from './helpers/production-loader.mjs';

const SELF=fileURLToPath(import.meta.url);
const CHILD_VARIANT=process.env.INTENT_SOCIAL_QUERY_REUSE_VARIANT||'';
const CHILD_TICKS=Number(process.env.INTENT_SOCIAL_QUERY_REUSE_TICKS||0);
const CHILD_OUTPUT=process.env.INTENT_SOCIAL_QUERY_REUSE_OUTPUT||'';

function replaceRequired(source,from,to,label){
  assert.ok(source.includes(from),'diagnostic source anchor missing: '+label);
  return source.replace(from,to);
}

function applyCandidatePatch(source){
  source=replaceRequired(
    source,
    "function utilityForIntent(st,a,intentKind,{intent=null}={}){",
    "function utilityForIntent(st,a,intentKind,{intent=null,socialTarget=null}={}){",
    'utilityForIntent option'
  );
  source=replaceRequired(
    source,
    "case'socialize':return a.kind==='human'&&nearestAgent(st,a,'human',{awakeOnly:true})?canonicalBaseUtility(a,'talk'):0;",
    "case'socialize':return a.kind==='human'&&(socialTarget||nearestAgent(st,a,'human',{awakeOnly:true}))?canonicalBaseUtility(a,'talk'):0;",
    'socialize availability reuse'
  );
  source=replaceRequired(
    source,
    "case'seekSocialContact':return E.isAnimalAgent?.(a)&&(a.needs?.social||0)>14&&nearestAgent(st,a,'human')?canonicalBaseUtility(a,'seekHuman'):0;",
    "case'seekSocialContact':return E.isAnimalAgent?.(a)&&(a.needs?.social||0)>14&&(socialTarget||nearestAgent(st,a,'human'))?canonicalBaseUtility(a,'seekHuman'):0;",
    'animal social availability reuse'
  );
  source=replaceRequired(
    source,
    "const push=(intentKind,actionKindValue,extra={})=>{const utility=utilityForIntent(st,a,intentKind);if(utility>0)out.push({intentKind,actionKind:actionKindValue,utility,decisionContributors:E.decisionContributorsForAction?.(a,actionKindValue)||[],...extra});};",
    "const push=(intentKind,actionKindValue,extra={},utilityOptions={})=>{const utility=utilityForIntent(st,a,intentKind,utilityOptions);if(utility>0)out.push({intentKind,actionKind:actionKindValue,utility,decisionContributors:E.decisionContributorsForAction?.(a,actionKindValue)||[],...extra});};",
    'candidate push utility options'
  );
  source=replaceRequired(
    source,
    "const h=nearestAgent(st,a,'human',{awakeOnly:true});if(h)push('socialize','talk',{targetAgent:h.id});",
    "const h=nearestAgent(st,a,'human',{awakeOnly:true});if(h)push('socialize','talk',{targetAgent:h.id},{socialTarget:h});",
    'human social target reuse'
  );
  source=replaceRequired(
    source,
    "const h=nearestAgent(st,a,'human');if(E.isAnimalAgent?.(a)&&(a.needs?.social||0)>14&&h)push('seekSocialContact','seekHuman',{targetAgent:h.id});",
    "const h=E.isAnimalAgent?.(a)&&(a.needs?.social||0)>14?nearestAgent(st,a,'human'):null;if(h)push('seekSocialContact','seekHuman',{targetAgent:h.id},{socialTarget:h});",
    'animal social threshold before query'
  );
  return source;
}

function instrumentSource(relativePath,source){
  if(relativePath==='src/systems/intent/deliberation.js'){
    source=replaceRequired(
      source,
      "function nearestAgent(st,a,kind,{awakeOnly=false}={}){",
      "function nearestAgent(st,a,kind,{awakeOnly=false}={}){globalThis.__intentSocialQueryDiag.track('nearestAgent',(a?.id||'?')+'>'+kind+'|awake:'+awakeOnly);",
      'nearestAgent instrumentation'
    );
    source=replaceRequired(
      source,
      'function candidateIntents(st,a){',
      "function candidateIntents(st,a){globalThis.__intentSocialQueryDiag.track('candidateIntents',a?.id||'?');",
      'candidateIntents instrumentation'
    );
  }
  if(relativePath==='src/spatial-traversal.js'){
    source=replaceRequired(
      source,
      "function bestInteractionPositionResult(st,a,target,affordance='default'){",
      "function bestInteractionPositionResult(st,a,target,affordance='default'){globalThis.__intentSocialQueryDiag.track('bestInteractionPositionResult',(a?.id||'?')+'>'+String(target?.id||target?.kind||'?')+'|'+affordance);",
      'bestInteractionPositionResult instrumentation'
    );
    source=replaceRequired(
      source,
      'function routeStateSearch(st,start,aOrId=null,options={}){',
      "function routeStateSearch(st,start,aOrId=null,options={}){globalThis.__intentSocialQueryDiag.track('routeStateSearch',(typeof aOrId==='string'?aOrId:aOrId?.id||'?')+'|'+String(options?.objective||'traversalCost'));",
      'routeStateSearch instrumentation'
    );
  }
  if(relativePath==='src/spatial-passage.js'){
    source=replaceRequired(
      source,
      'function traversalFeasibility(st,agent,from,to){',
      "function traversalFeasibility(st,agent,from,to){globalThis.__intentSocialQueryDiag.track('traversalFeasibility',agent?.id||agent?.kind||'?');",
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

function quietHuman(a){
  a.needs.hunger=0;
  a.needs.thirst=0;
  a.needs.fatigue=0;
  a.needs.sleepNeed=0;
  a.needs.social=0;
  a.traits.social=0;
  a.traits.animalAffinity=0;
  a.traits.alcoholLike=0;
  a.status.intoxication=0;
}

function bindWander(a){
  a.action={kind:'wander',phase:'move',started:0,wait:0,targetTile:{x:2,y:6},oneShot:true};
  a.activeIntent={id:`intent:${a.id}:0:explore`,kind:'explore',createdTick:0,lifecycle:'actionBound',source:{type:'test',tick:0}};
  a.action.intentId=a.activeIntent.id;
}

function runChild(){
  assert.ok(CHILD_VARIANT==='baseline'||CHILD_VARIANT==='candidate','child variant must be baseline or candidate');
  assert.ok(CHILD_TICKS===1||CHILD_TICKS===10,'child ticks must be 1 or 10');
  assert.ok(CHILD_OUTPUT,'child output path required');

  globalThis.window=globalThis;
  globalThis.__intentSocialQueryDiag=createCounter();

  for(const relativePath of productionScriptsBefore('src/ui/core.js')){
    let source=readRepoFile(relativePath);
    if(CHILD_VARIANT==='candidate'&&relativePath==='src/systems/intent/deliberation.js')source=applyCandidatePatch(source);
    source=instrumentSource(relativePath,source);
    vm.runInThisContext(source,{filename:relativePath});
  }

  const E=globalThis.SimEngine;
  assert.ok(E?.tick&&E?.candidateIntents&&E?.reconsiderationSnapshot,'diagnostic requires full production Intent runtime');
  E.reset(20260911);
  const st=E.getState(),actor=st.agents.zhen,target=st.agents.zhou;
  assert.ok(actor&&target,'diagnostic fixture requires zhen and zhou');
  for(const other of Object.values(st.agents||{}))if(other.id!==actor.id&&other.id!==target.id)other.offMap=true;
  actor.offMap=false;
  target.offMap=false;
  actor.position={x:5,y:5};
  target.position={x:7,y:5};
  quietHuman(actor);
  quietHuman(target);
  actor.needs.social=65;
  target.action=null;
  target.activeIntent=null;
  st.tick=2;
  bindWander(actor);

  const preflight=E.reconsiderationSnapshot(st,actor);
  assert.equal(preflight.ok,true,'fixture actor must be soft-reconsideration eligible');
  assert.ok(E.candidateIntents(st,actor).some(c=>c.intentKind==='socialize'),'fixture must expose a reachable socialize candidate');

  globalThis.__intentSocialQueryDiag.reset();
  const started=performance.now();
  for(let i=0;i<CHILD_TICKS;i++)E.tick();
  const elapsedMs=performance.now()-started;
  const finalState=E.getState();
  fs.writeFileSync(CHILD_OUTPUT,JSON.stringify({
    variant:CHILD_VARIANT,
    ticks:CHILD_TICKS,
    elapsedMs,
    stateJson:JSON.stringify(finalState),
    rngState:finalState.rngState,
    queries:globalThis.__intentSocialQueryDiag.snapshot()
  }));
}

function runCase(tmpDir,variant,ticks){
  const output=path.join(tmpDir,`${variant}-${ticks}.json`);
  const child=spawnSync(process.execPath,[SELF],{
    env:{...process.env,INTENT_SOCIAL_QUERY_REUSE_VARIANT:variant,INTENT_SOCIAL_QUERY_REUSE_TICKS:String(ticks),INTENT_SOCIAL_QUERY_REUSE_OUTPUT:output},
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
  for(const name of ['nearestAgent','bestInteractionPositionResult','routeStateSearch','traversalFeasibility']){
    assert.ok(calls(candidate,name)<calls(baseline,name),`${label} candidate must reduce ${name}: baseline=${calls(baseline,name)}, candidate=${calls(candidate,name)}`);
  }
  return {
    baseline:{elapsedMs:baseline.elapsedMs,queries:baseline.queries},
    candidate:{elapsedMs:candidate.elapsedMs,queries:candidate.queries},
    delta:{
      elapsedMs:candidate.elapsedMs-baseline.elapsedMs,
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
  const tmpDir=fs.mkdtempSync(path.join(os.tmpdir(),'intent-social-query-reuse-'));
  try{
    const singleBaseline=runCase(tmpDir,'baseline',1);
    const singleCandidate=runCase(tmpDir,'candidate',1);
    const step10Baseline=runCase(tmpDir,'baseline',10);
    const step10Candidate=runCase(tmpDir,'candidate',10);
    const report={
      note:'Diagnostic-only test-served Intent social availability reuse. No production source is modified.',
      single:compareCase('single tick',singleBaseline,singleCandidate),
      step10:compareCase('step(10)',step10Baseline,step10Candidate)
    };
    console.log('INTENT_SOCIAL_QUERY_REUSE_DIAGNOSTIC '+JSON.stringify(report));
    console.log('Intent social query reuse diagnostic: exact state/RNG parity + query reduction ok');
  } finally {
    fs.rmSync(tmpDir,{recursive:true,force:true});
  }
}
