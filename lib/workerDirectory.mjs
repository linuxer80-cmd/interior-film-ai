export const directoryFields = ['user_id','name','region','skills','experience_years','daily_wage','introduction','connected','request_status'];
export function publicDirectoryProfile(row) {
  return Object.fromEntries(directoryFields.map(key => [key, row[key]]));
}
export function pendingConnection(row, now = Date.now()) {
  return row.status === 'pending' && Date.parse(row.expires_at) > now && row.company_active !== false;
}
