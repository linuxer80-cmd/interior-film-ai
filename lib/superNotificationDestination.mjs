const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationDestination(item = {}) {
  const companyId = uuid.test(item.company_id || '') ? item.company_id
    : item.reference_type === 'company' && uuid.test(item.reference_id || '') ? item.reference_id : '';
  const signup = /신규\s*업체\s*가입/.test(item.title || '')
    || ['company_signup', 'company_registered', 'new_company', 'company_created'].includes(item.type);
  if (signup) return companyId ? `/super-admin/company/${companyId}` : '/super-admin';
  const link = typeof item.link === 'string' ? item.link.trim() : '';
  if (link.startsWith('/') && !link.startsWith('//') && !/[\\\s]/.test(link)) return link;
  return companyId ? `/super-admin/company/${companyId}` : '';
}
