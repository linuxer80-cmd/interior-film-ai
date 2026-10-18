import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFolder,folderProfile,groupManualPhotos,manualCaseSql } from '../lib/manualCases.mjs';
test('door folders preserve kind and branch into groove count',()=>{
 const path=[];
 for(const value of ['문·문틀','방문','여닫이','세로 홈','2','없음','없음','수분 팽창','문짝 하단','문짝·문틀']){
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
