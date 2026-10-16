const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationDestination(item = {}) {
  const reference=String(item.reference_type||'').toLowerCase();
  const type=String(item.type||'').toLowerCase();
  const title=String(item.title||'');
  const companyId=uuid.test(item.company_id||'')?item.company_id
    : ['company','companies'].includes(reference)&&uuid.test(item.reference_id||'')?item.reference_id:'';
  const link=typeof item.link==='string'?item.link.trim():'';
  const safe=link.startsWith('/')&&!link.startsWith('//')&&!/[\\\s]/.test(link);
  const generic=['/','/super-admin','/super-admin/','/super-admin/notifications'];
  if(/신규\s*시공자|시공자\s*(등록|가입)|시공자\s*프로필/.test(title)
    ||['worker_signup','worker_registered','worker_profile_created','new_worker','worker_created'].includes(type)) return '/super-admin/workers';
  if(/신규\s*업체\s*가입/.test(title)||['company_signup','company_registered','new_company','company_created'].includes(type)) return companyId?`/super-admin/company/${companyId}`:'/super-admin';
  if(safe&&!generic.includes(link))return link;
  if(['worker','workers','worker_profile','worker_profiles'].includes(reference))return '/super-admin/workers';
  if(['payment','subscription','billing'].includes(reference)||/payment|subscription|billing/.test(type))return '/super-admin/billing';
  if(['material_order','film_order'].includes(reference)||/material_order|film_order/.test(type))return '/super-admin/material-orders';
  if(['company','companies'].includes(reference)&&uuid.test(item.reference_id||''))return `/super-admin/company/${item.reference_id}`;
  if(companyId)return `/super-admin/company/${companyId}`;
  return safe?link:'/super-admin/notifications';
}
