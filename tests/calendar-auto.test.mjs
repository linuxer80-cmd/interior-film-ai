import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal, authorizationUrl, randomSecret, hashState, validState, equalSecret, googleToken, CALLBACK_URI } from '../lib/calendarAutoCrypto.mjs';
import { autoWindow, reconcileCalendar } from '../lib/calendarAutoSync.mjs';
import { siteCalendarEvents, CALENDAR_SCOPE } from '../lib/googleCalendar.mjs';
process.env.CALENDAR_TOKEN_ENCRYPTION_KEY='12'.repeat(32);
process.env.GOOGLE_CLIENT_ID='test.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET='test-server-secret';
const user='u',site={site_id:'s',site_name:'테스트',address:'주소',address_detail:'101-202',assigned_dates:[{work_date:'2026-10-20',role:'leader'}]};
const window={from:'2026-10-20',to:'2026-10-20',chunks:[{from:'2026-10-20',to:'2026-10-20'}]};
const event=(await siteCalendarEvents([site],user,window.from,window.to,'https://interior-film-ai.vercel.app'))[0];
const missing=()=>Object.assign(Error('missing'),{status:404});
function calendar(initial=[]) {
  const events=new Map(initial.map(e=>[e.id,structuredClone(e)])),writes=[];
  const api=async(_token,path='',options={})=>{
    const method=options.method||'GET';
    if(path.startsWith('?'))return {items:[...events.values()].filter(e=>e.status!=='cancelled')};
    const id=path.slice(1);
    if(method==='GET'){if(!events.has(id))throw missing();return structuredClone(events.get(id));}
    writes.push({method,id,body:options.body,etag:options.etag});
    if(method==='POST'){const e={...options.body,etag:'v1'};events.set(e.id,e);return e;}
    if(method==='PATCH'){const e={...events.get(id),...options.body,etag:'v2'};events.set(id,e);return e;}
    if(method==='DELETE'){events.set(id,{...events.get(id),status:'cancelled'});return null;}
  };return {events,writes,api};
}
test('refresh credentials are encrypted and bound to the user and purpose',()=>{
  const a=seal('never-plaintext','refresh:u');assert.ok(!a.includes('never-plaintext'));assert.notEqual(a,seal('never-plaintext','refresh:u'));assert.equal(unseal(a,'refresh:u'),'never-plaintext');assert.throws(()=>unseal(a,'refresh:other'));assert.throws(()=>unseal(a,'code:u'));const parts=a.split('.');parts[3]='AA'+parts[3];assert.throws(()=>unseal(parts.join('.'),'refresh:u'));
});
test('offline authorization uses fixed callback, PKCE, state and only Calendar scope',()=>{
  const state=randomSecret(),verifier=randomSecret(),url=new URL(authorizationUrl(state,verifier));assert.equal(validState(state),true);assert.equal(equalSecret(state,state),true);assert.equal(equalSecret(state,randomSecret()),false);assert.equal(validState('bad'),false);assert.equal(url.searchParams.get('state'),state);assert.equal(url.searchParams.get('redirect_uri'),CALLBACK_URI);assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),CALENDAR_SCOPE);assert.notEqual(url.searchParams.get('code_challenge'),verifier);assert.ok(!url.toString().includes(process.env.GOOGLE_CLIENT_SECRET));assert.equal(hashState(state).length,64);
});
test('revoked refresh grant requires reconnect and never leaks Google errors',async()=>{
  await assert.rejects(()=>googleToken({grant_type:'refresh_token',refresh_token:'private'},async(url,opts)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.ok(opts.body.get('refresh_token')==='private');return {ok:false,json:async()=>({error:'invalid_grant',error_description:'sensitive'})};}),e=>e.reconnect&&!e.message.includes('sensitive'));
});
test('automatic window is 90 Korean dates, partitioned into valid 31-day API ranges',()=>{
  const w=autoWindow(new Date('2026-10-19T22:00:00Z'));assert.equal(w.from,'2026-10-20');assert.equal(w.to,'2027-01-17');assert.deepEqual(w.chunks,[{from:'2026-10-20',to:'2026-11-19'},{from:'2026-11-20',to:'2026-12-20'},{from:'2026-12-21',to:'2027-01-17'}]);
});
test('second automatic run skips identical events; changed summary patches the same id',async()=>{
  const c=calendar(),args={token:'secret',userId:user,sites:[site],...window,api:c.api};
  const first=await reconcileCalendar(args);assert.equal(first.changed,1);assert.equal(c.writes[0].method,'POST');
  const again=await reconcileCalendar(args);assert.equal(again.skipped,1);assert.equal(c.writes.length,1);
  await reconcileCalendar({...args,sites:[{...site,memo:'거주중'}]});assert.equal(c.writes[1].method,'PATCH');assert.equal(c.writes[1].id,event.id);assert.equal(c.writes[1].etag,'v1');
});
test('removed assignment deletes only this user app event, never personal/other user',async()=>{
  const c=calendar([{...event,etag:'v1'},{id:'personal',summary:'개인'},{...event,id:'fm'+'a'.repeat(64),extendedProperties:{private:{source:'filmjang-v1',userId:'other'}}}]);
  await reconcileCalendar({token:'x',userId:user,sites:[],...window,api:c.api});assert.equal(c.writes.length,1);assert.equal(c.writes[0].method,'DELETE');assert.equal(c.writes[0].id,event.id);
});
test('partial remote read failure prevents ALL writes and deletion',async()=>{
  let writes=0;await assert.rejects(()=>reconcileCalendar({token:'x',userId:user,sites:[],...window,chunks:[...window.chunks,{from:'2026-10-21',to:'2026-10-21'}],api:async(_t,path,opts)=>{if(opts)writes++;if(path.includes('2026-10-21T00'))throw Error('fetch failed');return {items:[event]};}}));assert.equal(writes,0);
});
test('disconnected or replaced connection stops a claimed run before mutation',async()=>{
  const c=calendar();await assert.rejects(()=>reconcileCalendar({token:'x',userId:user,sites:[site],...window,api:c.api,assertActive:async()=>{throw Error('disabled');}}));assert.equal(c.writes.length,0);
});
test('cancelled then reassigned date restores ledger-owned event instead of duplicate insert',async()=>{
  const c=calendar([{id:event.id,status:'cancelled',etag:'deleted-v1'}]);await reconcileCalendar({token:'x',userId:user,sites:[site],...window,ledger:[{event_id:event.id,work_date:'2026-10-20'}],api:c.api});assert.equal(c.writes.length,1);assert.equal(c.writes[0].method,'PATCH');assert.equal(c.writes[0].body.status,'confirmed');assert.equal(c.writes[0].etag,'deleted-v1');
});
test('ledger can clean app events moved outside window but cannot authorize deleting a personal event',async()=>{
  const c=calendar([{...event,etag:'v1',extendedProperties:{}}]);await assert.rejects(()=>reconcileCalendar({token:'x',userId:user,sites:[],...window,ledger:[{event_id:event.id,work_date:'2026-10-20'}],api:c.api}));assert.equal(c.writes.length,0);
});
