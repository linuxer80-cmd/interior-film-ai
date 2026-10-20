# Google Calendar 자동 연결

내 현장 상단 / `/account/calendar`의 **동의하고 자동 연결하기**에서 서버용 오프라인 권한을 한 번 연결합니다. 기존 수동 전송의 브라우저 토큰으로는 앱 종료 후 자동 실행할 수 없으므로 기존 사용자도 이 연결이 한 번 필요합니다. 앱 로그인 방식(이메일·카카오·구글)과는 별개이며 기존 앱 계정을 바꾸지 않습니다.

## 결과

- 서울 날짜 기준 오늘부터 90일의 내 배정 현장을 선택한 Google 계정의 기본 캘린더에 종일 일정으로 반영합니다. 현장명·전체 주소/동호수·시공 내용·사용 필름/방염 구분·현장/자재 메모·날짜별 배정 역할·현장 링크를 보냅니다. 금액/고객 전화 필드는 자동으로 넣지 않습니다. 공유 캘린더의 공유 대상에게도 요약이 보일 수 있음을 연결 전에 안내합니다.
- 약 5분마다 서버 예약 작업이 배정·내용 변경을 확인합니다. 앱을 열어 둘 필요가 없습니다. 사용자 수/외부 API 지연에 따라 다음 실행으로 넘어갈 수 있습니다. 즉시성이 보장되는 푸시나 Google → 앱 양방향 배정 변경은 아닙니다.
- 현장/사용자/배정 날짜의 기존 안정적인 event ID를 그대로 사용해 기존 수동 전송과도 중복을 피합니다. 동일 내용은 건너뛰고 변경은 ETag 조건부 PATCH합니다. 취소·배정 제외·날짜 변경은 향후 앱 일정만 삭제합니다. 이미 지난 일정은 보존합니다. 취소된 날짜의 재배정은 앱 표식/서버 기록을 확인하여 복원합니다.
- 자동 작업은 앱/사용자 private 표식으로 필터링한 Google 일정만 조회하고 수정합니다. 개인 일정과 다른 앱 사용자의 일정을 수정하거나 DB에 저장하지 않습니다. 수동 조회 기능은 필요할 때 별도로 열어 사용합니다.
- 활성 시공자 멤버십·업체·현장·날짜 배정을 매번 서버에서 재조회합니다. 관리자도 본인 시공자 배정만 보냅니다. DB 조회/Google 목록 중 일부라도 실패하면 부분 목록을 근거로 일괄 삭제하지 않습니다.
- 연결 해제는 서버 토큰을 삭제하고 후속 작업을 중단합니다. 처리 중이던 외부 요청 하나는 이미 완료될 수 있으며 이미 보낸 일정은 유지됩니다. Google 권한 자체 철회는 Google 계정의 연결 관리에서도 할 수 있습니다.

## 운영 설정 — 이 설정 전에는 자동 실행되지 않음

1. **실제 앱 Supabase 프로젝트** `gxtvvzysuhexhpljpswj` SQL editor에서 `database/google_calendar_auto.sql`을 실행합니다. 마지막 확인 쿼리가 3개 테이블 모두 `rls=true`, `anon_select=false`, `authenticated_select=false`여야 합니다. 이 코드 작업에서는 운영 DB에 SQL을 대신 실행하지 않았습니다.
2. 기존 Google Cloud **Web application** OAuth 클라이언트의 승인된 리디렉션 URI에 다음 URI를 **추가**합니다. Supabase 로그인용 callback은 유지합니다.
   ```text
   https://interior-film-ai.vercel.app/api/calendar/auto/callback
   ```
   Calendar API와 기존 `https://www.googleapis.com/auth/calendar.events.owned` 범위를 유지합니다. 자동 연결은 Authorization Code + PKCE + offline access 방식입니다.
3. Vercel Production 환경 변수 설정 후 재배포합니다.

   | 이름 | 값 | 유형 |
   | --- | --- | --- |
   | `GOOGLE_CLIENT_ID` | 기존 Web application Client ID 전체 | 일반 텍스트(서버용) |
   | `GOOGLE_CLIENT_SECRET` | 해당 Client Secret | 비밀 |
   | `CALENDAR_TOKEN_ENCRYPTION_KEY` | 별도로 생성한 32바이트 랜덤 키의 64자리 hex | 비밀 |
   | `CRON_SECRET` | 기존 예약 작업과 동일한 서버 비밀 값, 없으면 새 랜덤 값 | 비밀 |

   기존 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `SUPABASE_SERVICE_ROLE_KEY`, Supabase URL 설정을 유지합니다. Secret/암호화 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 암호화 키 예시 생성 명령은 `openssl rand -hex 32`입니다. 키를 바꾸면 기존 연결은 재동의해야 합니다. 비밀 값을 채팅·저장소에 넣지 않습니다.
