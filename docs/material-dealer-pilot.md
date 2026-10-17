# Material dealer pilot

This is an isolated workflow pilot connected to the existing material mall. It does not charge cards, dispatch real shipments, or mutate production film_stock_rolls. Received shipment rolls are the test inbound ledger. Keep the existing real material-order POST disabled.

## Setup

Run database/material_dealer_pilot.sql manually in Supabase. Expected enabled company count is 1. The seed uses the verified existing linuxer80@gmail.com owner profile, not a mutable company name. Other companies cannot create or read pilot orders. Existing users whose company is not allowlisted remain blocked even with the direct URL.

- Buyer: /admin/material-order → products/cart/address → Test order → Order history.
- Platform: /super-admin/material-orders → Dealer pilot → approve dealer registration and assign orders with supply prices.
- Dealer: /dealer → sign up and verify email (or use existing account) → request dealer access → wait for super admin approval → accept assigned order → enter actual roll lengths and tracking.
- Buyer: confirm each shipment in Order history. Receipt creates a test inbound record per shipment roll, not production stock.

Buyer requests are company orders. Worker personal purchasing remains closed in this company-only pilot. Dealer signups never grant owner or super-admin privileges. Dealer access is stored in a separate approved membership. Supabase Auth must allow the /dealer confirmation redirect URL for new email registrations; existing confirmed accounts can log in directly.

## Current scope

One supplier per order, multiple partial shipments, immutable sale price snapshots, platform-only supply prices, pre-shipment cancellation, optimistic revision checks, request idempotency, and per-shipment receipt. Supply prices are per-metre, VAT-exclusive. Updates are manual refresh. Fees, live payment, push notifications, multi-supplier split, supplier payout, returns and production inventory integration are deliberately not enabled in the pilot. Do not present it as a live shop.

## Verification

Node tests cover quantities, price validation, role boundaries, partial/final receipt, over-shipping, cancellation, data projection, allowlist restrictions, foreign order denial and origin checks. SQL validated in isolated PGlite: repeated setup, seed, event+update atomicity, retry idempotence, version conflict, reused request rejection, public/authenticated table and RPC access denied. Production database changes are user-executed.
