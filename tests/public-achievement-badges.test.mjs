import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../lib/publicAchievementBadge.js',import.meta.url),'utf8')
 .replace(/^import .*;$/gm,'').replaceAll('export ','');
const context=vm.createContext({badgeImageUrl:(_db,path)=>path?'https://images.test/'+path:null});
vm.runInContext(source+'\nglobalThis.api={directoryBadges,companyJobBadges};',context);
const {directoryBadges,companyJobBadges}=context.api;
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(overrides={},failure){
 const tables={
  profiles:[{id:'owner-a',company_id:'a',role:'owner',is_active:true},{id:'owner-b',company_id:'b',role:'owner',is_active:true}],
  achievement_preferences:[
   {user_id:'w1',subject_key:'user:w1',featured_badge:'worker'},
   {user_id:'w2',subject_key:'user:w2',featured_badge:'worker'},
   {user_id:'owner-a',subject_key:'company:a',featured_badge:'owner'},
   {user_id:'owner-b',subject_key:'company:b',featured_badge:'owner'}
  ],
  achievement_awards:[{subject_key:'user:w1',badge_id:'worker',progress_at_award:999},{subject_key:'company:a',badge_id:'owner'}],
  achievement_definitions:[{id:'worker',audience:'worker',title:'시공자 배지',art_key:1,tier:'gold',image_path:'',metric:'commute_km'},
   {id:'owner',audience:'owner',title:'업체 배지',art_key:2,tier:'silver',image_path:'custom/test.png'}],
  ...overrides
 };
 const calls=[];
 return {calls,from(table){
  calls.push(table);const filters=[];let fields=[];
  const q={select(s){fields=s.split(',');return q;},in(k,values){filters.push(r=>values.includes(r[k]));return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},
   then(resolve,reject){return Promise.resolve(table===failure?{error:{code:'42P01'}}:{data:tables[table].filter(r=>filters.every(f=>f(r))).map(r=>Object.fromEntries(fields.map(k=>[k,r[k]])))}).then(resolve,reject);}};
  return q;
 }};
}

test('worker badge requires an award for that exact user and exposes only display fields',async()=>{
 const db=fixture();const result=plain(await directoryBadges(db,[{user_id:'w1'},{user_id:'w2'}]));
 assert.deepEqual(result[0].featured_badge,{id:'worker',title:'시공자 배지',art_key:1,tier:'gold',image_url:null});
 assert.equal(result[1].featured_badge,null);
 assert.equal(JSON.stringify(result).includes('progress_at_award'),false);
});
test('cleared selection and cross-user preferences cannot reveal a badge',async()=>{
 const db=fixture({achievement_preferences:[{user_id:'w1',subject_key:'user:w1',featured_badge:null},{user_id:'w2',subject_key:'user:w1',featured_badge:'worker'}]});
 const result=await directoryBadges(db,[{user_id:'w1'},{user_id:'w2'}]);
 assert.ok(result.every(r=>r.featured_badge===null));
});
test('company award is scoped to the job company, including repeated and historical jobs',async()=>{
 const db=fixture();const result=await companyJobBadges(db,[{id:'open',company_id:'a'},{id:'past',company_id:'a'},{id:'other',company_id:'b'}]);
 assert.equal(result[0].company_badge.id,'owner');
 assert.equal(result[1].company_badge.id,'owner');
 assert.equal(result[2].company_badge,null);
 assert.equal(db.calls.length,4);
});
test('former and inactive owners cannot publish a company selection',async()=>{
 const db=fixture({profiles:[{id:'owner-a',company_id:'b',role:'owner',is_active:true},{id:'owner-b',company_id:'a',role:'owner',is_active:false}],
  achievement_preferences:[{user_id:'owner-a',subject_key:'company:a',featured_badge:'owner'},{user_id:'owner-b',subject_key:'company:a',featured_badge:'owner'}]});
 assert.ok((await companyJobBadges(db,[{company_id:'a'},{company_id:'b'}])).every(j=>j.company_badge===null));
});
test('missing badge setup does not break recruiting or keep stale badges',async()=>{
 const db=fixture({},'achievement_preferences');
 assert.equal((await directoryBadges(db,[{user_id:'w1',featured_badge:{id:'stale'}}]))[0].featured_badge,null);
 assert.equal((await companyJobBadges(db,[{company_id:'a',company_badge:{id:'stale'}}]))[0].company_badge,null);
});
test('wrong badge audience is hidden even if a preference and award exist',async()=>{
 const db=fixture({achievement_definitions:[{id:'worker',audience:'owner',title:'wrong'}]});
 assert.equal((await directoryBadges(db,[{user_id:'w1'}]))[0].featured_badge,null);
});
