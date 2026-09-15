const fs=require('fs');
const path=require('path');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const isNegativeLegacyFixture=file=>file.endsWith('tests/action-terminology.mjs');
for(const file of walk('tests').filter(f=>f.endsWith('.mjs')&&!isNegativeLegacyFixture(f))){
  let s=fs.readFileSync(file,'utf8');
  s=s.replace(/(\.action\s*=\s*\{)intent:/g,'$1kind:');
  s=s.replace(/(\baction\s*:\s*\{)intent:/g,'$1kind:');
  fs.writeFileSync(file,s);
}
const leftovers=[];
for(const file of walk('tests').filter(f=>f.endsWith('.mjs')&&!isNegativeLegacyFixture(f))){
  const s=fs.readFileSync(file,'utf8');
  if(/\.action\s*=\s*\{intent:/.test(s)||/\baction\s*:\s*\{intent:/.test(s))leftovers.push(file);
}
if(leftovers.length)throw new Error('legacy Action fixtures remain outside the intentional negative test: '+leftovers.join(', '));
fs.unlinkSync(__filename);
