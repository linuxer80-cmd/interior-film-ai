-- Read-only inventory of direct Auth foreign keys and conventional UUID actor columns.
-- Empty results are not proof that all personal data or files are removed.
create or replace function public.inspect_account_deletion_references(p_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ declare r record; n bigint; result jsonb:='[]';
begin
 if p_user is null then raise exception 'User required'; end if;
 for r in select ns.nspname,c.relname,a.attname,k.confdeltype
 from pg_catalog.pg_constraint k
 join pg_catalog.pg_class c on c.oid=k.conrelid
 join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
 join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
 where k.contype='f' and k.confrelid='auth.users'::regclass
 and array_length(k.conkey,1)=1 and ns.nspname not in ('auth','storage')
 loop
 execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname) into n using p_user;
 if n>0 then result:=result||jsonb_build_array(jsonb_build_object('schema',r.nspname,'table',r.relname,'column',r.attname,'rows',n,'delete_action',r.confdeltype)); end if;
 end loop;
 for r in select ns.nspname,c.relname,a.attname
 from pg_catalog.pg_attribute a
 join pg_catalog.pg_class c on c.oid=a.attrelid
 join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
 where ns.nspname in ('public','app_private') and c.relkind in ('r','p')
 and a.attnum>0 and not a.attisdropped and a.atttypid='uuid'::regtype
 and (a.attname in ('user_id','created_by','updated_by','reviewed_by','sender_id','recipient_user_id','owner_user_id','actor_id','actor','uploaded_by','requested_by','confirmed_by','cancelled_by','voided_by') or a.attname like '%user_id')
 and not exists(select 1 from pg_catalog.pg_constraint k where k.contype='f' and k.conrelid=c.oid and a.attnum=any(k.conkey))
 loop
 execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname) into n using p_user;
 if n>0 then result:=result||jsonb_build_array(jsonb_build_object('schema',r.nspname,'table',r.relname,'column',r.attname,'rows',n,'delete_action','unlinked')); end if;
 end loop;
 -- Known personal subject encoding used by awards, rewards and referrals.
 -- Exact equality avoids matching company subjects or similarly prefixed IDs.
 for r in select ns.nspname,c.relname,a.attname
 from pg_catalog.pg_attribute a
 join pg_catalog.pg_class c on c.oid=a.attrelid
 join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
 where ns.nspname in ('public','app_private') and c.relkind in ('r','p')
 and a.attnum>0 and not a.attisdropped and a.attname='subject_key'
 and a.atttypid in ('text'::regtype,'character varying'::regtype)
 loop
 execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname)
 into n using 'user:'||p_user::text;
 if n>0 then result:=result||jsonb_build_array(jsonb_build_object('schema',r.nspname,'table',r.relname,'column',r.attname,'rows',n,'delete_action','unlinked')); end if;
 end loop;
 return result;
end;$f$;
revoke all on function public.inspect_account_deletion_references(uuid) from public,anon,authenticated;
grant execute on function public.inspect_account_deletion_references(uuid) to service_role;
