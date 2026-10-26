# Duplicate planned materials and missing-looking stock

The site-detail material add flow used a fresh UUID on every add. Selecting the same
catalog film and fire type twice created two independent rows. Stock trips remained
attached to only one row, so the other card incorrectly looked like a missing issue.

`add_planned_material_once` serializes additions with a site row lock and returns an
existing active planned material when product, fire type, unit and work memo match.
Catalog IDs permit canonical/display code aliases to match; unlinked legacy rows
require exact normalized brand/code (or name when there is no code). Different fire
types, units and work memos remain distinct. Archived and actual-use rows are excluded.
An existing material's prices, quantities and movement links are never overwritten by
a repeated add. With legacy duplicates, an issued row is preferred.

The API still authenticates the owner, checks company/site access, resolves the
catalog and selects the appropriate dealer price before calling the service-only,
security-invoker RPC. The RPC rechecks owner/company/site access. PATCH and initial
site registration keep their existing paths; this change covers the manual add flow.

For the reported S245 non-fire case, the 2026-10-26 18:29 KST issue of 20.1m was present.
Only the identical zero-activity duplicate was archived, with an audit entry. The
issued row, stock trips, quantities, return state and reports were checked unchanged.
No stock movement was recreated. The actual API enrichment function was verified
against the resulting database snapshot: one active S245 card and one linked trip,
20.1m issued, return amount still unentered.

Validation: 931 tests passed, production build passed, live duplicate-reuse probe
rolled back without modifying existing rows. New RPC privileges and tenant/role/input
checks are covered. Authenticated mobile interaction has not been exercised here.
