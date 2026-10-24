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
