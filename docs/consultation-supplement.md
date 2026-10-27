# Additional consultation supplementation

The registration flow previously appended a memo only. Additional customer/address/amount inputs, materials and photos were not applied. Existing sites now use `/api/admin/site-consultation` and an atomic, server-only database function.

- Missing customer, address, region, contract and deposit fields are filled. A known zero amount is preserved. Existing differences are retained as confirmation notes and shown before saving.
- Work descriptions and types are appended without repeating identical text. Missing dates can be filled on consulting/scheduled sites, without changing the site's status. Existing dates are preserved.
- Quote items merge into both the seed and existing consultation quote. Saved quantities and prices are preserved; conflicting quantities become notes. AI extraction does not invent item prices.
- Planned materials use the existing canonical-product, explicit fire-type and duplicate-add guards. Stock movements and actual quantities are unchanged.
- Photo uploads use site-scoped content identities. Retrying after partial upload or a lost response resumes without duplicating the same file.
- Phone/address/name matching can select an existing site even when the follow-up does not repeat its full address. New-site registration still requires a name and address.
- Extracted contract/deposit amounts now reach the registration review. Existing user input is preserved and differences can be reviewed. Amounts in the supplement review show VAT separately.
- Historical memo UUID markers are simplified for display; stored markers are preserved for older clients' retry detection.

## Safety and verification

The API authenticates an active owner and checks the site company before any write. The database function checks the owner again, locks the site, verifies its revision and records a request fingerprint. A stale edit, invalid material or later statement failure rolls back the entire database operation. Anonymous/authenticated direct RPC access is revoked; only the server role may call it.

Regression tests cover phone-only follow-up UI, extracted amounts, partial photo failure/retry, duplicate materials, stable request IDs, confirmed-value preservation, quote decimal quantities, original quote prices, tenant/role denial, stale updates and transaction rollback. Full suite: 954 tests passed. Local production build passed. A production-schema probe ran under the server role inside a rolled-back transaction, using an empty patch; no site values or stock records were changed.

This changes future additional-consultation saves. Inputs discarded by the old memo-only flow cannot be reconstructed from an absent source; they can be supplied again to fill the missing fields.
