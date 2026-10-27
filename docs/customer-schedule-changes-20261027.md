# Customer schedule changes — 2026-10-27

Confirmed sites now send the approved customer portal schedule notice after committed date changes. The message keeps the approved `필름장이_고객시공전안내_링크` wording and button, with the complete updated list of work dates. No new Solapi template or changed template text is required.

## Behavior

- Changes to dates of scheduled or in-progress sites create a private delivery event in the same transaction as the schedule update. Explicit work dates take precedence over the legacy Korean-time start/end range.
- The transaction's original and final dates are compared as sorted distinct dates. Same-date saves, assignment/role-only edits, rollbacks, temporary edits restored before commit, and initial consultation confirmation do not create change notices.
- Existing schedule-save, assignment-save and status-confirmation hooks drain the site's pending event before considering the first confirmation notice. The existing authenticated daily reconciliation job also drains pending events for up to 24 hours.
- New edits supersede unsent older edits. Cancellation, completion, empty schedules and schedules wholly in the past block delivery. Reservation validates the live tenant, site, customer phone and dates again.
- One event can reserve one delivery and one credit only. A new committed schedule can notify even when an earlier, different schedule's receipt is pending. The same event is never automatically repeated after reservation, timeout, rejection or delivery failure.
- An identical manual schedule notice sent after the edit suppresses its automatic duplicate. Delivery rows retain `customer_schedule`, so existing customer schedule history and provider receipt refresh continue to work.
- Operator exemption, other companies' credit accounting, template approval checks, linked customer pages and SMS fallback prohibition are preserved.
- Existing schedules are not backfilled. Installing this migration itself creates no notices and sends no customer messages.

## Verification

- 993 automated tests passed, including six PGlite transaction/reservation cases and five new application/provider-stub cases.
- Production build passed with placeholder public Supabase variables locally; production prebuild checks approved template content/buttons through GET requests.
- Tested date addition/removal, legacy dates, concurrent duplicate attempts, pending older receipts, refunds, foreign tenant/worker rejection, phone/date staleness, cancellation, expiration, manual suppression and operator accounting.
- No live customer test message was sent. Production application and schema deployment are verified separately from real receipt delivery.
