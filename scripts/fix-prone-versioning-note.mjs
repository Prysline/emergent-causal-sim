import fs from 'node:fs';

const file='docs/versioning.md';
const oldText='未改 contract 的 Resources / Physical / Agent Carry / Social Bid / Spatial candidate selection / Spatial Traversal / Spatial Passage / Route / Locomotion / Contact / Dynamic Congestion / Memory / Usage / Affect / Relationship / Surface Environment / World Authoring / Furniture Catalog 不跟著 overall patch 假升。';
const newText='未改 contract 的 Resources / Physical / Agent Carry / Social Bid / Spatial candidate selection / Spatial Traversal / Spatial Passage / Route / Contact / Dynamic Congestion / Memory / Usage / Affect / Relationship / Surface Environment / World Authoring / Furniture Catalog 不跟著 overall patch 假升。';
const text=fs.readFileSync(file,'utf8');
if(!text.includes(oldText))throw new Error('Missing prone-transition versioning note anchor.');
fs.writeFileSync(file,text.replace(oldText,newText));
console.log('prone-transition versioning note fixed');
