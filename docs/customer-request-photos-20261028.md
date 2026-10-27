# Customer consultation request photos

Customers with a valid site portal link can send 1–10 photos and an optional note while the site is consulting. Camera and gallery controls share a single draft. Photos are resized before upload and displayed in the customer's sent history.

The server validates the capability token, active company, site status, request size and actual image contents. JPEG normalization strips EXIF/GPS metadata. Private `work-photos` objects become existing `site_photos` request records for that company and site; no public storage policy is added.

`customer_photo_submissions` records an immutable request fingerprint. Service-only, security-invoker RPCs reserve a request, then atomically complete its photo records, history and one company-admin notification. Interrupted uploads reuse the same paths; a lost response can be retried without duplicate records or notifications. Pending submissions expire after one day. Limits per site are 6 batches/minute, 100 photos/day and 500 photos overall, including pending reservations.

The existing notification push trigger delivers the admin app alert. Its destination is `/admin?tab=sites&site=<site-id>&section=photos`. The site modal opens the work/photos panel and scrolls to request photos, newest first. Notes appear in a collapsed customer-request section. Device push delivery requires an existing enabled subscription; the notification remains in the app's notification list.

## Validation

- Full `npm test`: 1,014 passed, zero failures.
- Production build: passed with placeholder public Supabase build configuration.
- PGlite executes the actual migration: atomic rollback, concurrent retry, expired/rotated token, inactive company, status changes, tenant/path boundaries, quotas and role grants.
- Server tests cover real image decoding, bounded multipart input, same-origin requests, interrupted storage/commit retry and scoped history URLs.
- React component tests cover draft retention and identical retries after a lost response, selection limits, removal and definitive errors.
- No real customer message or test admin push was sent during validation. Physical-device receipt is not exercised by the isolated tests.

Migration: `20261027221708_customer_portal_request_photos.sql`.
