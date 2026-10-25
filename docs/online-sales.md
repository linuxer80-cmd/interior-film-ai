# 필름장이 온라인 영업관리

- 관리자 홈 → 온라인 영업관리 (`/admin/online-sales`). Only fixed company `2ddfe3d9-4411-4991-ae35-5b876be411bc` active owners; no name-based checks. Auth checked via Supabase getUser and current profile/company on every API request. Other companies and workers get 403.
- Apply `database/online_sales_connections.sql`. RLS on; all browser roles revoked, service_role only. No user-supplied company ID.
- 당근 official OpenAPI spec: https://ads-openapi.kr.karrotmarket.com/ (v0.6.1, checked 2026-10-24). API key header `X-API-KEY`, advertiser header `X-ADVERTISER-ID`.
- Only `GET /v1/campaigns` and report-only `POST /v1/performance`; no ad writes, posts or chats. Spec excludes simple-mode search ads; other coverage must be verified against dashboard after first sync. Empty campaigns is not proof all ads are off.
- Connect saves credentials only after full report succeeds. Snapshot replaces atomically; failures preserve previous key/report. One-minute cooldown and 3-minute database lease prevent duplicate calls across instances. At most 10 campaign pages + 20 performance requests per sync. No immediate automatic retry on 429.
- API keys AES-256-GCM encrypted with advertiser/company AAD. HKDF derives a dedicated key from server-only `MARKETING_TOKEN_ENCRYPTION_KEY`, or existing `SUPABASE_SERVICE_ROLE_KEY` if unset. Changing the root invalidates saved credentials; reconnect after rotation. Keys never returned or logged.
- Vercel cron `0 0 * * *` (09:00 Asia/Seoul), protected by existing `CRON_SECRET`; no-op until connected. Reports seven complete Korean calendar days ending yesterday, not a live real-time dashboard. Runtime maximum 60 seconds. Configure CRON_SECRET in Vercel if absent.
- Issue the advertiser-scoped key in 당근 전문가모드 → 고객센터 → 온라인 문의 → 광고 도구 및 전환 → OpenAPI 키 발급. Never paste keys in chat or commit them. Enter only into the app's password field over HTTPS. Reissue invalidates prior keys.
- Disconnect removes app credentials/snapshot and stops pulls; it does not pause advertisements or revoke the key at 당근.
- Verification: `node --test tests/online-sales.test.mjs`; build. Real API verification requires user's issued key and advertiser ID. No success claim until authenticated first sync.

## 네이버 검색광고

- Naver tab supports fixed API Customer ID `1051808` (web advertising account `2149941`). GET-only adapter: official `/ncc/campaigns`, `/ncc/adgroups`, `/ncc/keywords`, `/stats`. No live ad writes, budget changes or assumed rank guarantees.
- `database/online_sales_naver.sql` extends the existing platform constraint and seeds a separate Naver row, retaining all RLS/grant restrictions. Separate company/platform/account AAD + HKDF context prevents credentials being reused across platforms. Existing Daangn v1 ciphertext remains compatible.
- Credentials entered in app: Customer ID, access license, secret. HMAC SHA256 signs `timestamp.GET.path` (no query string) and sends X-Timestamp, X-API-KEY, X-Customer, X-Signature. Secrets never returned or logged.
- Sources checked 2026-10-24: https://ads.naver.com/help/faq/991 ; official spec `https://naver.github.io/searchad-apidoc/assets/json/ncc-heroes-ncc.json` and `ncc-report.json`; official Python signature sample.
- Cursor pagination uses baseSearchId + selector NEXT. Reports request 100 entity IDs per batch, with explicit KST start/end (last seven completed days). Totals count campaigns only, not campaign+group double counting. Missing stats remain null / 미제공 rather than assumed zeros. Costs include VAT. Average rank is historical and only available for supported placements; missing rank is not treated as low rank.
- Keyword queries are on-demand per group (up to 3,000), grouped base bids displayed including useGroupBidAmt. Filter zero-click impressions; sort click/impression/cost/CPC/rank; page 50 rows. No fabricated default sample data.
- Existing 09:00 KST cron independently refreshes both platforms; one failure does not suppress the other. Cron runtime 120 seconds. Per-platform DB leases and 60-second cooldown apply; GET connection state does not call provider.
- Live connection remains pending until the user supplies keys in the password inputs and API validation succeeds. No keys are committed or pasted into chat.

### API identity verification
On 2026-10-24 the signed-in NAVER API management screen under web account 2149941 explicitly displayed CUSTOMER_ID=1051808. Use the API Customer ID for X-Customer/signature requests; the web account ID is not substituted. Existing API enrollment was present; no keys were regenerated.

### Stats entity kinds
NAVER returns HTTP 400 / code 11001 for mixed campaign/adgroup/keyword IDs in a single /stats request. Batch by entity kind, then by 100 IDs. Official maintainer clarification: https://github.com/naver/searchad-apidoc/issues/996#issuecomment-2415590044 . Verified by a regression test that rejects mixed kinds.

### Partial campaign totals
Show the subtotal for campaigns with all three reported metrics (impressions, clicks, VAT-inclusive cost), along with reported/missing campaign counts. Never convert unavailable campaigns to zero. GET normalizes earlier stored snapshots without calling NAVER or changing credentials, so existing connections immediately show the corrected subtotal on reload. Connected settings display saved-key status; replacement fields are opened only by an explicit change-key action.

### Existing keyword bid editing
- Registered keywords → **입찰 수정** edits one keyword through authenticated `action=updateBid`. Owner/company checks, platform credential binding and the shared Naver lease remain in force. No browser receives credentials.
- Server re-reads keyword, group and account campaigns; validates entity ownership, expected effective bid and inherited/individual mode, active parent campaign, and total enabled WEB_SITE campaign daily budgets ≤30,000 KRW. A stale bid/mode returns 409 without writing.
- 70–100,000 KRW, integer multiples of 10; each edit is limited to 10% of the previous effective bid rounded down to 10 KRW (minimum change allowance 10 KRW). The selected keyword switches to individual bidding; no group budget, bid or status is changed. These are base bids, VAT exclusive; device/target weights can affect actual bidding.
- Uses official `PUT /ncc/keywords?fields=bidAmt` with a single-item array and `useGroupBidAmt=false`, followed by independent `GET /ncc/keywords/{id}` verification. Never retries a write. Timeout, failed read-back or mismatch clears the displayed keyword list and requires a fresh lookup; it must not be reported as a successful edit.
- Up to 100 verified changes (time, actor, keyword, previous effective bid/mode, saved bid) are retained under `snapshot.bidChanges`, preserved across report sync. The UI shows the most recent 20. An audit persistence failure is explicitly reported even if provider save was verified.
- This adds manual/API bid editing, not a new autonomous scheduler. The existing morning automation may use this authenticated action within its authorized policy; it must still verify access and outcomes on each run.
- Official reference: https://github.com/naver/searchad-apidoc/blob/master/python-sample/examples/ad_management_sample.py (keyword BidAmt update); https://github.com/naver/searchad-apidoc/issues/982 (individual bidding required).
- Verification: `node --test tests/naver-bid.test.mjs tests/naver-online-sales.test.mjs tests/naver-expansion.test.mjs tests/naver-account-dedup.test.mjs` and production build. Provider mutation tests use mock responses; no live bid is changed as a development test.
