import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFolder,folderProfile,groupManualPhotos,manualCaseSql, kitchenConfiguration } from '../lib/manualCases.mjs';
test('door folders preserve kind and branch into groove count',()=>{
 const path=[];
 for(const value of ['문·문틀','방문','여닫이','세로 홈','2','없음','없음','1짝','외여닫이','평형','수분 팽창','문짝 하단','국소','문짝·문틀']){
  const step=nextFolder(folderProfile(path),path.length);assert.ok(step, value);assert.ok(step[2].includes(value),value);path.push({key:step[0],value});
 }
 assert.equal(nextFolder(folderProfile(path),path.length),null);
 assert.equal(folderProfile(path).groove_count,'2');
 assert.equal(folderProfile(path).door_kind,'방문');
});
test('same category is never enough to merge distinct objects',()=>{
 const photos=[{id:'1',caseId:'a',path:[]},{id:'2',caseId:'a',path:[]},{id:'3',caseId:'b',path:[]}];
 assert.deepEqual(groupManualPhotos(photos).map(g=>g.photos.length),[2,1]);
});
test('SQL contains one price per case, escaped text, company scoped references and no embeddings',()=>{
 const g={id:'a',profile:{part:'냉장고장'},photos:[{id:'1',storagePath:'p1'},{id:'2',storagePath:'p2'}]};
 const details={a:{price:'300000',scope:"냉장고장 '전체'",type:'after'}};
 const sql=manualCaseSql([g],details,'company','project');
 assert.equal((sql.match(/300000/g)||[]).length,1);assert.match(sql,/''전체''/);assert.match(sql,/w.company_id=x.company_id/);assert.doesNotMatch(sql,/embedding/);
 assert.throws(()=>manualCaseSql([g],{},'c','p'),/시공 범위/);
 assert.throws(()=>manualCaseSql(Array(31).fill(g),details,'c','p'),/30/);
});

test('kitchen hierarchy goes from combined composition to fridge details without losing saved labels',()=>{
 const path=[];
 const composition=kitchenConfiguration(['팬트리','냉장고장']);
 assert.equal(composition,'냉장고장 + 팬트리');
 const values=['싱크대',composition,'냉장고장','ㄱ자','2칸','상부장 + 측판','문짝형','평판','4짝','없음','찬넬형','양쪽 측판','정상 확인','전체'];
 for(const value of values){const step=nextFolder(folderProfile(path),path.length);assert.ok(step,value);if(step[3]!=='multiple')assert.ok(step[2].includes(value),step[0]+':'+value);path.push({key:step[0],value});}
 assert.equal(nextFolder(folderProfile(path),path.length),null);
 const profile=folderProfile(path);assert.equal(profile.shape,'ㄱ자');assert.equal(profile.kitchen_target,'냉장고장');assert.equal(profile.refrigerator_bays,'2칸');
 const group={id:'g',profile,photos:[{id:'p',path,storagePath:'photo'}]};
 const sql=manualCaseSql([group],{g:{scope:'냉장고장 전체',price:300000,type:'after',profile:{...profile,damage:'확인 필요'}}},'co','project');
 assert.match(sql,/kitchen_configuration/);assert.match(sql,/냉장고장 \+ 팬트리/);assert.match(sql,/manual_classification_path/);assert.match(sql,/2칸/);
});
test('kitchen component choices do not offer absent pantry and allow uncertain composition',()=>{
 assert.equal(kitchenConfiguration(['상하부장만 있는 싱크대','냉장고장']),'상하부장만 있는 싱크대');
 const profile={part:'싱크대',kitchen_configuration:'상하부장만 있는 싱크대'};
 assert.ok(!nextFolder(profile,2)[2].includes('팬트리'));
});

test('user named folders retain arbitrary depth in SQL without inventing structural attributes',()=>{
 const path=[{key:'part',value:'싱크대'},{key:'custom_1',value:'냉장고장 있는 싱크대'},{key:'custom_2',value:'내 세부 분류'}];
 const profile=folderProfile(path);
 assert.equal(profile.part,'싱크대');
 assert.equal(profile.shape,'확인 필요');
 const sql=manualCaseSql([{id:'g',profile,photos:[{id:'p',path,storagePath:'p.jpg'}]}],{g:{price:500000,scope:'전체',type:'after'}},'c','p');
 assert.match(sql,/manual_classification_path/);
 assert.match(sql,/내 세부 분류/);
});

test('custom top level categories survive normalization and SQL generation',()=>{
 const path=[{key:'space',value:'주거'},{key:'part',value:'사용자 새 부위'}];
 const profile=folderProfile(path);
 assert.equal(profile.part,'사용자 새 부위');
 assert.equal(profile.space,'주거');
 const sql=manualCaseSql([{id:'g',profile,photos:[{id:'p',path,storagePath:'p.jpg'}]}],{g:{price:100000,scope:'전체',type:'after'}},'c','p');
 assert.match(sql,/"category":"사용자 새 부위"/);
});
