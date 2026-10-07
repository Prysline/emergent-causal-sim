import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-debug-inspector-desktop-nav-scroll-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function openDebug(){
  await page.goto('http://127.0.0.1:4173/?scenario=talk-no-response',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Array.isArray(window.SimUI?.DEBUG_INSPECTOR_VIEWS)&&window.SimUI.DEBUG_INSPECTOR_VIEWS.length===7);
  await page.evaluate(()=>{
    const node=document.querySelector('[data-entity="agent:zhou"]');
    if(!node)throw new Error('desktop nav QA could not find agent:zhou');
    node.click();
  });
  await page.waitForSelector('[data-v1140-resident-root]');
  await page.click('[data-v1140-mode="debug"]');
  await page.waitForFunction(()=>document.querySelector('[data-v1140-debug-view]')?.hidden===false);
  await page.waitForSelector('[data-debug-inspector-nav]');
}

async function snapshot(){
  return page.evaluate(()=>{
    const nav=document.querySelector('[data-debug-inspector-nav]');
    if(!nav)throw new Error('missing Debug Inspector navigation');
    const style=getComputedStyle(nav),webkitScrollbar=getComputedStyle(nav,'::-webkit-scrollbar'),last=nav.querySelector('[data-debug-inspector-view="all"]');
    const navRect=nav.getBoundingClientRect(),lastRect=last?.getBoundingClientRect();
    return {
      clientWidth:nav.clientWidth,
      scrollWidth:nav.scrollWidth,
      scrollLeft:nav.scrollLeft,
      overflowX:style.overflowX,
      scrollbarWidth:style.scrollbarWidth,
      scrollbarGutter:style.scrollbarGutter,
      scrollbarDisplay:webkitScrollbar.display,
      scrollbarHeight:webkitScrollbar.height,
      boxShadow:style.boxShadow,
      navLeft:navRect.left,
      navRight:navRect.right,
      lastLeft:lastRect?.left??0,
      lastRight:lastRect?.right??0
    };
  });
}

try{
  await openDebug();
  let desktop=await snapshot();
  assert.ok(desktop.scrollWidth>desktop.clientWidth,'desktop Debug category navigation fixture must actually overflow horizontally');
  assert.equal(desktop.overflowX,'auto','desktop Debug category navigation must remain horizontally scrollable');
  assert.equal(desktop.scrollbarWidth,'thin','desktop Debug category navigation must expose a thin native scrollbar');
  assert.match(desktop.scrollbarGutter,/stable/,'desktop navigation must reserve stable scrollbar space instead of hiding the control');
  assert.notEqual(desktop.scrollbarDisplay,'none','desktop WebKit scrollbar must not be hidden');
  assert.ok(Number.parseFloat(desktop.scrollbarHeight)>=6,'desktop WebKit scrollbar must have an operable track height');
  assert.match(desktop.boxShadow,/inset/,'desktop navigation should retain a subtle right-edge overflow affordance');

  const nav=page.locator('[data-debug-inspector-nav]');
  assert.ok(await nav.boundingBox(),'desktop Debug category navigation must have a rendered box');
  await page.evaluate(()=>{
    const nav=document.querySelector('[data-debug-inspector-nav]');
    nav.scrollLeft=nav.scrollWidth;
  });
  await page.waitForFunction(()=>{
    const nav=document.querySelector('[data-debug-inspector-nav]'),last=nav?.querySelector('[data-debug-inspector-view="all"]');
    if(!nav||!last)return false;
    const nr=nav.getBoundingClientRect(),lr=last.getBoundingClientRect();
    return nav.scrollLeft>0&&lr.left>=nr.left-1&&lr.right<=nr.right+1;
  });
  desktop=await snapshot();
  assert.ok(desktop.scrollLeft>0,'desktop category navigation must support horizontal scrolling');
  assert.ok(desktop.lastLeft>=desktop.navLeft-1&&desktop.lastRight<=desktop.navRight+1,'the final All category must be reachable inside the desktop scroller');
  await nav.screenshot({path:`${outDir}/desktop-debug-category-nav.png`});

  assert.deepEqual(consoleErrors,[],'browser console errors');
  assert.deepEqual(pageErrors,[],'browser page errors');
  console.log('browser-debug-inspector-desktop-nav-scroll-qa: ok');
}finally{
  await browser.close();
}
