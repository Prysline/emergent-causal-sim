import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=relativePath=>fs.readFileSync(new URL('../'+relativePath,import.meta.url),'utf8');
const browserWorkflow=read('.github/workflows/browser-regression.yml');
const browserTests=[...new Set(
  [...browserWorkflow.matchAll(/(?:test|extra_test):\s+(tests\/[A-Za-z0-9._/-]+\.mjs)/g)].map(match=>match[1])
)];
assert.ok(browserTests.length>0,'Browser regression workflow must enumerate current Browser regression tests');

// src/release.js is the sole production owner of the overall release literal; Browser QA may only consume its runtime projection.
const releaseSource=read('src/release.js');
const currentOverallMatch=releaseSource.match(/const VERSION='([^']+)'/);
assert.ok(currentOverallMatch,'release.js must expose the canonical overall VERSION marker');
const currentOverallVersion=currentOverallMatch[1];
const currentShortRelease='v'+currentOverallVersion.split('-')[0];

const socialStateSource=read('src/systems/social/state.js');
const currentHumanSocialMatch=socialStateSource.match(/const HUMAN_RESPONSE_VERSION='([^']+)'/);
assert.ok(currentHumanSocialMatch,'systems/social/state.js must expose the canonical Human Social Response VERSION marker');
const currentHumanSocialVersion=currentHumanSocialMatch[1];

const stale=[];
for(const relativePath of browserTests){
  const source=read(relativePath);
  const currentVersion=source.match(/\bconst\s+CURRENT_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if(currentVersion){
    stale.push(relativePath+': Browser QA must derive current overall release from SimRelease at runtime instead of owning CURRENT_VERSION='+currentVersion[1]);
  }
  for(const match of source.matchAll(/SimRelease\?\.VERSION\s*===\s*['"]([^'"]+)['"]/g)){
    stale.push(relativePath+': Browser QA must not hardcode SimRelease.VERSION wait '+match[1]+'; compare projections with SimRelease.VERSION at runtime');
  }
  if(source.includes(currentOverallVersion)){
    stale.push(relativePath+': duplicates canonical overall release literal '+currentOverallVersion+' owned by src/release.js');
  }
  for(const match of source.matchAll(/HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION\s*===\s*['"]([^'"]+)['"]/g)){
    if(match[1]!==currentHumanSocialVersion)stale.push(relativePath+': Human Social Response wait expects '+match[1]+' but systems/social/state.js is '+currentHumanSocialVersion);
  }
  for(const match of source.matchAll(/assert\.equal\((?:[A-Za-z_$][A-Za-z0-9_$]*\.)+(?:releaseLabel|label),\s*['"]([^'"]+)['"]/g)){
    if(match[1]===currentShortRelease)stale.push(relativePath+': duplicates current short release label '+currentShortRelease+' instead of deriving it from SimRelease.VERSION');
    else if(/^v\d+\.\d+\.\d+$/.test(match[1]))stale.push(relativePath+': release label hardcodes '+match[1]+' instead of deriving it from SimRelease.VERSION');
  }
}

assert.deepEqual(stale,[],'Browser current release markers must be synchronized before Browser regression runs:\n'+stale.join('\n'));
console.log('Browser version marker preflight: ok');
