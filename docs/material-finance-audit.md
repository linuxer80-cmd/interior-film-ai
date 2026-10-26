# Material and finance audit — 2026-10-27 KST

## Corrected paths

- New-site registration now prepares material identities and company purchase prices on the server before creating the site. Explicit fire/non-fire selection is validated, catalog aliases are resolved, contradictory variants and stale product links are rejected, and missing or conflicting purchase prices remain blank. Planned quantities remain zero; movement records determine actual usage.
- Actual material editing retains product IDs and fire types. Price lookup refreshes when the variant changes and only offers matching prices. Settled material edits cannot silently change the variant through the price-only fallback.
- `material_purchase_cost` limits supplier choices to a known saved variant. Selecting a supplier price for a legacy unknown variant also saves the chosen variant. Existing quantity, company authorization and optimistic version checks remain in place.
- Excluded planned materials no longer participate in report settlement or provisional-profit calculations.
- Labor pending flags now follow the rows actually used in the profit calculation, after manual/approved-report overrides. Missing historical wages no longer keep a manually confirmed labor total pending.

## Verification

- Full baseline: 914 tests, 860 passed, 23 failed, 31 skipped.
- Existing failures were traced to outdated fixtures/contracts: directory searches now use an authorized RPC; worker pay includes reimbursements/payment reads; registration routes the super-admin legacy editor separately; navigation labels and quote grouping changed; both customer and worker notifications are scheduled. Updated test fixtures preserve authorization, company isolation, duplicate prevention and error handling assertions.
- Full suite after fixes and fixture refresh: 922 tests, 891 passed, 0 failed, 31 skipped. One additional actual-material API regression test also passes (5/5 in its file).
- Production webpack build passed. Regression coverage includes new registration price failures before site creation, zero/ambiguous prices, selected product/fire-type persistence, invalid variant rejection, removed material exclusion and labor override pending flags.
- PostgreSQL functions tested in PGlite and in a production transaction rolled back before migration. After applying the migration, verified the Kimpo settlement: 45m issued − 20.4m returned = 24.6m, non-fire ZX103 at KRW 8,400/m = KRW 206,640. Function execution remains denied to anon/authenticated roles and permitted only through existing server access.
- No new production business records or notification sends were created by the audit.

## Limits

- This is not proof that every app flow is bug-free. Signed-in mobile/browser flows were not exercised in this environment. 31 existing tests need additional integration resources and remain skipped.
- Production error-log inspection covered the available recent 50-minute window; the hosting plan does not retain older logs.
- Legacy material records without a verified fire type or purchase price were not guessed or overwritten. In particular, Gangdong W879 usage has no saved purchase cost; it needs verified product/variant/cost input.
