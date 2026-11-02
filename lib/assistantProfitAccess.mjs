// The original profit endpoint resolves the owner's primary company from the
// verified profile. Do not label those results as a different selected company.
export function assistantProfitAccess(profile, companyId) {
  return typeof companyId === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(companyId) &&
    !!profile && profile.role === 'owner' && profile.is_active !== false &&
    typeof profile.company_id === 'string' && profile.company_id.toLowerCase() === companyId.toLowerCase();
}
