from pathlib import Path
import re
import textwrap

ROOT=Path('.')
FALLBACK_FILES=[
  'affect-runtime-v1132.js','appraisal-human-social-response-v1133a.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js',
  'engine-spatial-v1114.js','human-social-response-runtime-v1133a.js','intent-runtime-v1121.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-deliberation-runtime-v1134.js','memory-retention-runtime-v1133.js','memory-runtime-v1130.js','social-bid-runtime-v1122.js',
  'social-outcome-memory-runtime-v1135.js','social-response-runtime-v1132a.js','ui-observability-controls-v1133a.js','ui-resident-view-v1140.js'
]
TESTS_TO_MIGRATE=[
  'action-terminology.mjs','active-intent-foundation.mjs','animal-social-outcome-memory.mjs','episodic-memory-foundation.mjs',
  'event-appraisal.mjs','human-social-response-agency.mjs','intent-replan-preemption.mjs','legacy-pending-interaction-cleanup.mjs',
  'memory-deliberation-influence.mjs','memory-salience-pruning.mjs','presentation-observability-v1140.mjs','requester-social-outcome-memory.mjs',
  'short-lived-affect.mjs','social-bid-lifecycle.mjs','social-response-agency.mjs','soft-reconsideration-hysteresis.mjs','surface-liquid-foundation.mjs'
]


def skip_ws(text,i):
    while i<len(text) and text[i].isspace(): i+=1
    return i


def scan_statement(text,start):
    i=skip_ws(text,start)
    if i>=len(text): raise ValueError('unexpected EOF')
    if text[i]=='{':
        open_i=i; depth=0; quote=None; esc=False; line_comment=False; block_comment=False
        j=i
        while j<len(text):
            c=text[j]; n=text[j+1] if j+1<len(text) else ''
            if line_comment:
                if c=='\n': line_comment=False
                j+=1; continue
            if block_comment:
                if c=='*' and n=='/': block_comment=False; j+=2; continue
                j+=1; continue
            if quote:
                if esc: esc=False
                elif c=='\\': esc=True
                elif c==quote: quote=None
                j+=1; continue
            if c=='/' and n=='/': line_comment=True; j+=2; continue
            if c=='/' and n=='*': block_comment=True; j+=2; continue
            if c in "'\"`": quote=c; j+=1; continue
            if c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0:
                    return j+1,text[open_i+1:j],True
            j+=1
        raise ValueError('unclosed block')

    par=brack=brace=0; quote=None; esc=False; line_comment=False; block_comment=False
    j=i
    while j<len(text):
        c=text[j]; n=text[j+1] if j+1<len(text) else ''
        if line_comment:
            if c=='\n': line_comment=False
            j+=1; continue
        if block_comment:
            if c=='*' and n=='/': block_comment=False; j+=2; continue
            j+=1; continue
        if quote:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: quote=None
            j+=1; continue
        if c=='/' and n=='/': line_comment=True; j+=2; continue
        if c=='/' and n=='*': block_comment=True; j+=2; continue
        if c in "'\"`": quote=c; j+=1; continue
        if c=='(': par+=1
        elif c==')': par-=1
        elif c=='[': brack+=1
        elif c==']': brack-=1
        elif c=='{': brace+=1
        elif c=='}': brace-=1
        elif c==';' and par==0 and brack==0 and brace==0:
            return j+1,text[i:j+1],False
        j+=1
    raise ValueError('unterminated statement')


def strictize_runtime_file(path):
    text=path.read_text()
    marker='if(E.registerRuntimeHook)'
    if text.count(marker)!=1:
        raise SystemExit(f'{path}: expected exactly one {marker}, got {text.count(marker)}')
    start=text.index(marker)
    line_start=text.rfind('\n',0,start)+1
    indent=text[line_start:start]
    if indent.strip(): raise SystemExit(f'{path}: unexpected inline registration if')
    after_if=start+len(marker)
    then_end,then_body,then_braced=scan_statement(text,after_if)
    else_pos=skip_ws(text,then_end)
    if not text.startswith('else',else_pos):
        raise SystemExit(f'{path}: expected compatibility else branch')
    else_end,_,_=scan_statement(text,else_pos+4)
    if then_braced:
        body=textwrap.dedent(then_body).strip('\n')
    else:
        body=then_body.strip()
    body='\n'.join((indent+line if line.strip() else '') for line in body.splitlines())
    replacement=(
        f"{indent}if(!E.registerRuntimeHook)throw new Error('{path.name} requires runtime-hook-pipeline.js');\n"
        f"{body}"
    )
    text=text[:start]+replacement+text[else_end:]
    forbidden=re.compile(r'\bE\.(?:tick|reset|onEpisodicMemoryCreated)\s*=')
    if forbidden.search(text): raise SystemExit(f'{path}: lifecycle method assignment remains after fallback removal')
    for token in ('baseTick','baseReset','priorMemoryCreatedHook','baseMemoryHook'):
        if token in text: raise SystemExit(f'{path}: legacy wrapper token remains: {token}')
    path.write_text(text)


