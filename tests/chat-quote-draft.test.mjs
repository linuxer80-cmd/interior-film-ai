import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chatMoney,normalizeChatQuote,chatCompletionDraft} from '../lib/chatQuoteDraft.mjs';
const messages=[{id:'owner1',sender:'owner',body:'전체 시공 견적은 120만원이고 부가세 포함입니다.'},{id:'customer1',sender:'customer',body:'예산은 90만원입니다.'}];
const raw={site_name:'풍경채',address:'인천 서구',work_description:'문·문틀 3개 시공',price_text:'120만원',price_message_id:'owner1',price_status:'quoted',vat:'included',vat_evidence:'부가세 포함'};
test('Korean money parses without inventing ambiguous amounts',()=>{
 for(const [text,expected] of [['120만원',1200000],['1,200,000원',1200000],['1.5백만원',1500000],['0원',0],['120~150만원',''],['약 120만원',''],['-10만원',''],['11억원',''],['','']])assert.equal(chatMoney(text),expected,text);
});
test('only exact manager price evidence can seed total; customer budget and invented source fail',()=>{
 assert.equal(normalizeChatQuote(raw,messages).contract_amount,1200000);
 for(const changed of [{price_message_id:'customer1',price_text:'90만원'},{price_text:'150만원'},{price_status:'budget'},{price_message_id:'missing'}])assert.equal(normalizeChatQuote({...raw,...changed},messages).contract_amount,'');
});
test('unknown tax is left for review, not automatically added',()=>{
 assert.equal(normalizeChatQuote(raw,messages).vat,'included');
 assert.equal(normalizeChatQuote({...raw,vat_evidence:'VAT 별도'},messages).vat,'');
 assert.equal(normalizeChatQuote({...raw,vat:'made-up'},messages).vat,'');
});
test('chat total becomes one line, preserves quote revision/company and leaves blank price blank',()=>{
 const base={version:7,header:{company_name:'필름장이',address:'기존 주소'},items:[{name:'old',amount:99}],note:'계좌 안내',vat:'separate'};
 const draft=chatCompletionDraft(base,{...raw,contract_amount:1200000,vat:'included'});
 assert.equal(draft.version,7);assert.equal(draft.header.company_name,'필름장이');
 assert.equal(draft.items.length,1);assert.equal(draft.items[0].amount,1200000);assert.equal(draft.items[0].quantity,1);assert.equal(draft.vat,'included');
 assert.equal(base.items[0].amount,99);
 assert.equal(chatCompletionDraft(base,{...raw,contract_amount:'',vat:'none'}).items[0].amount,'');
});
const source=fs.readFileSync(new URL('../app/api/admin/customer-chat/quote/route.js',import.meta.url),'utf8');
function endpoint({rows=messages,deny=false}={}){
 const trace=[];let input;
 const query={select(){return this;},eq(k,v){trace.push([k,v]);return this;},order(){return this;},async limit(n){trace.push(['limit',n]);return {data:[...rows].reverse()};}};
 const handler=new Function('ownerChat','chatOrigin','chatFail','chatReply','chatError','chatQuoteSchema','normalizeChatQuote','fetch',
 source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return POST;')(
 async()=>{if(deny)throw Object.assign(Error('denied'),{status:404});return {thread:{id:'authorized-thread'},db:{from:()=>query}};},
 ()=>{},(message,status=400)=>Object.assign(Error(message),{status}), (data)=>Response.json(data),e=>Response.json({error:e.message},{status:e.status||500}),{},normalizeChatQuote,
 async(url,options)=>{input=JSON.parse(options.body);return Response.json({output_text:JSON.stringify(raw)});}
 );
 return {handler,trace,input:()=>input};
}
test('AI gets server-loaded authorized conversation; client cannot supply messages',async()=>{
 const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
 try{const e=endpoint();const response=await e.handler(new Request('https://example.com/api/admin/customer-chat/quote?thread=x',{method:'POST',body:JSON.stringify({messages:'attacker text'})}));
 assert.equal(response.status,200);assert.deepEqual(e.trace[0],['thread_id','authorized-thread']);assert.match(e.input().input[0].content[0].text,/120万円|120만원/);assert.doesNotMatch(e.input().input[0].content[0].text,/attacker/);
 }finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;}
});
test('foreign thread and oversized conversation cannot reach AI',async()=>{
 const foreign=endpoint({deny:true});assert.equal((await foreign.handler(new Request('https://example.com'))).status,404);assert.equal(foreign.input(),undefined);
 const large=endpoint({rows:Array(201).fill(messages[0])});assert.equal((await large.handler(new Request('https://example.com'))).status,400);assert.equal(large.input(),undefined);
});
test('new route participates in existing consultation quota',()=>{
 const proxy=fs.readFileSync(new URL('../proxy.js',import.meta.url),'utf8');
 assert.match(proxy,/"\/api\/admin\/customer-chat\/quote": "consultation_parse"/);
});
