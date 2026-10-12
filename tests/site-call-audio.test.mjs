import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AUDIO_BUCKET,validAudioPath,audioMetadata} from '../lib/siteCallAudio.mjs';
const path='company/user/11111111-1111-4111-8111-111111111111.m4a';
test('large recording metadata is accepted; invalid sizes and paths are rejected',()=>{
 assert.equal(audioMetadata({fileName:'call.m4a',size:7*1024*1024}),'m4a');
 for(const size of [0,-1,26*1024*1024])assert.throws(()=>audioMetadata({fileName:'a.m4a',size}));
 assert.equal(validAudioPath(path,'company','user'),true);
 assert.equal(validAudioPath(path,'other','user'),false);
 assert.equal(validAudioPath('company/user/../x.m4a','company','user'),false);
});
const source=readFileSync(new URL('../app/api/admin/transcribe-site-call/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
async function run({foreign=false,upstreamError=false}={}){
 let deleted=0,downloaded=0,called=0;
 const auth=async()=>({success:true,companyId:'company',userId:'user',db:{storage:{from:()=>({
  download:async()=>{downloaded++;return {data:new Blob([new Uint8Array(7*1024*1024)],{type:'audio/mp4'})}},
  remove:async()=>{deleted++;return {error:null}}
 })}}});
 const handler=new Function('NextResponse','authenticateAdmin','AUDIO_BUCKET','validAudioPath','fetch','process',source+';return POST;')(
  {json:Response.json},auth,AUDIO_BUCKET,validAudioPath,
  async(url,options)=>{called++;assert.equal(options.body.get('file').size,7*1024*1024);return Response.json(upstreamError?{error:{message:'retry'}}:{text:'현장 상담 내용'},{status:upstreamError?429:200})},
  {env:{OPENAI_API_KEY:'test'}}
 );
 const result=await handler(new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:foreign?path.replace('company','other'):path,fileName:'call.m4a'})}));
 return {result,deleted,downloaded,called};
}
test('7MB recording is downloaded on server, transcribed, and deleted',async()=>{
 const r=await run();assert.equal(r.result.status,200);assert.equal(r.deleted,1);assert.equal(r.called,1);
});
test('failed transcription deletes temporary recording',async()=>{
 const r=await run({upstreamError:true});assert.equal(r.result.status,429);assert.equal(r.deleted,1);
});
test('foreign-company audio never downloads or reaches transcription',async()=>{
 const r=await run({foreign:true});assert.equal(r.result.status,403);assert.equal(r.downloaded,0);assert.equal(r.called,0);assert.equal(r.deleted,0);
});
