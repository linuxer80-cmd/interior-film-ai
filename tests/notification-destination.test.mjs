import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {notificationDestination} from '../lib/superNotificationDestination.mjs';
const id='10000000-0000-0000-0000-000000000001';
test('super admin registration, billing, orders and company destinations',()=>{
 for(const [notice,target] of [
 [{title:'신규 시공자 등록',link:'/super-admin/notifications',company_id:id},'/super-admin/workers'],
 [{reference_type:'worker_profiles'},'/super-admin/workers'],
 [{reference_type:'payment',link:'/super-admin'},'/super-admin/billing'],
 [{reference_type:'material_order'},'/super-admin/material-orders'],
 [{type:'company_signup',company_id:id},`/super-admin/company/${id}`],
 [{link:'/super-admin/billing?payment=123'},'/super-admin/billing?payment=123'],
 [{link:'/\\evil.example'},'/super-admin/notifications']
 ])assert.equal(notificationDestination(notice),target);
});
test('push keeps precise site, consultation and existing deep links for each role',()=>{
 const src=fs.readFileSync(new URL('../app/api/send-push/route.js',import.meta.url),'utf8');
 const start=src.indexOf('function isSafeInternalLink');const end=src.indexOf('async function getSuperAdminUserIds');
 const ctx=vm.createContext({notificationDestination,cleanText:(v,f='')=>typeof v==='string'?v.trim():f});
 vm.runInContext(src.slice(start,end)+'\nglobalThis.resolve=buildNotificationUrl;',ctx);
 for(const [notice,target] of [
 [{recipient_type:'worker',reference_type:'site_assignment',reference_id:id,link:'/worker'},`/worker/site/${id}`],
 [{recipient_type:'company_admin',reference_type:'site',reference_id:id,link:'/admin'},`/admin?tab=sites&site=${id}`],
 [{recipient_type:'company_admin',reference_type:'lead',reference_id:id},`/admin?tab=leads&lead=${id}`],
 [{recipient_type:'company_admin',type:'customer_request_photos',reference_type:'site',reference_id:id,link:`/admin?tab=sites&site=${id}&section=photos`},`/admin?tab=sites&site=${id}&section=photos`],
 [{recipient_type:'super_admin',title:'신규 시공자 등록',link:'/super-admin/notifications'},'/super-admin/workers'],
 [{recipient_type:'company_admin',reference_type:'customer_chat',reference_id:id,link:`/admin/customer-chat?thread=${id}`},`/admin/customer-chat?thread=${id}`],
 [{recipient_type:'worker',link:'/worker/attendance'},'/worker/attendance']
 ])assert.equal(ctx.resolve(notice),target);
});
