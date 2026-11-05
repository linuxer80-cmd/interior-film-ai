import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const u='00000000-0000-4000-8000-000000000001',r='00000000-0000-4000-8000-000000000002',l='00000000-0000-4000-8000-000000000003';
test('DB lease verdict checks time, owner, status and verified scope including after Auth removal',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table account_deletion_requests(id uuid,user_id uuid,subject_id uuid,lease_token uuid,lease_until timestamptz,identity_verified boolean,scope text,status text);
 insert into account_deletion_requests values('${r}','${u}','${u}','${l}',clock_timestamp()+interval '5 minutes',true,'personal_account','processing');`);
 await db.exec(await readFile(new URL('../database/account_deletion_assert_lease.sql',import.meta.url),'utf8'));
 const check=async(subject=u)=>(await db.query('select assert_account_deletion_lease($1,$2,$3) valid',[r,l,subject])).rows[0].valid;
 assert.equal(await check(),true);assert.equal(await check(r),false);
 await db.exec('update account_deletion_requests set user_id=null');assert.equal(await check(),true);
 for(const change of ["lease_until=clock_timestamp()-interval '1 second'","identity_verified=false","status='completed'","scope='company'","lease_token=null"]){
 await db.exec('begin');await db.exec('update account_deletion_requests set '+change);assert.equal(await check(),false);await db.exec('rollback');
 }
 assert.equal((await db.query("select has_function_privilege('authenticated','assert_account_deletion_lease(uuid,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
