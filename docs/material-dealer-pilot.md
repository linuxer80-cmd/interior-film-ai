# Material dealer pilot

## 드림아트·영림 테스트 및 대리점 상세정보 (2026-10-19)

- 기존 기본 SQL·수령 방식 SQL·대리점 삭제 SQL 적용 후 `database/material_dealer_profiles.sql`을 실행합니다. 연결된 Filmpro 프로젝트에는 기존 앱 테이블이 없어 이번 작업에서 운영 DB에 적용하지 않았습니다.
- 슈퍼관리자 → 대리점 테스트 관리에서 **드림아트 테스트 대리점 만들기** → 영림 출고처 선택 → **영림 판매 가능 상품 노출** 순서로 진행합니다. 이 버튼은 등록 단가가 양수이며 기존 재고 상태가 in_stock이고 방염 구분이 있는 영림 상품만 노출합니다. 가격이나 실제 재고를 생성하지 않습니다. 노출 건수가 0이면 자재 판매관리에서 등록 가격·방염 구분·재고 상태를 확인합니다.
- 브랜드 연결은 주문 접수 시 상품에 출고 대리점 ID·이름·테스트 여부를 기록합니다. 배정은 이 ID만 허용하고 공급단가는 기존 배정 화면에서 입력합니다. 브랜드 연결을 바꿔도 과거 주문은 바뀌지 않습니다.
- 테스트 대리점은 Auth 계정을 만들지 않습니다. 실제 발주 수락·준비·출고는 실제 `/dealer` 가입 계정을 승인·연결한 후 테스트합니다. 실제 드림아트 가입 후 영림 출고처를 실제 대리점 ID로 변경하고, 기존 미완료 테스트 주문을 취소한 뒤 테스트 대리점을 중지·삭제합니다. 삭제는 기존 주문 참조를 보존하는 목록 삭제입니다.
- 실제 대리점 등록 필수: 대리점명, 대표자, 사업자등록번호, 대표 전화, 사업장 주소. 선택: 우편번호·상세주소·출고 담당자/전화·업무 이메일·업태·종목. 사업자번호는 형식과 체크숫자만 검사하며 국세청 사업자 진위 확인을 의미하지 않습니다.
- 사업자·연락처 상세정보는 본인과 슈퍼관리자에게만 반환합니다. 구매자에게는 주문에 기록된 출고처 이름만 보이며, 상세정보를 상품 공개 API에 추가하지 않습니다.
- 직접 수령의 준비 완료 화면에서는 등록된 대리점 주소·출고 연락처를 불러올 수 있습니다. 주변 수령은 별도 장소이므로 자동 대입하지 않습니다. 출고처가 지정된 영림 상품과 미지정 타 브랜드 상품은 주문을 분리합니다.
- 실제 결제, 대리점 정산, 운영 재고 자동 차감은 기존 파일럿 범위와 동일하게 연결하지 않습니다.

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

## 테스트 대리점 · 부가세 별도
- /super-admin/login에서 로그인하고 자재 주문 → 대리점 연동 테스트로 이동합니다.
- database/material_dealer_profiles.sql 적용 후 ‘테스트 대리점 만들기’를 누릅니다. 실제 사업자정보와 로그인 계정은 생성하지 않습니다.
- 테스트 대리점은 영림·현대보닥을 취급하며 단가는 부가세 별도입니다. 브랜드별 출고처 연결 및 판매 가능 상품 노출 버튼을 각각 적용합니다.
- 상품 노출은 기존 재고 있음·양수 판매단가·방염 구분 등록 상품만 대상으로 합니다. 단가를 공급가액으로 적용하고 부가세 10%를 합산합니다. 예: 6,500원/m × 10m = 공급가 65,000원 + 부가세 6,500원 = 총 71,500원.
- 기존 주문의 가격 스냅샷은 변경하지 않습니다. 실제 PG 청구는 아직 연결하지 않습니다.
- 기존 드림아트 테스트 대리점은 중지 후 삭제합니다. 기존 주문·로그인 계정은 보존되고 진행 중 주문이 있으면 삭제를 차단합니다.
