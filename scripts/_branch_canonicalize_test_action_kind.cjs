const fs=require('fs');
const path=require('path');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=walk('tests').filter(f=>f.endsWith('.mjs')&&!f.endsWith('tests/action-terminology.mjs'));
for(const file of files){
  let s=fs.readFileSync(file,'utf8');
  s=s.replaceAll('.action?.intent','.action?.kind');
  s=s.replaceAll('.action.intent','.action.kind');
  s=s.replace(/(\.action\s*=\s*\{\s*)intent:/g,'$1kind:');
  s=s.replace(/(\baction\s*:\s*\{\s*)intent:/g,'$1kind:');
  fs.writeFileSync(file,s);
}
const leftovers=[];
for(const file of files){
  const s=fs.readFileSync(file,'utf8');
  if(/\.action\?*\.intent\b/.test(s)||/\.action\s*=\s*\{\s*intent:/.test(s)||/\baction\s*:\s*\{\s*intent:/.test(s))leftovers.push(file);
}
if(leftovers.length)throw new Error('legacy Action terminology remains in tests: '+leftovers.join(', '));
fs.unlinkSync(__filename);
