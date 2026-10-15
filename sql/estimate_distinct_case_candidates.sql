create or replace function public.get_estimate_case_candidates(query_embedding vector, company_slug text, target_key text, match_threshold double precision default 0.65, match_count integer default 50)
returns table(work_item_id uuid, category text, sub_category text, actual_cost numeric, similarity double precision, matched_photo_id uuid)
language sql stable security invoker set search_path=public as $$
with eligible as (
 select w.*, case
 when concat_ws(' ',w.category,w.sub_category) ~* '붙박이장|옷장|wardrobe|closet' then 'closet'
 when concat_ws(' ',w.category,w.sub_category) ~* '신발장|현관장|shoe cabinet' then 'shoe'
 when concat_ws(' ',w.category,w.sub_category) ~ '냉장고장|싱크대|주방|상부장|하부장' then 'kitchen'
 when concat_ws(' ',w.category,w.sub_category) ~ '화장대|서랍장' then 'vanity'
 when concat_ws(' ',w.category,w.sub_category) ~ '샷시|창틀|창문' then 'window'
 when concat_ws(' ',w.category,w.sub_category) ~ '중문' then 'middle_door'
 when concat_ws(' ',w.category,w.sub_category) ~ '방화문' then 'fire_door'
 when concat_ws(' ',w.category,w.sub_category) ~ '방문|문틀|현관문|도어|슬라이딩' then 'door'
 when concat_ws(' ',w.category,w.sub_category) ~ '몰딩|걸레받이' then 'molding'
 when concat_ws(' ',w.category,w.sub_category) ~ '아트월|벽체|벽면' then 'wall'
 else w.category end as target
 from public.work_items w join public.companies c on c.id=w.company_id
 where c.slug=lower(trim(company_slug)) and c.is_active=true and w.actual_cost>0
), best as (
 select distinct on (w.id) w.id,w.category,w.sub_category,w.actual_cost,
 (1-(p.embedding <=> query_embedding))::double precision as similarity,p.id as photo_id
 from eligible w join public.work_photos p on p.work_item_id=w.id and p.company_id=w.company_id
 where w.target=target_key and p.photo_type in ('before','history') and p.embedding is not null
 and (1-(p.embedding <=> query_embedding))>=match_threshold
 order by w.id,p.embedding <=> query_embedding,p.id
)
select id,category,sub_category,actual_cost,similarity,photo_id from best
order by similarity desc,id limit greatest(1,least(coalesce(match_count,50),50));
$$;
revoke all on function public.get_estimate_case_candidates(vector,text,text,double precision,integer) from public,anon,authenticated;
grant execute on function public.get_estimate_case_candidates(vector,text,text,double precision,integer) to service_role;