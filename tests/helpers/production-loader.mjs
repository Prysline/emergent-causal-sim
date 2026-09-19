import fs from 'node:fs';
import vm from 'node:vm';

const REPO_ROOT=new URL('../../',import.meta.url);
const INDEX_URL=new URL('../../index.html',import.meta.url);

export function readRepoFile(relativePath){
  return fs.readFileSync(new URL(relativePath,REPO_ROOT),'utf8');
}

export function productionScriptPaths(){
  const html=fs.readFileSync(INDEX_URL,'utf8');
  return [...html.matchAll(/<script src="(src\/[^"]+\.js)" defer><\/script>/g)].map(match=>match[1]);
}

function boundaryIndex(scripts,relativePath){
  const index=scripts.indexOf(relativePath);
  if(index<0)throw new Error('Production script not found: '+relativePath);
  return index;
}

export function productionScriptsBefore(relativePath){
  const scripts=productionScriptPaths();
  return scripts.slice(0,boundaryIndex(scripts,relativePath));
}

export function productionScriptsThrough(relativePath){
  const scripts=productionScriptPaths();
  return scripts.slice(0,boundaryIndex(scripts,relativePath)+1);
}

export function loadScriptsInThisContext(paths){
  for(const relativePath of paths){
    vm.runInThisContext(readRepoFile(relativePath),{filename:relativePath});
  }
}

export function loadProductionBefore(relativePath){
  const scripts=productionScriptsBefore(relativePath);
  loadScriptsInThisContext(scripts);
  return scripts;
}