4. Supabase Database → Extensions에서 **pg_cron**, **pg_net**을 활성화합니다. Vault → Secrets에 `calendar_auto_cron_secret`을 만들고 Vercel **CRON_SECRET과 같은 값**을 넣습니다. 이어서 `database/google_calendar_auto_cron.sql`을 실행합니다. 이름이 같은 작업은 갱신됩니다. Vercel Hobby의 하루 1회 Cron 제한으로 배포가 실패하지 않도록 `vercel.json`은 바꾸지 않았습니다. Pro라면 별도 Vercel Cron으로 같은 endpoint를 호출해도 되지만 두 스케줄러를 동시에 설정할 필요는 없습니다.
5. 내 현장에서 자동 연결 동의 후 **지금 반영 확인**을 눌러 최초 결과를 확인합니다. 앱을 닫고 현장 요약/배정을 바꾼 후 다음 예약 실행에서 Google 일정이 수정되는지 확인합니다. 같은 내용 재실행 시 중복이 없어야 하며 취소·배정 제외 시 향후 앱 일정만 지워져야 합니다.
6. 예약 실행 결과는 Cron History뿐 아니라 `net._http_response`의 HTTP 200/응답 본문, 연결 테이블 `last_sync_at`과 `last_error`를 함께 확인합니다. 예약 큐 등록 성공만으로 실제 동기화 성공으로 판단하지 않습니다. 한 호출은 최대 10명의 대기 사용자를 순차 처리하며, 시간 제한 내 나머지는 다음 실행에서 처리합니다. 부하가 늘면 처리량/예약 주기를 조정해야 합니다.

Google OAuth 앱이 **Testing** 상태에서 캘린더 권한을 요청하면 refresh token은 일반적으로 7일 후 만료됩니다. 앱은 재연결 상태를 표시하고 자동 재시도를 멈춥니다. 실제 상시 서비스에는 Google의 게시/민감 범위 검증 조건을 완료해야 하며, 사용자 권한 철회 등으로 운영 상태에서도 재연결이 필요할 수 있습니다.

## 보안과 재시도

- 앱 bearer 인증 후 연결 시작, HTTPOnly/Secure/SameSite 쿠키와 해시 state, 10분 만료, PKCE, 원래 앱 사용자+동일 브라우저로만 일회용 인증 코드 교환. callback은 고정된 운영 URI이며 사용자 입력 redirect/Host를 사용하지 않습니다.
- refresh token과 임시 인증 코드는 AES-256-GCM 및 사용자/용도 AAD로 암호화합니다. access token은 서버 실행 메모리에만 보관합니다. DB 3개 테이블/claim RPC는 service_role만 접근합니다. public schema RLS 활성화, anon/authenticated 테이블·함수 권한 철회, SECURITY INVOKER 사용.
- 원자적인 SKIP LOCKED claim과 사용자별 lease로 중복 실행을 방지합니다. 각 쓰기 전에 연결 generation/lease/해제를 확인합니다. 만료·철회는 재연결 필요로 전환하고, 일시 실패는 다음 실행에서 같은 event ID로 재시도합니다. 일부 Google 쓰기 후 실패해도 다음 실행이 이어서 수렴합니다.
- 일정 소유권 private 표식 + ETag로 변경/삭제를 제한합니다. 서버 기록은 앱이 만든 이벤트 식별자와 날짜만 보관하며 개인정보 본문은 보관하지 않습니다.

## 로컬 검증

```sh
node --test tests/calendar-auto*.test.mjs tests/calendar-export-ui.test.mjs tests/google-calendar.test.mjs tests/google-login.test.mjs tests/worker-sites.test.mjs tests/worker-calendar.test.mjs tests/multi-company-access.test.mjs
npm run build
```

인증/암호화/중복/복원/안전한 삭제/부분 실패는 API 모형으로 검증합니다. 실제 OAuth, 운영 SQL/RLS·동시 lease, 예약 HTTP 호출, 앱을 닫은 뒤 반영은 위 운영 설정 후 별도 확인해야 합니다.

공식 문서:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/
- https://developers.google.com/workspace/calendar/api/v3/reference/events
- https://supabase.com/docs/guides/functions/schedule-functions
- https://vercel.com/docs/cron-jobs/usage-and-pricing
