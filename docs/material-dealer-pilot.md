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

## 수령 방식 테스트 (2026-10-17)
기존 설치 후 database/material_delivery_workflow.sql을 실행합니다. 실제 카드 청구와 운영 재고는 연결하지 않습니다.
- 기존 현장의 MaterialFilmPicker로 제품을 검색하고 판매 옵션에서 방염 구분을 선택합니다. 방염 미등록 제품은 주문 차단합니다.
- 직접 수령/주변 수령/퀵/화물/택배를 선택합니다. 퀵·화물은 운임 별도 본인 부담 동의가 필수입니다.
- 주문 접수 → 슈퍼관리자 공급처 배정 → 대리점 수락 → 정확한 준비 수량 확인 → 준비 완료 → 주문자 테스트 결제 → 출고 → 수령.
- 주변 수령처는 shipping.workflow.pickup의 장소 정보입니다. 공급·정산 주체를 새로 만들지 않습니다.
- 결제 전 수량/수령 방식/주소 변경은 준비 완료와 수령처 안내를 초기화하고 대리점 재확인을 요구합니다. 가격은 주문 시 단가를 유지합니다.
- 직접 수령은 대리점의 전달 버튼으로 완료됩니다. 나머지는 주문자가 출고 건별 수령을 확인합니다.
- 신규·배정·변경·준비·테스트 결제·발송·수령 이벤트 알림을 DB 트랜잭션에서 저장합니다. 기존 푸시 구독에 발송하고 주문 화면에 알림 내역도 제공합니다.
- 화면이 열려 있으면 15초마다 갱신합니다. 입력 중 주문 버전이 바뀌면 새 버전으로 갱신되고, 오래된 저장 요청은 서버에서 거절합니다.
- 현재 위치 GPS 자동 변환 대신 희망 지역/주소를 입력합니다.
- 실제 PG 결제/환불, 결제 대기 자동 만료, 운영 재고 입고와 대리점 실제 정산은 후속 단계입니다. 테스트 결제 버튼은 실제 카드 결제가 아닙니다.
