-- Preserve the selected fire classification through report settlement and insertion.
DO $patch$
declare f record; original text; changed text;
begin
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('report_material_settlement','submit_worker_work_report','submit_admin_work_report') loop
 original:=pg_get_functiondef(f.oid); changed:=original;
 if f.proname='report_material_settlement' then
  changed:=replace(changed,'''film_product_id'', m.film_product_id,','''price_type'', m.price_type, ''film_product_id'', m.film_product_id,');
 else
  changed:=replace(changed,'memo, created_by, material_type','memo, created_by, material_type, price_type');
  changed:=replace(changed,'p_user_id, ''actual''','p_user_id, ''actual'', x.price_type');
  changed:=replace(changed,'unit_price numeric, memo text','unit_price numeric, memo text, price_type text');
 end if;
 if changed=original then raise exception 'Expected material transfer definition missing: %',f.proname; end if;
 execute changed;
 end loop;
end $patch$;
