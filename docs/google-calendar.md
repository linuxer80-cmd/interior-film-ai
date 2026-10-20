# Google Calendar 연결 (수동 반영 첫 버전)

경로: `/account/calendar`. 관리자 더보기와 시공자 개인설정에서 열 수 있습니다.

## 동작

- 이메일·카카오·구글 등 앱 로그인 방식과 독립적으로 Google 계정을 선택합니다. Supabase 로그인 계정을 바꾸거나 identity를 연결하지 않습니다.
- Google Identity Services token client를 사용합니다. 짧은 수명의 Google access token은 열린 화면의 메모리에만 보관하며 서버, DB, localStorage, sessionStorage에 저장하지 않습니다. 페이지 종료·앱 계정 전환·만료 시 재연결해야 합니다.
- 선택한 Google 계정의 **기본 캘린더**만 읽고 씁니다. 보조·공유 캘린더 목록은 지원하지 않습니다.
- 기간은 서울 날짜 기준 최대 31일입니다. 캘린더의 개인정보는 이 화면에서만 표시되며 서버에 업로드하거나 업체/팀원에게 공유하지 않습니다.
- 서버에서 인증·인가한 기존 `/api/worker/my-sites`의 내 배정 현장만 전송 후보가 됩니다. 관리자는 본인 시공자 배정이 있는 현장만 포함합니다.
- 날짜별 종일 일정으로 현장명, 전체 주소와 동호수, 업체명, 작업내용, 배정 역할, 현장 링크를 보냅니다. 연락처·단가·수익은 넣지 않습니다. Google 캘린더를 공유 중이면 보낸 내용이 공유 대상에게 보일 수 있음을 안내합니다.
- 보내기 버튼 전에 목록과 대상 캘린더를 보여줍니다. 클릭 시 배정을 다시 읽고 미리보기와 다르면 중단합니다.
- 앱 사용자/현장/날짜의 SHA-256으로 Google event ID를 지정하여 재시도 시 중복을 방지합니다. 기존 이벤트의 private source/user 표식을 확인하고 ETag로 PATCH합니다. 실패 시 완료 건수와 재시도 안내를 표시합니다.
- 취소·배정 제외·날짜 변경으로 빠진 과거 앱 일정은 선택 기간 내에서 별도 체크 후 삭제합니다. 개인 일정이나 다른 앱 사용자의 일정은 수정·삭제하지 않습니다. 미리보기 이후 변경된 삭제 대상은 ETag로 보호합니다.
- **자동 백그라운드 동기화, 앱에서의 개인 일정 수정, 역방향 현장 배정 변경, 배정 충돌 자동 판정은 아직 포함하지 않습니다.** 이 버전은 사용자가 목록을 확인한 뒤 불러오기·보내기 버튼으로 반영합니다.

## 운영 설정

1. 기존 Google 로그인과 같은 Google Cloud 프로젝트에서 **Google Calendar API**를 활성화합니다.
2. Google Auth Platform → Data Access에 `https://www.googleapis.com/auth/calendar.events.owned` 범위를 추가합니다. 소유한 캘린더의 이벤트 읽기/쓰기 권한이며 앱은 기본 캘린더에만 요청합니다. 앱이 생성한 이벤트만 쓰는 scope는 기존 개인 일정 읽기에 충분하지 않습니다.
3. 기존 **Web application** OAuth Client의 Authorized JavaScript origins에 `https://interior-film-ai.vercel.app`이 있어야 합니다. 로그인용 Supabase callback URI는 유지합니다. 이 기능은 Google의 팝업 token flow이므로 별도 redirect URI를 추가하지 않습니다.
4. Vercel 프로젝트 → Settings → Environment Variables에 **`NEXT_PUBLIC_GOOGLE_CLIENT_ID`**를 추가합니다. 값은 기존 Google OAuth **Client ID 전체**(`...apps.googleusercontent.com`)입니다. Production에 적용하고 재배포합니다. Client ID는 공개 식별자입니다. **Client Secret을 이 변수에 넣지 않습니다.** 캘린더 연결에는 Client Secret을 사용하지 않습니다.
5. 테스트 모드에서는 사용할 Google 이메일을 Google Auth Platform → Audience → Test users에 등록합니다. 일반 회원에게 공개하기 전에 해당 scope에 대한 Google 검증·게시 조건을 확인합니다.
6. 기존 앱 계정으로 `/account/calendar`를 열고 Google 접근에 동의합니다. 대상 캘린더와 전송 후보의 날짜/주소를 확인하고 보내기를 눌러 실제 Google Calendar에서 결과를 확인합니다.

## 검증 및 남은 운영 확인

자동 테스트: `node --test tests/google-calendar.test.mjs tests/google-login.test.mjs`.
빌드: `npm run build`.
테스트는 Google API 모형으로 날짜·할당·안전한 정리·페이지 순회·중복 방지·ETag·에러를 검증합니다. 실제 Google 동의, 팝업/PWA 호환성, 운영 계정에서의 생성/수정/삭제는 위 설정 후 별도 확인이 필요합니다.

## 공식 문서

- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
