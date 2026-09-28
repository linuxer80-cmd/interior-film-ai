-- LIGHT: 체험판과 같은 월별 횟수, 월 9,900원.
-- dev와 main이 DB를 공유할 수 있어 운영 코드 배포 전에는 비활성으로 등록한다.
-- 체험판에 이미 저장한 사진은 지워지지 않으므로 저장공간 총한도는 두 배.
insert into public.subscription_plans (
  plan_code, plan_name, monthly_price_krw,
  ai_photo_analysis_limit, auto_estimate_limit, similar_image_search_limit,
  virtual_remodel_limit, image_upload_limit, storage_mb_limit,
  customer_lead_limit, is_active, sort_order
)
select
  'light', '라이트', 9900,
  ai_photo_analysis_limit, auto_estimate_limit, similar_image_search_limit,
  virtual_remodel_limit, image_upload_limit,
  case when storage_mb_limit > 0 then storage_mb_limit * 2 else storage_mb_limit end,
  customer_lead_limit, false, sort_order + 1
from public.subscription_plans
where lower(plan_code) = 'trial'
on conflict (plan_code) do update set
  plan_name = excluded.plan_name,
  monthly_price_krw = excluded.monthly_price_krw,
  ai_photo_analysis_limit = excluded.ai_photo_analysis_limit,
  auto_estimate_limit = excluded.auto_estimate_limit,
  similar_image_search_limit = excluded.similar_image_search_limit,
  virtual_remodel_limit = excluded.virtual_remodel_limit,
  image_upload_limit = excluded.image_upload_limit,
  storage_mb_limit = excluded.storage_mb_limit,
  customer_lead_limit = excluded.customer_lead_limit,
  is_active = public.subscription_plans.is_active,
  sort_order = excluded.sort_order;

select plan_code, plan_name, monthly_price_krw,
  ai_photo_analysis_limit, auto_estimate_limit, similar_image_search_limit,
  virtual_remodel_limit, image_upload_limit, storage_mb_limit, customer_lead_limit
from public.subscription_plans
where plan_code in ('trial', 'light')
order by case plan_code when 'trial' then 0 else 1 end;
