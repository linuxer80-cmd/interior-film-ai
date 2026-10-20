# Google 로그인 운영 설정

## 코드에 추가된 경로

- `/login`: 관리자 Google 로그인
- `/worker/login`: 시공자 Google 로그인
- `/dealer`: 대리점 Google 로그인
- `/auth/google`: OAuth 복귀 및 기존 권한 확인
- `/account/google`: 로그인한 기존 계정에 Google 연결

일반 로그인은 Supabase `signInWithOAuth`를 사용합니다. 현재 앱의 브라우저 클라이언트가 OAuth 세션을 처리합니다. Google 계정 선택 화면을 표시하며 캘린더 권한이나 오프라인 접근을 요청하지 않습니다.

## 배포 전 외부 설정

1. 실제 운영 Supabase 프로젝트의 Authentication → Sign In / Providers → Google 화면에서 callback URL을 복사합니다. 다른 프로젝트의 주소를 사용하지 않습니다.
2. Google Cloud → Google Auth Platform에서 앱 이름, 지원 이메일, Audience, 기본 데이터 접근 범위를 설정합니다. 로그인 범위는 `openid`, `userinfo.email`, `userinfo.profile`입니다. 테스트 모드라면 사용할 Google 계정을 테스트 사용자로 추가합니다.
3. Clients에서 **Web application** OAuth 클라이언트를 만듭니다.
   - Authorized JavaScript origins: `https://interior-film-ai.vercel.app`
   - Authorized redirect URIs: 1번의 Supabase callback URL. 앱의 `/auth/google` 주소와 다릅니다.
4. 발급된 Client ID와 Client Secret을 해당 Supabase 프로젝트의 Google Provider에 입력하고 활성화합니다. Secret은 소스 코드나 `NEXT_PUBLIC_` 환경변수에 넣지 않습니다.
5. Supabase Authentication → URL Configuration의 Redirect URLs에 다음을 추가합니다. 기존 카카오·이메일 복귀 URL은 유지합니다.
   - `https://interior-film-ai.vercel.app/auth/google?role=owner`
   - `https://interior-film-ai.vercel.app/auth/google?role=worker`
   - `https://interior-film-ai.vercel.app/auth/google?role=dealer`
   - `https://interior-film-ai.vercel.app/auth/google?mode=link`
   - `https://interior-film-ai.vercel.app/auth/google?mode=link&role=dealer`
   로컬 또는 별도 미리보기에서 테스트할 때는 사용할 출처의 복귀 경로만 별도로 등록합니다.
6. Supabase의 **Allow manual linking**을 활성화해야 `/account/google`에서 다른 이메일의 Google 계정을 기존 계정에 연결할 수 있습니다. 기존 DB 권한·RLS 변경은 필요하지 않습니다.

## 기존 회원과 신규 회원

- 기존 이메일과 같은 검증된 이메일의 연결은 Supabase의 자동 identity linking 정책을 따릅니다.
- 다른 이메일이라면 기존 계정으로 먼저 로그인한 후 **구글 계정 연결**에서 Google 인증을 진행합니다. 연결 시작 사용자와 복귀 사용자가 같고, 15분 이내인 경우에만 앱에서 연결 완료로 표시합니다.
- 다른 회원에 이미 연결된 Google 계정을 앱에서 강제 병합하거나 업체 정보를 복사하지 않습니다.
- Google 로그인만으로 관리자·대리점 권한을 부여하거나 업체를 자동 생성하지 않습니다. 관리자 이동은 기존 `get_my_company` 결과로 확인합니다. 시공자 프로필과 대리점 승인도 기존 흐름을 따릅니다.
- 새 Google 계정으로 로그인해 기존 업체를 찾지 못한 경우 기존 이메일 로그인·계정 연결과 신규 업체 등록을 구분해 안내합니다.

## 운영 검증

외부 설정 후 기존 관리자, 시공자, 대리점 각각 로그인·로그아웃·재로그인을 확인합니다. 다른 이메일 Google 연결 시 연결 전후 사용자 UUID와 업체가 유지되는지 확인합니다. 인증 취소, 연결 중복, 미승인 대리점, 프로필 미완성 시공자도 확인합니다.

로컬 자동 검증: `node --test tests/google-login.test.mjs`, `npm run build`.
실제 Google 인증과 운영 DB 연결은 외부 설정 후 별도로 확인해야 합니다.

공식 문서:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/auth-identity-linking
- https://supabase.com/docs/guides/auth/redirect-urls
