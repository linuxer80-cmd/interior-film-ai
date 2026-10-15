# 필름장이 부트페이 알림톡 운영

## 현재 범위
- 관리자 `/admin/alimtalk`: 업체별 사용 설정, 업체 등록 휴대폰으로 실제 연결 확인 발송, 최근 50건 내역, 결과 재조회.
- 슈퍼관리자 `/super-admin/alimtalk`: 연결 상태 확인, 업체별 발송 건수 지급 및 지급 내역.
- 기존 `/api/send-push` 알림 웹훅에서 별도 after 작업으로 시공자 현장 배정·변경·취소·D-1/당일 알림을 발송한다.
- 앱 푸시와 별도로 처리하며 켜짐 + 업체 발송 건수 + 해당 승인 템플릿이 모두 있어야 발송한다. 과거 15분 초과 알림은 발송하지 않는다.
- 카드 충전 결제/판매단가/요금제 포함량은 아직 구현하지 않았다. 슈퍼관리자 지급은 결제 처리가 아니다.

## 부트페이에서 먼저 준비
1. 부트페이 프로젝트를 만들고 API 알림톡 선불 충전을 신청한다. 첫 충전과 잔액이 필요하다.
2. 필름장이 카카오 비즈니스 채널을 연동하고 발신프로필 sender_key를 확인한다.
3. 커머스 서버 인증용 client_key/secret_key를 발급한다. 카카오 앱 REST 키나 토스 결제 키가 아니다.
4. 아래 정보성 템플릿을 직접 등록·승인받는다. 자체 템플릿 코드를 설정한다. 공용 템플릿을 임의로 같은 코드로 쓰면 안 된다.
5. 알림톡 웹훅 전용 시크릿 원문을 발급받는다. 일반 주문·결제 웹훅과 다르다.
6. 여러 업체의 알림을 플랫폼이 발송하고 비용을 받는 운영 조건을 부트페이에 확인한다.

## 서버 환경변수 (모두 NEXT_PUBLIC_ 없이)
```
BOOTPAY_COMMERCE_CLIENT_KEY=
BOOTPAY_COMMERCE_SECRET_KEY=
BOOTPAY_ALIMTALK_SENDER_KEY=
BOOTPAY_ALIMTALK_WEBHOOK_SECRET=
BOOTPAY_ALIMTALK_TEMPLATE_ASSIGNMENT=
BOOTPAY_ALIMTALK_TEMPLATE_SCHEDULE=
BOOTPAY_ALIMTALK_TEMPLATE_CANCEL=
BOOTPAY_ALIMTALK_TEMPLATE_REMINDER=
BOOTPAY_ALIMTALK_TEMPLATE_TEST=
BOOTPAY_ALIMTALK_ENABLED=false
```
키와 승인 템플릿을 등록한 후 ENABLED=true로 배포한다. 업체별 사용 설정은 기본 false이며 건수 0이다.

웹훅 수신주소:
`https://interior-film-ai.vercel.app/api/bootpay/alimtalk-webhook`
발송 요청에 webhook_url을 넣으므로 해당 건의 결과는 이 주소로 수신한다. 서명은 프로젝트 알림톡 웹훅 시크릿을 쓴다. 전역 웹훅을 설정한다면 301/302/303을 구독한다.

## 템플릿 초안 (카카오 검수 필요)
고정 안내문: `[필름장이] 현장 배정 안내`, `[필름장이] 현장 변경 안내`, `[필름장이] 현장 취소 안내`, `[필름장이] 시공 일정 안내`를 유형별로 구분한다.
본문 예:
```
[필름장이] 현장 배정 안내
#{user_name}님, #{company_name}에서 현장 배정 내용을 안내드립니다.
현장: #{site_name}
안내: #{notification_message}
앱에서 상세 일정과 배정 내용을 확인해주세요.
```
연결 확인 템플릿 예:
```
[필름장이] 알림톡 연결 확인
#{company_name} #{user_name}님, 알림톡 연결 확인 요청이 접수되었습니다.
필름장이에서 현장 관련 안내를 확인하실 수 있습니다.
```
버튼을 넣는 경우 모바일/PC 웹 링크 변수 `#{detail_url}`을 사용한다(값에는 https:// 포함). 지원 변수: company_name,user_name,site_name,notification_title,notification_message,detail_url. 템플릿 required_variables와 정확히 일치시킬 것. 위 초안의 승인 여부는 부트페이/카카오 검수 결과에 따른다.

## 초기 검증 순서
- 슈퍼관리자에서 본인 업체에 소량 발송 건수를 지급한다. 지급 사유 필수. 부트페이 잔액과 별개의 앱 사용량이다.
- 해당 업체 관리자로 로그인하여 사용을 켠다.
- 업체 등록 연락처가 본인 번호인지 확인한 후 연결 확인 버튼을 누른다. 실제 발송/과금이 발생한다.
- requested는 전달 성공이 아니다. success 웹훅 또는 결과 조회를 확인한다.
- 실제 고객/시공자 발송 전 본인 테스트 현장으로 배정 알림을 검증한다.

## 정산과 재시도
- 계정 행 잠금 + 전달별 UUID 고유키로 1건 확보. 성공 시 확정, 확정 실패/취소 시 1회 복구.
- 같은 알림/같은 테스트 요청 UUID는 재발송하지 않는다. 부트페이도 ref_id로 중복을 막는다.
- 네트워크 단절/5xx/불명확 응답은 unknown으로 보류한다. 자동 재발송/복구하지 않는다.
- receipt_id가 있으면 화면의 결과 확인으로 재조회 가능. 접수번호가 없는 unknown/reserved는 부트페이 발송 내역의 ref_id로 조회하여 운영자가 대조한다. 기록이 없다는 이유만으로 즉시 재발송하지 않는다.
- 복구/성공 이후 늦은 응답은 기존 최종 상태를 덮어쓰지 않는다.
- 문자 대체 발송은 없다.
- RLS 활성화 및 anon/authenticated 테이블/함수 권한 철회. 모든 읽기/쓰기와 RPC는 인증된 서버 경로로만 처리한다.

## 문서
- https://commerce.bootpay.ai/alimtalk-ops/send/send/
- https://commerce.bootpay.ai/alimtalk-ops/webhook/setup/
- https://commerce.bootpay.ai/alimtalk-ops/history/detail/
- 실제 발송 endpoint는 상세 문서 기준 `https://message.bootapi.com/alimtalk/send`이다.
- 마케팅 페이지의 `api.bootapi.com/v1/...` 예제를 사용하지 않는다.

## 검증
`node --test tests/bootpay-alimtalk.test.mjs`
DB 트랜잭션에서 건수 부족/중복 지급/중복 예약/중복 환불/늦은 응답을 검증하고 rollback했다. 실제 메시지나 결제는 실행하지 않았다.
