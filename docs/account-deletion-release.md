# Account and company deletion release notes

Status: production database and application rollout verified on 2026-11-05.

PR #73 was merged as 09aeaa4f6fe63455eb8938d5e2ad4d61dfce9c8d. Vercel production
deployment dpl_CJ3sgDrb9fzcmtjEwo3WixPbsqFb reached READY and serves
https://interior-film-ai.vercel.app/account/delete. Both execution and retry
switches are enabled for production only.

Production verification confirmed the rendered sign-in gate and HTTP 200 page;
unauthenticated GET/POST, invalid-token GET and unauthenticated retry GET each
returned 401 with Cache-Control: no-store. Existing account/company/site/file
counts were unchanged; there were no deletion requests or frozen companies.
No existing production account or company was deleted. Actual destructive
integration tests were run only with disposable fixtures in the isolated test
project, not by submitting an existing production user's deletion form.

The authenticated POST binds the request to the signed-in subject. Supported
minimal personal accounts and supported last-owner company scopes use the real
leased executor. Unknown records, ownership and file formats require review.
Other members' Auth accounts and independently owned files must be preserved.

## Retry after a completion outage

After Auth removal, the durable request retains subject_id. The server retry
processor derives its subject from that stored verified request, never HTTP
input. If Auth is already absent, it rechecks personal references, core cleanup,
files and full completion before writing the receipt. It does not re-ban or
recreate the removed account.

The retry endpoint requires CRON_SECRET. It selects one failed request per run;
claim_account_deletion_retry atomically requires a verified request, absent lease,
at least five minutes since failure and attempts from one through four. It cannot
claim review_required requests, completed requests or even expired non-null
leases. Expired leases still require verification that the previous execution
has stopped before explicit recovery. The HTTP response contains no subject IDs.

The cron schedule is every ten minutes. Both ACCOUNT_DELETION_EXECUTION_ENABLED
and ACCOUNT_DELETION_RETRY_ENABLED must be exactly true to run retries. The first
also gates execution through the user-facing POST; neither defaults to enabled.

## Verified

- Affected executor, adapter, processor, company, request and retry regressions: 94 passed.
- Next production build passed with placeholder public Supabase settings.
- Isolated hosted test: actual temporary Auth account/profile/avatar deletion,
  injected completion write failure, retry from stored subject, durable completion,
  and preservation of a control account/avatar. No eligibility override used.
- Hosted concurrent retry: two workers attempted the same failed request; exactly
  one completed and one returned busy. Both fixture cleanup checks passed.
- Fixture users, request and files were removed; the probe endpoint was retired.
- Isolated hosted company test used the actual request handler and processor,
  without eligibility overrides: populated company/site/business/media, company
  file and owner Auth/avatar were removed, while another member's Auth/avatar
  remained and their profile was detached. The durable receipt and fixture
  teardown were verified; the probe was retired.

## Remaining support boundaries

Automatic deletion is not yet a general solution for every existing account or
company. Company workers/settings and other tables outside the explicit contract,
populated personal histories, ordinary URL aliases and unverified legacy file
ownership still require additional implementation or ownership review. These
requests remain review_required before destructive work. Do not describe this
release as complete automatic deletion support for all existing companies.

## Release dependencies

Production installation uses database/account_deletion_release_manifest.json and
scripts/build-account-deletion-release.mjs. The 78 ordered source scripts form
one transaction with a short lock timeout and no request execution. Installation
was rehearsed on TEST both as an update and after temporarily dropping the new
deletion tables inside a transaction that was rolled back. Production installation
completed; counts of Auth users, companies, sites and Storage objects were unchanged.
The exact deterministic identities of existing auto-calendar events were recovered
without reading or changing remote Google events.

Install the entire ordered bundle before enabling execution. Test probes and
synthetic fixtures must never be installed as production endpoints. Unknown
ownership and unsupported data are review conditions; neither the installer nor
an environment switch broadens the server-owned eligibility contract.
