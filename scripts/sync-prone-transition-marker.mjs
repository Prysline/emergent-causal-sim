import fs from 'node:fs';
import path from 'node:path';

const OLD='11.50.0-agent-turn-execution';
const NEXT='11.50.1-prone-transition-burden';
const changed=[];
const readText=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');

function writeIfChanged(file,next){
  const current=readText(file);
  if(current===next)return;
  fs.writeFileSync(file,next);
  changed.push(file.replaceAll('\\','/'));
}
function replaceRequired(text,oldText,newText,label){
  if(!text.includes(oldText))throw new Error(`Missing marker sync anchor: ${label}`);
  return text.replace(oldText,newText);
}
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(entry.isFile()&&entry.name.endsWith('.mjs')){
      const current=readText(full);
      if(current.includes(OLD))writeIfChanged(full,current.replaceAll(OLD,NEXT));
    }
  }
}

// All exact OLD occurrences under tests are current overall / Locomotion expectations,
// not historical documentation. Keep unaffected subsystem generation literals untouched.
walk('tests');

{
  const file='README.md';
  let text=readText(file);
  text=replaceRequired(
    text,
    '目前 runtime marker：**v11.50.0・Agent turn execution** (`11.50.0-agent-turn-execution`)。',
    '目前 runtime marker：**v11.50.1・Prone transition burden** (`11.50.1-prone-transition-burden`)。',
    'README current release'
  );
  writeIfChanged(file,text);
}

{
  const file='docs/versioning.md';
  let text=readText(file);
  const headerEnd='Previous release: `11.49.0-agent-facing-foundation` established canonical authored/runtime facing.';
  const headerEndIndex=text.indexOf(headerEnd);
  if(!text.startsWith('`'+OLD+'`')||headerEndIndex<0)throw new Error('Unexpected docs/versioning.md release header');
  const afterHeader=headerEndIndex+headerEnd.length;
  text=`\`${NEXT}\`

Current release: Locomotion calibrates objective mode-transition burden so entering or leaving \`proneCrawl\` costs 2 while \`walk <-> kneelCrawl\` remains 1. Per-meter crawl burden, timing, feasibility and subjective route preference are unchanged; sufficiently long detours may still make crawling the lower objective-cost route.

Previous release: \`${OLD}\` established explicit Agent turn execution and deterministic angular burden.`+text.slice(afterHeader);
  text=replaceRequired(text,`目前 current runtime marker：

\`${OLD}\``,`目前 current runtime marker：

\`${NEXT}\``,'versioning current marker');
  text=replaceRequired(text,'玩家可見的 app 頁首 current-version display 使用短版 `v11.50.0`','玩家可見的 app 頁首 current-version display 使用短版 `v11.50.1`','versioning visible marker');
  text=replaceRequired(text,'；Locomotion `'+OLD+'`；','；Locomotion `'+NEXT+'`；','versioning Locomotion generation');
  const oldHeading='### Current Agent turn execution release';
  const newSection=`### Current prone transition burden release

\`${NEXT}\` 只校準 Locomotion 的客觀 mode-transition burden：同 mode 維持 0，\`walk <-> kneelCrawl\` 維持 1，任何進入或離開 \`proneCrawl\` 的 transition 為 2。\`MODE_TRAVERSAL_BURDEN\`、MovementEnvelope、speed / travelTime、Passage feasibility、Furniture geometry、Crowding 與 subjective route preference 都不變。

這使 default dining table + 四張餐椅附近的短距離 \`walk -> proneCrawl -> walk\` shortcut 不再只為少走極少距離而勝過正常步行繞路；但足夠長的 walk detour 仍可由 canonical \`traversalCost\` 自然輸給 crawl，不加入桌底特判或 blanket crawl ban。

Version impact：overall / Presentation、Locomotion → \`${NEXT}\`。Spatial Traversal / Route 維持 \`11.38.0-carried-handling-risk\`；Physical、Spatial Passage、Dynamic Congestion、World Authoring、Furniture Catalog、Embodiment Capabilities 與其他 subsystem generation 均未改 contract，不假升。

### Previous Agent turn execution release`;
  text=replaceRequired(text,oldHeading,newSection,'versioning release section');
  writeIfChanged(file,text);
}

{
  const file='docs/architecture.md';
  let text=readText(file);
  const oldQuote="> Current `11.50.0-agent-turn-execution`: Locomotion owns explicit turn execution and unitless deterministic angular burden. Begin records evidence without changing facing; only successful completion commits canonical `Agent.facing`. Position updates, movement direction, interaction targets and Presentation remain non-authoritative. No turn-aware route policy, Visual / Auditory / Tactile implementation, new runtime hook or micro-time scheduler is introduced.";
  const replacement=`> Previous \`11.50.0-agent-turn-execution\`: Locomotion established explicit turn execution and unitless deterministic angular burden; successful completion remains the sole canonical \`Agent.facing\` commit point.

> Current \`11.50.1-prone-transition-burden\`: Locomotion keeps per-meter crawl burden and route feasibility unchanged but raises any transition entering or leaving \`proneCrawl\` to objective burden 2; \`walk <-> kneelCrawl\` remains 1. Short prone shortcuts must therefore justify both getting down and getting back up instead of winning over a small walk detour.`;
  text=replaceRequired(text,oldQuote,replacement,'architecture current release note');
  text=replaceRequired(text,'目前 runtime marker：`'+OLD+'`。','目前 runtime marker：`'+NEXT+'`。','architecture current marker');
  writeIfChanged(file,text);
}

{
  const file='docs/tick-pipeline.md';
  let text=readText(file);
  const oldQuote="> Current `11.50.0-agent-turn-execution`: turn execution adds no runtime hook or phase. `beginTurnExecution()` is non-mutating evidence construction; successful `completeTurnExecution()` is the sole turn commit point. Same-tick Visual remains a future consumer obligation: perception must snapshot canonical facing at tick start rather than reread a later same-tick turn result.";
  const replacement=`> Previous \`11.50.0-agent-turn-execution\`: turn execution adds no runtime hook or phase. \`beginTurnExecution()\` is non-mutating evidence construction; successful \`completeTurnExecution()\` is the sole turn commit point. Same-tick Visual remains a future consumer obligation.

> Current \`11.50.1-prone-transition-burden\`: prone transition calibration changes only synchronous Locomotion objective burden consumed by Route queries. It adds no runtime hook, phase, same-tick visibility change or RNG ordering change.`;
  text=replaceRequired(text,oldQuote,replacement,'tick-pipeline current release note');
  text=text.replace(/目前 runtime marker：`[^`]+`。/,'目前 runtime marker：`'+NEXT+'`。');
  writeIfChanged(file,text);
}

console.log(JSON.stringify({changed,count:changed.length},null,2));
