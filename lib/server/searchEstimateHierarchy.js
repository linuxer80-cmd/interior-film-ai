import {rankHierarchyCases} from '../hierarchyEstimate.mjs';
import {registeredStoragePath} from '../visualCaseSearch';
export async function searchEstimateHierarchy({supabase,company,body}){
 const fail=(message,status=400)=>Object.assign(Error(message),{status});
 if(!/^[0-9a-f-]{36}$/i.test(body.analysis_id||'')||typeof body.hierarchy_target_id!=='string')throw fail('사진을 다시 분석해주세요.');
 const {data:event,error}=await supabase.from('usage_events').select('metadata').eq('id',body.analysis_id).eq('company_id',company.id).eq('event_type','ai_photo_analysis').maybeSingle();
 if(error)throw fail('분석 결과를 조회하지 못했습니다.',503);
 const target=(event?.metadata?.hierarchy_photos||[]).flatMap(p=>p.targets||[]).find(t=>t.id===body.hierarchy_target_id);
 if(!target)throw fail('유효한 사진 분석 대상이 아닙니다. 다시 분석해주세요.');
 const rows=[];
 for(let page=0;page<100;page++){
 const {data,error}=await supabase.from('photo_case_management').select('id,work_item_id,storage_path,photo_url,photo_stage,targets').eq('company_id',company.id).eq('review_status','reviewed').order('id').range(page*500,page*500+499);
 if(error)throw fail('검토 완료 사례를 조회하지 못했습니다.',503);
 rows.push(...data);if(data.length<500)break;if(page===99)throw fail('사례 검색 범위를 확인해주세요.',503);
 }
 const ranked=rankHierarchyCases(target,rows);
 const cases=await Promise.all(ranked.map(async(r,index)=>{
 const path=registeredStoragePath(r.photo.storage_path||r.photo.photo_url,process.env.NEXT_PUBLIC_SUPABASE_URL);
 let url=null;if(path){const {data}=await supabase.storage.from('work-photos').createSignedUrl(path,600);url=data?.signedUrl||null;}
 return {work_item_id:r.photo.work_item_id,photo_id:r.photo.id,target_id:r.target.id,category:r.target.part,sub_category:r.target.kind,actual_cost:r.target.price,
 hierarchy_matched:true,hierarchy_level:r.level,classification_similarity:r.score,visual_rank:index+1,
 match_reason:`${r.level}단계까지 분류 조건이 유사한 사례입니다. 분류 일치도는 사진의 시각적 유사도나 견적 정확도가 아닙니다.`,differences:r.differences,
 reference_path:path,referenceUrl:url,referenceStatus:url?'ready':'missing',photo_stage:r.photo.photo_stage};
 }));
 const prices=cases.map(c=>c.actual_cost),level=cases[0]?.hierarchy_level;
 const estimate=prices.length?{min:Math.min(...prices),max:Math.max(...prices),average:Math.round(prices.reduce((a,b)=>a+b,0)/prices.length),count:prices.length,confidence:level>=5?'보통':'낮음',range_basis:'hierarchy_cases',price_spread:Math.max(...prices)/Math.min(...prices)>1.5?'wide':'similar'}:null;
 const {error:usageError}=await supabase.from('usage_events').insert({company_id:company.id,event_type:'similar_image_search',quantity:1,cost_krw:0,provider:'internal',model:'hierarchy-v1',metadata:{analysis_id:body.analysis_id,target_id:target.id,hierarchy_level:level||null,matched_cases:cases.map(c=>({photo_id:c.photo_id,target_id:c.target_id,actual_cost:c.actual_cost})),estimate}});
 if(usageError)throw fail('검색 사용량을 저장하지 못했습니다.',503);
 return {success:true,estimate,similar_cases:cases,search_status:cases.length?'hierarchy_matched':'no_candidates',search_message:cases.length?`${level}단계 기준 유사 사례입니다.${level<6?' 구성이나 상태가 다른 상위 분류의 참고 금액입니다.':''} 크기와 실제 작업 조건은 상담으로 확인해주세요.`:'검토 완료된 유사 대상의 가격 사례가 없습니다. 상담으로 확인해주세요.'};
}
