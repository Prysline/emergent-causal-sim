from pathlib import Path
import re

root=Path('.')
src_dir=root/'src'
tests_dir=root/'tests'

assign_re=re.compile(r'\bE\.(tick|reset|onEpisodicMemoryCreated)\s*=(?!=)')
base_re=re.compile(r'\bbase(?:Tick|Reset|MemoryHook)\b')

fallback_files=[]
source_sections=[]
for path in sorted(src_dir.glob('*.js')):
    text=path.read_text()
    lines=text.splitlines()
    hits=[]
    for i,line in enumerate(lines,1):
        if assign_re.search(line) or base_re.search(line):
            hits.append((i,line.rstrip()))
    if hits:
        has_registry='registerRuntimeHook' in text or 'registerEpisodicMemoryHook' in text
        # engine.js owns the canonical core methods and runtime-hook-pipeline.js owns the dispatcher;
        # everything else that writes these methods is a potential compatibility fallback owner.
        potential=path.name not in {'engine.js','runtime-hook-pipeline.js'}
        if potential:
            fallback_files.append(path.name)
        source_sections.append((path.name,has_registry,potential,hits))

report=[]
report.append('# Legacy no-pipeline runtime audit')
report.append('')
report.append('## Potential fallback owners')
report.append('')
report.append('These are `src/*.js` files other than canonical `engine.js` / `runtime-hook-pipeline.js` that assign `E.tick`, `E.reset`, or `E.onEpisodicMemoryCreated`, or retain a `baseTick/baseReset/baseMemoryHook` chain.')
report.append('')
for name,has_registry,potential,hits in source_sections:
    if not potential:
        continue
    report.append(f'### `{name}`')
    report.append(f'- also registers formal runtime hooks: `{has_registry}`')
    report.append('```text')
    for line_no,line in hits:
        report.append(f'{line_no}: {line}')
    report.append('```')
    report.append('')

report.append('## Focused Node tests using fallback owners')
report.append('')
risk=[]
for path in sorted(tests_dir.glob('*.mjs')):
    if path.name.startswith('browser-'):
        continue
    text=path.read_text()
    loaded=[name for name in fallback_files if name in text]
    has_pipeline='runtime-hook-pipeline.js' in text
    if loaded:
        risk.append((path.name,has_pipeline,loaded))
        report.append(f'- `{path.name}` — pipeline=`{has_pipeline}` — fallback-capable sources: ' + ', '.join(f'`{x}`' for x in loaded))
report.append('')
report.append('## No-pipeline focused tests that actually call `E.tick` / `E.reset`')
report.append('')
for path in sorted(tests_dir.glob('*.mjs')):
    if path.name.startswith('browser-'):
        continue
    text=path.read_text()
    if 'runtime-hook-pipeline.js' in text:
        continue
    calls=[]
    if re.search(r'\bE\.tick\s*\(',text): calls.append('tick')
    if re.search(r'\bE\.reset\s*\(',text): calls.append('reset')
    if calls:
        loaded=[name for name in fallback_files if name in text]
        report.append(f'- `{path.name}` — calls={calls} — fallback-capable sources: ' + (', '.join(f'`{x}`' for x in loaded) if loaded else '(none)'))
report.append('')
report.append('## Summary')
report.append('')
report.append(f'- potential fallback owner files: **{len(fallback_files)}**')
report.append(f'- focused tests loading at least one fallback-capable owner: **{len(risk)}**')
report.append(f'- of those, already loading production pipeline: **{sum(1 for _,p,_ in risk if p)}**')
report.append(f'- of those, still no-pipeline: **{sum(1 for _,p,_ in risk if not p)}**')
report.append('')
report.append('Fallback files: ' + ', '.join(f'`{x}`' for x in fallback_files))

(root/'no-pipeline-audit.md').write_text('\n'.join(report)+'\n')
