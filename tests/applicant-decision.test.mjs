import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {transformSync}=require('next/dist/build/swc');
const source=readFileSync(new URL('../app/jobs/page.js',import.meta.url),'utf8');
const component=source.slice(source.indexOf('function ApplicantDecision'),source.indexOf('\nfunction Job'));
const {code}=transformSync(component,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const React={createElement:(type,props,...children)=>({type,props:props||{},children})};
const render=new Function('React','Link','money',code+';return ApplicantDecision;')(React,'a',String);
const flatten=n=>n&&typeof n==='object'?[n,...n.children.flat(Infinity).flatMap(flatten)]:[];
test('applied applicant has enabled confirmation and click callback',()=>{
 let called=false;
 const tree=render({application:{status:'applied'},job:{status:'open',headcount:1},onAccept:()=>called=true});
 const button=flatten(tree).find(n=>n.type==='button');
 assert.equal(button.props.disabled,false);
 button.props.onClick();
 assert.equal(called,true);
});
test('all other statuses explain unavailable confirmation; removed assignments link to management',()=>{
 for(const status of ['accepted','unassigned','invited','expired','withdrawn','rejected']){
  const nodes=flatten(render({application:{status,assignment_status:'unassigned'},job:{status:'open',headcount:1,site_id:'s'}}));
  assert.equal(nodes.find(n=>n.type==='button').props.disabled,true);
  assert.ok(nodes.find(n=>n.props.role==='status').children[0]);
  if(['accepted','unassigned'].includes(status))assert.equal(nodes.find(n=>n.type==='a').props.href,'/admin?tab=sites&site=s');
 }
});
test('closed jobs and full headcount cannot confirm',()=>{
 for(const [state,count] of [['closed',0],['open',1]]){
  const nodes=flatten(render({application:{status:'applied'},job:{status:state,headcount:1},selected:count}));
  assert.equal(nodes.find(n=>n.type==='button').props.disabled,true);
 }
});
