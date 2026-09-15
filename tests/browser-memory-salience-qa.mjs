import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-memory-salience-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function seedRetentionStory(){
  await page.evaluate(()=>{
    const E=window.SimEngine;E.reset(1133);const st=E.getState();
    st.agents.zhou.position={x:5,y:5};
    st.agents.orange.position={x:5,y:6};
    st.agents.zhen.position={x:7,y:5};
    st.agents.orange.needs.social=90;
    for(let i=0;i<64;i++)E.addEvent(`低重要度背景事件 ${i}`,'normal',[],{actor:'zhou',action:'groom',position:'5,5'});
    const importantId=E.addEvent('老周摸了橘子。','good',[],{actor:'zhou',target:'orange',action:'petCat',position:'5,6',debugSecret:'retention-browser-hidden'});
    window.__retentionQaImportantId=importantId;
    document.querySelector('[data-entity="agent:orange"]')?.click();
  });
  await page.waitForSelector('[data-v1130-memory]');
  await page.waitForSelector('[data-v1133-retention]');
  await page.waitForSelector('[data-v1132-affect]');
}

async function snapshot(){
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState(),a=st.agents.orange,id=window.__retentionQaImportantId;
    const important=a.episodicMemories.find(m=>m.sourceEventId===id);
    const components=important?E.memoryRetentionComponents(st,a,important):null;
    const retentionSection=document.querySelector('[data-v1133-retention]');
    return {
      version:st.version,retentionVersion:E.MEMORY_RETENTION_SCHEMA_VERSION,
      memoryCount:a.episodicMemories.length,cap:E.MAX_EPISODIC_MEMORIES,
      importantId:id,importantPresent:!!important,importantAction:important?.observed?.action??null,
      importantScore:components?.score??null,protectedByAffect:components?.protectedByAffect??false,
      affectSourceMemoryId:a.affect?.source?.memoryId??null,
      affectSourcePresent:!!a.episodicMemories.find(m=>m.id===a.affect?.source?.memoryId),
      persistedSalience:a.episodicMemories.some(m=>['salience','retentionScore','importance','retentionProtected'].some(k=>Object.prototype.hasOwnProperty.call(m,k))),
      validator:window.SimValidator.validateState(st),
      retentionVisible:!!retentionSection?.getClientRects().length,
      inspectorText:document.getElementById('inspector')?.innerText??'',
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active')??false,
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false
    };
  });
}

function assertStory(s,label){
  assert.equal(s.version,'11.13.3-memory-salience-pruning',`${label}: state version mismatch`);
  assert.equal(s.retentionVersion,'11.13.3-memory-salience-pruning',`${label}: retention schema mismatch`);
  assert.equal(s.memoryCount,s.cap,`${label}: memory cap should remain bounded after 65th observed event`);
  assert.equal(s.cap,64,`${label}: cap changed unexpectedly`);
  assert.equal(s.importantPresent,true,`${label}: important 65th memory was pruned before appraisal/Affect retention could protect it`);
  assert.equal(s.importantAction,'petCat',`${label}: important memory action mismatch`);
  assert.ok(s.importantScore>0,`${label}: derived salience missing`);
  assert.equal(s.protectedByAffect,true,`${label}: active Affect source should be retention-protected`);
  assert.ok(s.affectSourceMemoryId?.startsWith('memory:orange:'),`${label}: Affect source memory id missing`);
  assert.equal(s.affectSourcePresent,true,`${label}: active Affect source points at pruned memory`);
  assert.equal(s.persistedSalience,false,`${label}: salience must remain derived rather than persistent memory state`);
  assert.equal(s.validator.issueCount,0,`${label}: validator ${s.validator.issues.map(x=>x.code).join(', ')}`);
  assert.equal(s.retentionVisible,true,`${label}: Memory Retention Inspector section missing`);
  assert.ok(s.inspectorText.includes('Memory Retention'),`${label}: retention heading missing`);
  assert.ok(s.inspectorText.includes('Salience'),`${label}: salience observability missing`);
  assert.ok(s.inspectorText.includes('Affect source 保護中'),`${label}: active source protection should be legible`);
  assert.ok(!s.inspectorText.includes('retention-browser-hidden'),`${label}: raw event private/debug payload leaked into Inspector`);
}

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.MEMORY_RETENTION_SCHEMA_VERSION==='11.13.3-memory-salience-pruning');
assert.ok((await page.title()).includes('v11.13.3'));
await seedRetentionStory();
const desktop=await snapshot();assertStory(desktop,'desktop');
assert.ok(desktop.docWidth<=desktop.width+1,`desktop document overflow: ${desktop.docWidth}>${desktop.width}`);
assert.ok(desktop.bodyWidth<=desktop.width+1,`desktop body overflow: ${desktop.bodyWidth}>${desktop.width}`);
await page.screenshot({path:`${outDir}/desktop.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await page.reload({waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.MEMORY_RETENTION_SCHEMA_VERSION==='11.13.3-memory-salience-pruning');
await seedRetentionStory();
const mobile=await snapshot();assertStory(mobile,'mobile');
assert.equal(mobile.inspectorActive,true,'mobile Agent selection should open Inspector');
assert.equal(mobile.navActive,true,'mobile Inspector nav should be active');
assert.ok(mobile.docWidth<=mobile.width+1,`mobile document overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop:{...desktop,inspectorText:undefined},mobile:{...mobile,inspectorText:undefined},pageErrors,consoleErrors},null,2));
console.log('v11.13.3 browser memory salience QA: 2/2 pass');
await browser.close();
