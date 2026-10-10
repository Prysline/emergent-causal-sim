import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const releasePath='src/release.js';
const releaseSource=fs.readFileSync(path.join(repoRoot,releasePath),'utf8');
const currentOverallMatch=releaseSource.match(/const VERSION='([^']+)'/);
assert.ok(currentOverallMatch,'src/release.js must expose the canonical overall VERSION marker');
const currentOverallVersion=currentOverallMatch[1];
const releaseLiteralOccurrences=releaseSource.split(currentOverallVersion).length-1;
assert.equal(releaseLiteralOccurrences,1,'src/release.js must own exactly one current overall release literal');

const textExtensions=new Set([
  '.js','.mjs','.cjs','.jsx','.ts','.tsx',
  '.json','.yml','.yaml','.html','.css','.txt','.sh','.ps1'
]);
const skippedDirectories=new Set(['.git','node_modules','artifacts','test-results','playwright-report']);

const files=[];
const walk=directory=>{
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(entry.isDirectory()&&skippedDirectories.has(entry.name))continue;
    const absolutePath=path.join(directory,entry.name);
    if(entry.isDirectory())walk(absolutePath);
    else if(entry.isFile())files.push(path.relative(repoRoot,absolutePath).split(path.sep).join('/'));
  }
};
walk(repoRoot);
files.sort();

const violations=[];
let scanned=0;
for(const relativePath of files){
  if(relativePath===releasePath)continue;
  if(!textExtensions.has(path.extname(relativePath).toLowerCase()))continue;
  scanned++;
  const source=fs.readFileSync(path.join(repoRoot,relativePath),'utf8');
  if(source.includes(currentOverallVersion)){
    violations.push(relativePath+': duplicates canonical current overall release literal '+currentOverallVersion);
  }
}

assert.deepEqual(
  violations,
  [],
  'Only src/release.js may own the exact current overall release literal in code/config files. Human-facing Markdown current-release prose and historical evidence are outside this ownership guard.\n'+violations.join('\n')
);

console.log(`Current version ownership guard: ok (${scanned} code/config files checked)`);
