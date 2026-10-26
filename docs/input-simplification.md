# Input simplification — 2026-10-27 KST

## Implemented

- Shortened instructions in site registration, material selection and editing, work reports, quotes and customer notices. Retained missing-cost, privacy, quota, validation and destructive-action information.
- Screenshot analysis shows a compact summary. Correction fields remain in an expandable section and open automatically on invalid dates/amounts. The registration wizard uses its existing Next action to apply the review, so a second Apply button is unnecessary. Standalone use retains its Apply button.
- Linked business contact information is displayed once rather than offered in editable fields that submission would overwrite from the client directory. Switching customer type without selecting a client preserves entered information.
- Product selection retains automatic brand/name values; manual product fields remain available under an expandable editor. Fire type, quantity and required controls remain accessible.
- Reapplying an identical material extraction retains the existing row and its price/type edits. Different notes, units and explicitly different variants remain distinct.
- Kept navigation, calendars, existing data, API authorization and settlement calculations.

## Verification

- 927 automated tests passed; none failed or skipped.
- Production webpack build passed using explicit non-secret placeholder Supabase settings for local prerendering. Deployment uses the project's configured production settings.
- Regression tests cover retained customer information, refreshed business contact details, repeat extraction, distinct variants, screenshot application and reopening invalid review fields.
- Browser interaction was attempted in an isolated local fixture but could not run: the environment lacks the Playwright browser executable and its development server cannot read network interfaces. No authenticated mobile or production write was used for UI verification.

## Follow-up proposals (not implemented)

1. Select an address once and fill its region automatically, keeping unit/apartment details editable.
2. Reuse recent/favorite materials with an explicit saved fire variant; retrieve the current purchase price rather than copying an old price blindly.
3. Edit only missing items from a site's review list, with a direct save per item, instead of reopening the entire form.
