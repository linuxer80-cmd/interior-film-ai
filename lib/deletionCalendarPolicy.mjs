export const VERIFIED_CALENDAR_POLICY = 'verified_app_events_only';
// This is a server scope contract, not a client checkbox or a claim of complete
// historical knowledge. Unattributable external events stay in Google Calendar.
export function knownCalendarPolicy(scope) {
  return scope?.policy === VERIFIED_CALENDAR_POLICY && scope?.knownScopeVerified === true;
}
export function calendarScopeReady(scope) {
  return (scope?.sitesComplete === true && scope?.usersComplete === true) || knownCalendarPolicy(scope);
}
