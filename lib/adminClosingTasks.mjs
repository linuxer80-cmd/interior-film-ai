import {siteClosingChecks} from './siteClosure.mjs';
export function buildClosingTasks({sites,reports,balances,trips,materials}) {
  const latest=new Map();
  const time=r=>Date.parse(r.updated_at||r.created_at||'')||0;
  for(const r of reports){const previous=latest.get(r.site_id);if(!previous||time(r)>time(previous)||(time(r)===time(previous)&&String(r.id)>String(previous.id)))latest.set(r.site_id,r);}
  const group=rows=>{const map=new Map();for(const row of rows){if(!map.has(row.site_id))map.set(row.site_id,[]);map.get(row.site_id).push(row);}return map;};
  const accounts=new Map(balances.map(b=>[b.id,b])),rolls=group(trips),actual=group(materials),rows=[];
  for(const site of sites){
    if(site.status==='cancelled')continue;
    const report=latest.get(site.id);if(!report)continue;
    const status=report.review_status||'pending';
    if(!['pending','rejected','approved'].includes(status))continue;
    const checks=siteClosingChecks({site,report:{materials:actual.get(site.id)||[]},payment:{site:accounts.get(site.id)},stock:{trips:rolls.get(site.id)||[]}});
    const actions=[...(['pending','rejected'].includes(status)?[{id:'review',message:status==='pending'?'완료보고 검수 대기':'시공자 보완 진행 확인',label:status==='pending'?'완료보고 검수':'보완 내용 확인',menu:'report'}]:[]),...checks.actions];
    for(const unknown of checks.unknown)actions.push({id:'unknown-'+unknown,message:unknown+' 확인 필요',label:'내역 확인',menu:unknown==='입금 내역'?'settlement':'materials'});
    if(!actions.length)continue;
    rows.push({siteId:site.id,name:site.site_name||site.customer_name||'이름 없는 현장',reviewStatus:status,updatedAt:report.updated_at||report.created_at||'',actions:actions.map(({detail,...action})=>({...action,section:action.id==='price'?'material-prices':action.id==='returns'?'material-returns':action.menu}))});
  }
  const priority=r=>r.actions.some(a=>a.id==='review')?0:r.actions.some(a=>a.menu==='settlement')?1:2;
  rows.sort((a,b)=>priority(a)-priority(b)||a.updatedAt.localeCompare(b.updatedAt)||a.siteId.localeCompare(b.siteId));
  return {rows,counts:{all:rows.length,review:rows.filter(r=>r.actions.some(a=>a.menu==='report')).length,payment:rows.filter(r=>r.actions.some(a=>a.menu==='settlement')).length,materials:rows.filter(r=>r.actions.some(a=>a.menu==='materials')).length}};
}
