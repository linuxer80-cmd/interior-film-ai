import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app/worker/cutting/cuttingOptimizerCore.js',import.meta.url),'utf8');
const {optimizeCutting}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const input=(sizes,rolls=[{id:'r',color:'A',lengthM:50,grainDirection:true}],rollMode='waste')=>({rolls,rollMode,sections:[{location:'현장',part:'문',colors:[{color:'A',sizes:sizes.map(([width,height,quantity=1])=>({width,height,quantity}))}]}]});
function valid(result,count){
 assert.equal(result.success,true,JSON.stringify(result.errors));
 const pieces=result.result.usedRolls.flatMap(r=>r.placements);assert.equal(pieces.length,count);assert.equal(new Set(pieces.map(p=>p.id)).size,count);
 for(const roll of result.result.usedRolls){assert.ok(roll.usedLength<=roll.lengthMm);for(const p of roll.placements){assert.ok(p.x>=0&&p.y>=0&&p.x+p.width<=1220&&p.y+p.height<=roll.lengthMm);for(const q of roll.placements){if(p===q)continue;assert.ok(p.x+p.width<=q.x||q.x+q.width<=p.x||p.y+p.height<=q.y||q.y+q.height<=p.y);}}}
 return result.result;
}
test('long piece wins even when small pair exactly fills 1220 width',()=>{
 const r=valid(optimizeCutting(input([[400,3000],[610,1000,2],[820,1000,3]])),6);
 assert.equal(r.usedRolls[0].batches[0].height,3000);
 const long=r.usedRolls[0].placements.find(p=>p.originalHeight===3000);assert.equal(long.y,0);
 assert.equal(r.summary.totalUsedLength,4000);
 assert.equal(r.usedRolls[0].placements.filter(p=>p.originalWidth===820&&p.y<3000).length,3);
});
test('narrow longer piece takes precedence over wide shorter long piece',()=>{
 const r=valid(optimizeCutting(input([[200,4000],[800,2000],[610,1000,2]])),4);
 assert.equal(r.usedRolls[0].batches[0].height,4000);
});
test('short-first roll ordering remains strict when longest cannot fit short roll',()=>{
 const r=valid(optimizeCutting(input([[500,4000],[600,1000,2]],[{id:'short',color:'A',lengthM:2,grainDirection:true},{id:'long',color:'A',lengthM:10,grainDirection:true}],'short-first')),3);
 assert.equal(r.usedRolls[0].id,'short');assert.equal(r.usedRolls[1].id,'long');
 assert.equal(r.usedRolls[1].batches[0].height,4000);
});
test('grain prevents rotation; existing roll continues before opening another',()=>{
 const r=valid(optimizeCutting(input([[600,3000,3],[300,1000,4]],[{id:'first',color:'A',lengthM:10,grainDirection:true},{id:'second',color:'A',lengthM:50,grainDirection:true}],'short-first')),7);
 assert.equal(r.usedRolls.length,1);assert.ok(r.usedRolls[0].placements.every(p=>!p.rotated));
});
test('no-grain rotations remain within width and all quantities are conserved',()=>{
 valid(optimizeCutting(input([[2000,300,2],[600,500,3],[100,3500]], [{id:'r',color:'A',lengthM:20,grainDirection:false}])),6);
});
test('insufficient rolls still return shortage instead of dropping long pieces',()=>{
 const r=optimizeCutting(input([[800,2000,3]],[{id:'r',color:'A',lengthM:3,grainDirection:true}]));assert.equal(r.success,false);assert.match(r.errors.join(' '),/모자랍니다/);
});
test('small exact-width pair fills the long side strip, avoiding an extra meter',()=>{
 const r=valid(optimizeCutting(input([[500,3000],[500,1000],[720,1000]])),3);
 assert.equal(r.usedRolls[0].batches[0].height,3000);
 assert.equal(r.summary.totalUsedLength,3000);
});
test('varied dimensions preserve all pieces without overlap in both roll modes',()=>{
 let seed=12345;const random=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
 for(let i=0;i<16;i++){
  const sizes=Array.from({length:10},()=>[100+random(1100),100+random(3900)]);
  for(const rollMode of ['waste','short-first'])valid(optimizeCutting(input(sizes,[{id:'r',color:'A',lengthM:50,grainDirection:i%2===0}],rollMode)),10);
 }
});
