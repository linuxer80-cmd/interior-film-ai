# 구인·구직 dev 테스트

운영 main과 별도로 dev 브랜치에서 검증합니다.
DB 변경은 GitHub 커밋만으로 적용되지 않습니다.

## SQL 실행 순서

테스트 DB의 SQL Editor에서 순서대로 실행합니다.

1. database/labor_market.sql
2. database/site_daily_assignments.sql — 이미 적용했으면 생략
3. database/labor_market_workflow.sql

## 관리자 흐름

내 현장 상세 → 이 현장에서 구인하기 → 지역·작업 내용 검토
→ 선택 조건 입력 → 구인하기.

공란인 일당·나이·시공자 지역·경력·전문 분야는 공고에 표시하지 않습니다.
상세 주소는 공개하지 않습니다.

관리자 홈의 구인·구직 알림 → 지원자 프로필 → 구인하기 → 확인.

선택된 시공자를 동일 업체의 기존 시공자와 연결하거나 신규 등록합니다.
공고의 현장 작업 날짜에 팀원으로 배정합니다.

모집 인원이 차면 공고가 닫히고 나머지 지원자는 만료 처리됩니다.
인원이 차기 전에도 관리자가 모집을 마감할 수 있습니다.

기존 시공자의 계약 일당은 유지합니다.
신규 시공자는 제시 일당으로 등록합니다.
제시 일당이 공란이면 시공자의 희망 일당을 사용합니다.
채용 전 실제 지급 조건을 확인하세요.

## 시공자 흐름

내 프로필 → 기본 정보 저장 → 구직 공고 탭에서 공개
→ 구인 공고 검색 → 프로필·연락처 공유 동의 → 지원하기.

계좌·상세 주소는 구직 검색에 공개하지 않습니다.
채용된 신규 소속의 인건비·길찾기에만 연결합니다.

## 알림

알림은 DB에 먼저 저장합니다.
푸시는 기존 VAPID 환경변수와 브라우저 알림 허용·기기 등록이 필요합니다.

- NEXT_PUBLIC_VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY

푸시가 안 되는 경우에도 관리자·시공자 홈과
구인·구직 페이지의 알림함에서 확인할 수 있습니다.

## 정기 만료 처리

Vercel 프로젝트에 서버 전용 Secret CRON_SECRET을 등록합니다.

매일 한국시간 00:05 일정으로 모집 기간 만료 처리와
미발송 푸시 재시도를 실행합니다.
실제 실행은 호스팅 요금제의 실행 정확도에 따라 지연될 수 있습니다.

게시판 진입 시에도 만료 처리하므로
모집 기간이 지난 공고는 노출되지 않습니다.

Vercel Cron은 Production 배포에만 실행됩니다.
dev Preview에서는 게시판에 진입하거나
테스트 서버에서 인증된 maintenance 요청으로 검증하세요.

운영 DB와 동일한 Supabase를 사용하는 Preview는 데이터를 공유합니다.
테스트용 Supabase 프로젝트를 사용하는 것을 권장합니다.

## API 권한 테스트

node --test tests/labor-market.test.mjs

## SQL 통합 테스트

테스트 런타임에 @electric-sql/pglite@0.5.8을 설치합니다.

LABOR_PGLITE_PATH=/absolute/path/node_modules/@electric-sql/pglite/dist/index.js node --test tests/labor-workflow.test.mjs
