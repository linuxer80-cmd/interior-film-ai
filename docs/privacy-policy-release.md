# Privacy policy publication — 2026-11-05

The public policy for **필름장이 · 현장 AI 비서**, operated by **기분좋은공간**,
uses the existing `/support/legal/privacy` URL. A dedicated static route takes
precedence over the older `[document]` draft renderer. Terms and optional case
sharing documents remain drafts; publishing the privacy notice does not activate
them or collect consent. The former privacy draft remains in Git history/source
for reference.

## Evidence used

- Production repository base: `bdc46606facc6ca267d63d9c16b200b46389e99d`.
- Supabase primary production project `gxtvvzysuhexhpljpswj`: region
  `ap-northeast-2`; organization `laroaqowtukbszmweoly`: Pro plan, confirmed
  through project/organization metadata on 2026-11-05. No customer rows were read.
- Vercel project `interior-film-ai`, team `linuxer80`: Pro plan confirmed through
  Git deployment context. `vercel.json` selects `hnd1` (Tokyo) for functions.
- `app/worker/account/page.js`: profile, wage and bank account fields.
- `app/api/attendance/route.js`: GPS, accuracy, consent and assigned-site checks.
- `app/api/worker/commute/route.js`: registered departure/site addresses sent
  to Kakao geocoding and Kakao Mobility route APIs.
- `app/api/admin/transcribe-site-call/route.js`: OpenAI transcription and
  temporary Storage cleanup in `finally`. Failed cleanup is logged, not a
  guaranteed time-based expiration. `site-call-upload` cleanup only runs during
  upload activity, so no universal three-hour deletion promise is made.
- `app/api/admin/parse-site-call/route.js`, `site-screenshot`, photo/estimate/
  cutting/receipt routes: input and analysis via OpenAI APIs; some Responses
  requests omit `store:false`. The notice does not assert universal zero retention.
- `lib/siteAlimtalk.mjs`: SOLAPI delivery; `lib/googleCalendar.mjs` and
  `calendarAutoSync.mjs`: Google Calendar event linkage; `app/utils/tossBilling.js`:
  billing; `lib/naverAds.mjs` / `daangnAds.mjs`: optional advertiser tools.
- `lib/supabase.js`, `usePersonalMenus.js`, draft/report components: local and
  session storage. Device originals and exported copies are separate from server
  deletion.
- `docs/account-deletion-release.md` and `/account/delete`: limited automatic
  scopes plus review-required requests and email support. The notice does not
  describe every existing account/company as automatically deletable.

## Provider and policy references checked

- Google Play User Data:
  https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play account deletion:
  https://support.google.com/googleplay/android-developer/answer/13327111
- Supabase backup defaults:
  https://supabase.com/docs/guides/platform/backups
- Supabase logs (accessible history varies by plan):
  https://supabase.com/kb/troubleshooting/check-usage-for-monthly-active-users-mau-MwZaBs
- Supabase regions and cross-border operations:
  https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Supabase subprocessor list (October 12, 2026):
  https://supabase.com/legal/customer-resources/subprocessor-list
- Vercel runtime log defaults:
  https://vercel.com/docs/logs/runtime
- OpenAI API data controls and processing locations:
  https://developers.openai.com/api/docs/guides/your-data
  https://openai.com/policies/sub-processor-list/
- SOLAPI current retention statement (November 2, 2026):
  https://solapi.com/notices/20261102-104008
  https://solapi.com/privacy

## Scope and operating obligations

This is a publication of the notice and its navigation links. It does not change
database retention, execute data deletion, accept processor agreements, certify
legal compliance, finalize Google Play Data Safety answers, submit the app for
review or release the Android app.

The operator must actually handle email/review-required rights requests, give
case-specific retention grounds and timing, and apply prior deletions during any
backup restoration. Basic provider log/back-up periods are identified as defaults,
not promises that every service-provider security/support record is erased then.
The public policy discloses regional and global processing without representing
that a Korea database region confines all processing to Korea.

Keep the policy current when enabling new data uses, changing providers or
retention, or modifying permission/consent flows. The Android prominent disclosure
and Google Play declarations remain a separate release check.