for name in FALLBACK_FILES:
    strictize_runtime_file(ROOT/'src'/name)

engine_ref=re.compile(r"(['\"])engine\.js\1\s*,")
for name in TESTS_TO_MIGRATE:
    path=ROOT/'tests'/name
    text=path.read_text()
    if 'runtime-hook-pipeline.js' in text:
        raise SystemExit(f'{name}: already has pipeline; audit list is stale')
    matches=list(engine_ref.finditer(text))
    if len(matches)!=1:
        raise SystemExit(f'{name}: expected exactly one quoted engine.js load, got {len(matches)}')
    m=matches[0]; q=m.group(1)
    text=text[:m.end()]+f"{q}runtime-hook-pipeline.js{q},"+text[m.end():]
    path.write_text(text)

# Current Architecture: focused tests use the same lifecycle dispatcher as production; no compatibility wrapper runtime remains.
docs_path=ROOT/'docs/architecture.md'
docs=docs_path.read_text()
old='為 isolated legacy test harness 保留的「沒有 pipeline 時 fallback wrapper」不代表正常 app contract；正常 app 不得退回以 wrapper stacking 決定 lifecycle。'
new='Runtime hook extension 不再保留「沒有 pipeline 時 fallback wrapper」。任何需要 `registerRuntimeHook` 的 extension 若未先載入 `runtime-hook-pipeline.js` 必須 loud failure；focused Node test 也必須在 `engine.js` 後、任何 hook extension 前載入同一 production pipeline。正常 app 與 test 不再存在第二套 wrapper-stacking lifecycle。'
if docs.count(old)!=1:
    raise SystemExit(f'architecture fallback sentence count={docs.count(old)}')
docs_path.write_text(docs.replace(old,new,1))

# Architecture regression: source cannot regain lifecycle wrapper ownership, and Node focused tests cannot load hook extensions without the production pipeline.
rt_path=ROOT/'tests/runtime-hook-pipeline.mjs'
rt=rt_path.read_text()
needle="console.log('Runtime hook pipeline regression: ok');"
if rt.count(needle)!=1: raise SystemExit('runtime hook test console marker missing/duplicated')
extra=r'''

const srcDir=new URL('../src/',import.meta.url),testsDir=new URL('../tests/',import.meta.url);
const hookSourceFiles=fs.readdirSync(srcDir).filter(name=>name.endsWith('.js')&&name!=='runtime-hook-pipeline.js').filter(name=>fs.readFileSync(new URL(name,srcDir),'utf8').includes('registerRuntimeHook('));
assert.ok(hookSourceFiles.length>0,'architecture guard must discover runtime hook extensions');
for(const name of hookSourceFiles){
  const source=fs.readFileSync(new URL(name,srcDir),'utf8');
  assert.ok(!/\bE\.(?:tick|reset|onEpisodicMemoryCreated)\s*=/.test(source),`${name} must not own a no-pipeline lifecycle wrapper`);
  assert.ok(source.includes(`if(!E.registerRuntimeHook)throw new Error('${name} requires runtime-hook-pipeline.js');`),`${name} must fail loudly when the production pipeline is missing`);
}
for(const testName of fs.readdirSync(testsDir).filter(name=>name.endsWith('.mjs')&&!name.startsWith('browser-'))){
  const source=fs.readFileSync(new URL(testName,testsDir),'utf8');
  const quotedJs=[...source.matchAll(/['"]([A-Za-z0-9._-]+\.js)['"]/g)].map(m=>m[1]);
  const loadedHookFiles=hookSourceFiles.filter(name=>quotedJs.includes(name));
  if(!loadedHookFiles.length)continue;
  const engineIndex=quotedJs.indexOf('engine.js'),pipelineIndex=quotedJs.indexOf('runtime-hook-pipeline.js');
  assert.ok(engineIndex>=0,`${testName} loads hook extensions without engine.js`);
  assert.ok(pipelineIndex>engineIndex,`${testName} must load runtime-hook-pipeline.js after engine.js`);
  const firstHookIndex=Math.min(...loadedHookFiles.map(name=>quotedJs.indexOf(name)));
  assert.ok(pipelineIndex<firstHookIndex,`${testName} must load runtime-hook-pipeline.js before every hook extension`);
}
'''
rt_path.write_text(rt.replace(needle,extra+'\n'+needle,1))

# Final local static assertions for the migration itself.
for name in TESTS_TO_MIGRATE:
    text=(ROOT/'tests'/name).read_text()
    if 'runtime-hook-pipeline.js' not in text: raise SystemExit(f'{name}: pipeline insertion missing')
print(f'migrated {len(TESTS_TO_MIGRATE)} tests and removed {len(FALLBACK_FILES)} fallback owners')
