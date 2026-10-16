const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false,created_at timestamptz default now());
 create table public.companies(id uuid primary key,is_active boolean default true,subscription_plan text);
 create table public.profiles(id uuid primary key,company_id uuid,role text,is_active boolean default true);
 create table public.subscription_plans(plan_code text,is_active boolean default true);
 create table public.achievement_definitions(id text primary key,title text,description text,audience text,metric text check(metric in ('ai_photo','cutting_days')),target integer,art_key integer,tier text,sort_order integer);
 create table public.achievement_awards(subject_key text,badge_id text,progress_at_award bigint,earned_at timestamptz default now(),primary key(subject_key,badge_id));
 create table public.ai_quota_periods(scope_key text,feature text,period_start timestamptz,used bigint,primary key(scope_key,feature,period_start));
 create table public.ai_quota_requests(request_id uuid primary key,scope_key text,feature text,period_start timestamptz,units integer);
 create function public.achievement_action(p_actor uuid,p_action text,p_body jsonb) returns jsonb language plpgsql as $$ declare badge record;metrics jsonb:='{}';subject text;scope text;begin
 scope:=p_body->>'scope';subject:=public.referral_subject(p_actor,scope);
 for badge in select * from public.achievement_definitions where audience=scope loop
 if coalesce((metrics->>badge.metric)::int,0)>=badge.target then insert into public.achievement_awards values(subject,badge.id,(metrics->>badge.metric)::int,now()) on conflict do nothing;end if;end loop; return metrics;end $$;
 create function public.reserve_ai_feature_quota(p_company_id uuid,p_request_id uuid,p_feature text,p_units integer,p_reserve boolean default true) returns jsonb language plpgsql as $$ begin
 if p_feature='invalid' then return '{"ok":false,"error":"invalid feature"}'::jsonb;end if;
 return '{"ok":false,"used":2,"limit":2,"error":"exhausted"}'::jsonb;end $$;
 `);
 const sql=fs.readFileSync(path.join(__dirname,'../database/referral_rewards.sql'),'utf8');
 await db.exec(sql);await db.exec(sql);console.log('PASS installation and rerun; metric constraints preserved');
 const owner='00000000-0000-4000-8000-000000000001',friend='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',co='00000000-0000-4000-8000-000000000010';
 await db.exec(`insert into auth.users(id,email_confirmed_at,created_at) values('${owner}',now(),now()-interval '1 day'),('${friend}',now(),now()+interval '1 minute'),('${other}',now(),now()+interval '1 minute');insert into companies values('${co}',true,'trial');insert into profiles values('${owner}','${co}','owner',true);insert into subscription_plans values('trial',true);`);
 async function rpc(actor,action,body){return (await db.query('select public.referral_action($1,$2,$3) as r',[actor,action,JSON.stringify(body)])).rows[0].r;}
 const invite=await rpc(owner,'create',{scope:'owner'});assert.equal(invite.token.length,64);
 assert.equal((await rpc(owner,'create',{scope:'owner'})).token,invite.token);
 assert.equal((await rpc(owner,'get',{scope:'owner'})).metrics.owner_referral_shared,0);
 await rpc(owner,'shared',{scope:'owner',token:invite.token});await rpc(owner,'shared',{scope:'owner',token:invite.token});
 assert.equal((await rpc(owner,'get',{scope:'owner'})).metrics.owner_referral_shared,1);
 await assert.rejects(()=>rpc(owner,'claim',{scope:'worker',token:invite.token}));
 await rpc(friend,'claim',{scope:'worker',token:invite.token});await rpc(friend,'claim',{scope:'worker',token:invite.token});
 await assert.rejects(()=>rpc(other,'claim',{scope:'worker',token:invite.token}));
 const second=await rpc(owner,'create',{scope:'owner'});await assert.rejects(()=>rpc(friend,'claim',{scope:'worker',token:second.token}));
 await db.query("update app_referrals set expires_at=now()-interval '1 day' where token=$1",[second.token]);
 await assert.rejects(()=>rpc(other,'claim',{scope:'worker',token:second.token}));
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[other]);
 await assert.rejects(()=>rpc(other,'create',{scope:'worker'}));
 console.log('PASS one-time link, idempotence, self referral and duplicate recipient rejection');
 await db.query("select achievement_action($1,'get','{\"scope\":\"owner\"}')",[owner]);
 const credits=(await db.query('select * from badge_ai_credits')).rows;
 assert.equal(credits.reduce((n,c)=>n+c.granted,0),13);
 await db.query("select achievement_action($1,'get','{\"scope\":\"owner\"}')",[owner]);
 assert.equal((await db.query('select sum(granted)::int as n from badge_ai_credits')).rows[0].n,13);
 console.log('PASS invite and actual signup badges separate, reward issued once');
 let counter=100;async function reserve({units=1,reserve=true,id,actor=owner,feature='ai_photo_analysis'}={}){return (await db.query('select reserve_ai_with_badges($1,$2,$3,$4,$5,$6) as r',[co,actor,id||`00000000-0000-4000-8000-${String(counter++).padStart(12,'0')}`,feature,units,reserve])).rows[0].r;}
 assert.equal((await reserve({reserve:false})).ok,true);assert.equal((await db.query('select sum(used)::int as n from badge_ai_credits')).rows[0].n,0);
 const id='00000000-0000-4000-8000-000000000099';assert.equal((await reserve({id})).ok,true);assert.equal((await reserve({id})).reused,true);assert.equal((await reserve({id,units:2})).ok,false);
 assert.equal((await reserve({feature:'invalid'})).ok,false);
 assert.equal((await db.query('select sum(used)::int as n from badge_ai_credits')).rows[0].n,1);
 await db.exec("update companies set subscription_plan='basic'");assert.equal((await reserve()).ok,false);await db.exec("update companies set subscription_plan='trial'");
 const concurrent=await Promise.all(Array.from({length:10},()=>reserve()));assert.equal(concurrent.filter(r=>r.ok).length,7);
 assert.equal((await db.query("select sum(used)::int as n from badge_ai_credits where feature='ai_photo_analysis'")).rows[0].n,8);
 console.log('PASS quota preview, spend, retry, request mismatch, plan restriction and no overspend');
 // Backfill remains idempotent after spend.
 await db.exec(sql);assert.equal((await db.query('select sum(granted)::int as n from badge_ai_credits')).rows[0].n,13);
 assert.equal((await db.query('select sum(used)::int as n from badge_ai_credits')).rows[0].n,8);
 console.log('PASS rerun retains consumed credits');await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
