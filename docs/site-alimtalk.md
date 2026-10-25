# 현장 알림톡

- 관리자: 현장 상세 → 기본정보 → 고객 알림톡 보내기. 저장된 고객 정보로 미리보기를 조회한 뒤 명시적으로 발송한다.
- 슈퍼관리자: `/super-admin/alimtalk`. 실제 입금/승인된 지급을 확인한 뒤 기존 횟수제 계정에 충전하고 사용을 켠다. 이 화면은 결제를 수행하지 않는다. 원화 단가를 임의로 정하지 않는다.
- 시공자: 날짜별 배정 저장 성공 후 새로 추가된 시공자에게 배정일 전체를 안내한다. 역할 변경/배정 해제는 기존 앱 알림을 유지한다. 동일 내용 재저장으로 재발송/차감하지 않는다.
- 환경변수: `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_KAKAO_PF_ID`, `SOLAPI_TEMPLATE_SITE_ASSIGNED`, `SOLAPI_TEMPLATE_CUSTOMER_SCHEDULE` (서버 전용). API 키/시크릿은 Secret 권장. 정산 cron은 기존 `CRON_SECRET` 사용.
- 솔라피 승인 템플릿의 본문이 앱의 미리보기와 일치할 때만 보낸다. 템플릿이 승인 전이면 발송·차감하지 않는다. 변수는 등록된 한국어 키(`#{고객명}` 등)를 그대로 전달한다. 문자 대체발송은 항상 끈다.
- DB 마이그레이션: `supabase/migrations/20261025015339_site_alimtalk_solapi.sql`. 기존 `alimtalk_accounts`, `alimtalk_credit_entries`, `alimtalk_deliveries`를 보존하고 현장 참조/서비스 전용 예약 함수를 추가한다. 모든 테이블은 RLS 및 클라이언트 접근 금지. 공개 실행 권한 없음.
- 예약 시 업체 계정을 잠그고 1회 차감한다. 중복 요청/다른 업체/잔액 부족/미확정 기존 발송은 거절한다. 최종 성공이면 확정 차감, 최종 실패면 1회만 복구한다.
- 발송 API가 `2000`으로 응답해도 "발송 요청됨"이며 수신 성공이 아니다. `/api/alimtalk/reconcile`이 매일 한국시간 오전 9시 30분에 최종 `COMPLETE/4000` 성공 또는 실패를 확인한다(Vercel Hobby의 일일 예약 제한). 현장/운영 화면 새로고침으로 즉시 갱신할 수도 있다.
- 타임아웃/불명확 응답은 `unknown` 또는 `reserved`로 유지하고 자동 재전송/환불하지 않는다. 메시지 ID를 잃은 경우 슈퍼관리자 화면에서 솔라피 메시지 ID를 입력해 `customFields.deliveryId`가 일치하는 결과만 연결한다.
- 대규모 배정의 실행시간 제한 때문에 한 저장 요청에서 시공자 알림톡은 최대 10명까지 처리한다. 나머지는 기존 앱 알림을 유지하고 관리자에게 알림톡 미발송 안내를 기록한다. 별도 대량 발송 큐는 포함하지 않는다.
- 실제 발송 검증은 템플릿 승인, 업체 사용 설정, 충전 후 지정한 테스트 번호로 수행해야 한다. 자동 테스트는 가짜 번호/모의 솔라피와 격리 DB를 사용한다.

검증: `node --test tests/site-alimtalk*.test.mjs`; `npm run build`.
공식 문서: https://solapi.com/developers/api/messages-ata , https://solapi.com/developers/api/messages , https://solapi.com/developers/api/msg-getList , https://solapi.com/developers/api/authentication-api-key
