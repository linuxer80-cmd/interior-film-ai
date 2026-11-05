begin;
-- Suppress notifications and calendar jobs only while deleting this company's
-- materials. Keep stock/settlement integrity triggers and normal edits intact.
do $patch$
declare fn text; original text; changed text;
 guard text:=E'\n if tg_op=''DELETE'' and tg_table_schema=''public'' and tg_table_name=''site_materials'' and exists(select 1 from app_private.company_material_deletions where company_id=(to_jsonb(old)->>''company_id'')::uuid) then return old;end if;\n';
begin
 foreach fn in array array['app_private.calendar_auto_changed()','app_private.site_change_trigger()'] loop
  original:=pg_get_functiondef(fn::regprocedure);
  if position('company_material_deletions' in original)=0 then
   changed:=regexp_replace(original,E'\nbegin\n',E'\nbegin\n'||guard,'i');
   if changed=original then raise exception 'Unrecognized material trigger body';end if;
   execute changed;
  end if;
 end loop;
end;$patch$;
commit;
