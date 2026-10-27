# Functional error audit — 2026-10-27 KST

## Scope and fixes

The audit followed material registration, outgoing/return quantities, completion reports and profit calculations. Production reads were scoped to the owner's company. No business records were changed and no customer or worker notifications were sent during this audit.

- Worker inventory and tomorrow's preparation API now exclude archived planned materials. This closes two remaining paths that could display an excluded duplicate such as S245.
- Provisional material cost now reads the outgoing/return ledger, including quantities entered manually without a stock-roll trip. Ledger quantities take precedence over mirrored roll movements so costs are counted once. Actual material rows remain authoritative. Missing or excessive returns remain pending instead of producing a confirmed cost.
- Dealer attribution ignores archived planned duplicates when matching actual material costs.

## Verification

- Baseline: 941 automated tests passed. The new manual-quantity regression failed before the fix (no provisional cost row) and passed after it.
- Final: 945 tests passed, zero failed or skipped; production-mode webpack build passed with placeholder server credentials. Local build does not validate live notification credentials.
- Regressions cover manual movements, mirrored roll movements, actual-cost replacement, missing/invalid returns, company/site isolation, archived materials, and lookup/authentication failures.
- Read-only production checks found no active planned-material duplicates, excessive material returns, invalid stock-trip quantities, negative stock, actual quantity/price total mismatches, or cross-company/site trip-material links in the inspected company.
- The recent 50-minute Vercel error/fatal scan returned no entries. This does not cover older logs or every client-side error.
- Signed-in mobile browser submission flows were not exercised; test and database checks are not a substitute for that verification.

## Unresolved findings

- The site 옥빛마을 13단지 has an approved completion report but is still in progress. Its site update is later than report approval, so it may have been reopened intentionally. Three issued Younglim materials on that site have no saved fire/non-fire classification. These values were not inferred or overwritten.
- Other legacy materials also lack fire classification, including completed/cancelled sites and the consultation site whose material the owner previously asked to leave unchanged. A known product code alone was not treated as proof of variant.
- PostgreSQL logs for 05:30–06:30 UTC contain 3,388 revision-conflict errors from `save_photo_case_classification` (SQLSTATE 40001). The caller is not identified. Reviewed UI code stops on a conflict rather than automatically retrying it, and the corresponding REST request was not found in the inspected edge logs. Keep the optimistic concurrency guard; do not attribute these errors to an app retry loop without further evidence.

## Follow-up checks

- Reconcile the legacy fire types and the reopened-site status with the owner's intended records before changing data.
- Correlate any new photo-classification conflict with a request/session and revision value. Distinguish expected concurrent editing from repeated stale writes before changing retry behavior.
- Before future material changes, run the existing report, inventory, provisional-cost and dealer-cost regressions together, then verify the signed-in worker flow on a test site.
