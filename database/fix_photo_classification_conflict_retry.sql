do $fix$
declare def text;
begin
 def := pg_get_functiondef('public.save_photo_case_classification(uuid,uuid,integer,jsonb)'::regprocedure);
 if position($old$errcode='PT409'$old$ in def)>0 then return; end if;
 if position($old$errcode='40001'$old$ in def)=0 then raise exception 'Function did not match expected definition'; end if;
 def := replace(def, $old$errcode='40001'$old$, $new$errcode='PT409'$new$);
 execute def;
end $fix$;
