// The caller must be an active owner; a company ID alone is not a role.
export function mayAnalyzeSiteCall(profile) {
  return !!profile && profile.role === 'owner' && !!profile.company_id && profile.is_active !== false;
}
