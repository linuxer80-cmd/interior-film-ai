-- Read-only. Needed to calibrate all feature limits against the paid-plan budget.
select jsonb_build_object(
  'plans', (select jsonb_agg(jsonb_build_object(
    'plan_code',plan_code,'plan_name',plan_name,
    'monthly_price_krw',monthly_price_krw,'is_active',is_active
  )) from public.subscription_plans),
  'quotas', (select jsonb_agg(jsonb_build_object(
    'plan_code',plan_code,'feature',feature,'label',label,'usage_limit',usage_limit
  )) from public.ai_feature_quotas),
  'functions', (select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid)
  )) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname in ('reserve_ai_feature_quota','record_ai_feature_call'))
) as ai_budget_settings;
