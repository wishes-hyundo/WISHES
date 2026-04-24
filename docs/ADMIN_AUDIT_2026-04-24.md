# /admin 전수 점검 보고서 (2026-04-24)

점검자: Chrome MCP + 코드베이스 분석
점검 대상: https://wishes.co.kr/admin/ 및 모든 하위 경로
로그인 계정: wishes@wishes.co.kr (superadmin)

---

## 페이지별 동작 현황

| 경로 | 로그인 후 동작 | 비고 |
|---|---|---|
| /admin | ✅ 정상 | 대시보드. 그러나 내부 통계 불일치 있음 |
| /admin/admin-auth.html | ✅ 정상 | 로그인 페이지. 풋터 색대비 문제 |
| /admin/listings | ❌ /login 튕김 | useAdminSession |
| /admin/listings/new | ❌ /login 튕김 | useAdminSession |
| /admin/listings/bulk-upload | ❌ /login 튕김 | useAdminSession |
| /admin/listings/[id]/edit | ❌ /login 튕김 | useAdminSession |
| /admin/dedup | ❌ /login 튕김 | useAdminSession |
| /admin/profile | ❌ /login 튕김 | useAdminSession |
| /admin/contacts | ❌ /login 튕김 | useAdminSession |
| /admin/users | ❌ /login 튕김 | 인라인 Supabase getSession |
| /admin/photo-enhancer | ✅ 정상 | layout auth 만 의존 (취약) |
| /admin/command-center-v2 | ✅ 정상 | V2 사용자 관리 페이지 |
| /admin/command-center.html | ✅ 정상 | V1 사용자 관리 (중복 기능) |
| /admin/search | ⚠️ 로드 but 한글 깨짐 | 폰트 서브셋 unloaded |
| /admin/geocode.html | ⚠️ 인증 UI 체크 없이 노출 | orphan 페이지 |

**요약**: 7개 React 페이지가 로그인 후에도 /login 으로 튕겨 실사용 불가.

---

## 🔴 Critical — 즉시 수정 필요

### C1. 세션 아키텍처 이중화 → 주요 React 페이지 로그인 불가

**증상**:
admin-auth.html 에서 로그인 성공 후 /admin 대시보드는 진입 가능하지만, 사이드바의 "중복 정리", "내 프로필" 및 /admin/listings/* 등 핵심 CRUD 페이지 모두 /login 으로 즉시 리다이렉트됨.

**근본 원인**:
두 가지 완전히 다른 세션 체크 체계가 혼재:
- `src/app/admin/layout.tsx` → `sessionStorage.ws_token` 만 체크 (통과)
- `src/lib/useAdminSession.ts` → `supabase.auth.getSession()` 만 체크 (실패)

`wishes-auth` (Supabase 세션 저장소) 의 `expires_at`이 **약 10일 전 만료됨**. autoRefresh 작동 안 함.
핸드오프 문서 #1 ("supabase-js client-side session persistence 안 먹힘") 과 정확히 일치.

admin-auth.html 에서 로그인 시 `localStorage.ws_token` 만 새로 쓰고 Supabase client 세션은 갱신 안 됨 → useAdminSession 이 getSession() null 받고 즉시 router.replace('/login?redirect=...')

**영향 범위** (useAdminSession 호출 파일 7개):
```
src/app/admin/listings/page.tsx
src/app/admin/listings/new/page.tsx
src/app/admin/listings/bulk-upload/page.tsx
src/app/admin/listings/[id]/edit/page.tsx
src/app/admin/dedup/page.tsx
src/app/admin/profile/page.tsx
src/app/admin/contacts/page.tsx
```
+ /admin/users (useAdminSession 대신 인라인으로 동일 패턴)

**해결 방향**:
1. useAdminSession 을 `localStorage.ws_token` + `/api/auth/refresh-session` 기반으로 통일
2. 또는 admin-auth.html 로그인 성공 시 Supabase client 에 `setSession({access_token, refresh_token})` 강제 주입 시도 (핸드오프에 따르면 이건 안 먹힘)
3. adminFetch 와 단일화 (adminFetch 만 쓰는 /admin, /admin/users, /admin/photo-enhancer 는 정상 동작함)

**중요**: 핸드오프 학습 #2 "adminFetch 401 → 즉시 로그아웃 패턴 절대 금지" 와 동일 맥락. useAdminSession 의 Supabase session null → 즉시 redirect 패턴이 바로 그 위반 사례.

---

## 🟠 High — 기능 손상

### H1. /admin/search 한글 폰트 깨짐

**증상**:
관리자용 매물 검색 페이지에서 한글이 "iëuœŸ", "ëuæÓuŒ", "ì€Áë" 등으로 깨져 UI 사용 불가 수준.
상단 헤더와 주소 일부는 정상 → 특정 문자 서브셋만 깨짐.

**근본 원인**:
body font-family: `GmarketSans, "Pretendard Variable", Pretendard, ...`
- `GmarketSans`는 **영문 전용** 폰트 (projectnoonnu 에서 woff 2개만 로드)
- 한글은 `Pretendard Variable` fallback 해야 하는데 대부분 서브셋이 **"unloaded"** 상태
- 일부 서브셋 로드 실패 → 시스템 폰트로 두번째 fallback → 일본어/중국어 글리프가 한글 code point 에 렌더되면서 깨짐

**해결 방향**:
1. Pretendard Variable 전체 서브셋 preload 또는 display: swap 정책 변경
2. /admin/search 페이지에 font-family override 추가
3. 한글 전용 웹폰트 (Pretendard 비서브셋 버전) 로 단일화

### H2. 대시보드 통계 1,447개 매물 누락

**증상**:
/admin 대시보드 상단 "거래유형 분포 (공개)" 위젯:
- 전세 0건 (0%)
- 월세 4,155건 (83%)
- 매매 845건 (17%)
- **합계: 5,000**

그런데 같은 페이지 하단 "관리자 대시보드" 위젯:
- 전세 695건
- 월세 4,900건
- 매매 845건
- **합계: 6,440** ✅ (DB totalListings 와 일치)

**핵심 문제**:
1. 전세 695건이 상단 위젯에서 **완전히 누락**
2. 월세 745건 누락
3. 같은 페이지 안에서 같은 데이터가 두 버전 공존
4. 5,000 이라는 숫자 → limit=5000 하드코딩 의심

**근본 원인 추정**:
상단 "오늘의 중개 브리핑" 섹션이 사용하는 API 가 `LIMIT 5000` 또는 페이지네이션 누락된 쿼리로 집계.
/api/admin/stats 는 정확 (totalListings=6,447 반환).

### H3. 사이드바에 /admin/listings 매물 관리 진입점 부재

**증상**:
layout.tsx line 202-208:
```ts
const navItems = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin?tab=contacts', label: '상담 관리' },
  { href: '/admin/dedup', label: '중복 정리' },
  { href: '/admin/profile', label: '내 프로필' },
];
```
매물 **목록/수정/삭제/대량작업** 진입점이 사이드바 어디에도 없음. "+스마트 매물 등록" 버튼이 /admin/listings/new 로 가지만, 이는 생성만 가능.

**실사용자 영향**:
매물 수정/삭제/상태변경이 필요할 때 사용자가 URL을 직접 입력하거나 Command Center 깊숙한 곳에서 찾아야 함.

---

## 🟡 Medium — UX / 데이터 정합성

### M1. "선결조건 3건 미해결" ↔ "fixed" 배지 모순
대시보드 상단 경고 박스 제목이 "미해결"인데 각 항목은 모두 `fixed` 배지 달림. 이미 해결된 개발 이슈가 사용자에게 경고로 계속 표시됨. 제목을 "최근 수정 사항" 등으로 교체하거나 X 버튼 누르면 영구 dismiss 되도록.

### M2. Command Center V1 ↔ V2 병존
- `/admin/command-center.html` (V1) — 사이드바 "Command Center" 버튼이 가는 곳
- `/admin/command-center-v2` (React, V2) — 별도 경로. "기존 v1" 버튼으로 V1 돌아갈 수 있음
- V1은 **휴대폰 번호 노출**, V2는 미노출 → 필드 일관성 부족
- 유지보수 시 두 버전을 모두 수정해야 함

### M3. /admin/photo-enhancer 인증 취약
이 페이지는 useAdminSession 을 안 쓰고 layout.tsx 의 sessionStorage 체크만 의존. admin_bridge_ 위조 토큰은 L-sec54 에서 차단되지만, superadmin/admin/agent 역할 구분 없음. agent 역할로도 사진 업로드 가능할 수 있음 (role 체크 로직이 UI 에 없음).

### M4. /admin/geocode.html orphan + 인증 UI 부재
- 사이드바 어디에도 진입점 없음
- 로그인 체크 없이 UI 노출 (버튼 클릭 전까지)
- 만일 API 레벨에서만 체크한다면 UX상 "시작" 눌렀을 때만 에러 나옴

### M5. 로그인 페이지 UX 혼동
- `wishes@wishes.co.kr` 은 기본 자동입력
- 비밀번호 필드에 브라우저 자동완성으로 dot 7개 표시 but 실제 value 길이는 0
- 사용자가 "이미 입력된 줄 알고" 로그인 버튼 누르면 "비밀번호를 입력하세요" 에러
- Chrome 기본 동작이지만 UX상 "다시 입력 필요" 힌트 필요

### M6. /admin/contacts URL 과 /admin?tab=contacts 중복
- 사이드바는 `/admin?tab=contacts` (대시보드 내 탭)
- 별도로 `src/app/admin/contacts/page.tsx` React 페이지 존재 (useAdminSession, /login 튕김)
- 두 구현 공존. URL 직접 접근 시 후자로 가서 튕김 — dead code 거나 미완성

### M7. 대시보드 통계 위젯 중복
대시보드 내에 "전체 매물" / "공개" / "계약중" / "계약완료" 통계가 **세 번 반복 표시됨**:
1. 중간 섹션 (6440, 6425, 0, 0, 0)
2. "관리자 대시보드" 헤더 아래 (6440, 6425, 0, 0)
3. 하단 차트들 위 (6440, 6425, 0, 0)
스크롤만 해도 같은 숫자가 세 번 나옴 → 정보 과잉.

### M8. 대시보드 "리드 파이프라인" / "방문 예약 관리" / "뉴스레터 구독자"
모두 수치 0. 기능이 실제 운영에서 사용되지 않는 것으로 보임. 대시보드에 공허한 위젯이 차지하는 공간이 큼. 숨김 옵션 또는 "이 기능 시작하기" CTA 필요.

---

## 🟢 Low — 마이너

### L1. 로그인 풋터 색대비 부족
"256-bit SSL Encrypted | WISHES © 2026" 텍스트가 검정 배경 × 극도로 어두운 회색. WCAG AA 미달.

### L2. localStorage 키 25개 이상
`ws_token`, `ws_refresh_token`, `ws_user`, `ws_login_time`, `ws_token_expires_at`, `ws_keep_login`, `ws_saved_email`, `ws_save_email_checked`, `wishes-auth`, `ws_csrf`, `ws_cookie_synced`, `ws_v7_scope`, `ws_changelog`, `ws_alert_log_unread_v1`, `ws_alert_log_v1`, `ws_rate_limit_lockout`, `ws_rate_limit_attempts`, `ws_data_snapshot`, `ws_price_snapshots`, `wishes_favorites`, `wishes_saved_searches`, `wishes_recently_viewed`, `wishes_compare`, `wishes_cookie_consent`, `ws-contacts`, `map2026.listPanel`, `map2026.accordion`
중복/레거시 정리 여지 있음.

### L3. expires_at 파싱 버그 가능성
`ws_token_expires_at: "1777017700"` (Unix seconds) 로 저장되어 있는데 핸드오프 "30일 로그인 유지" 로직이 이 값을 `new Date(string)` 로 파싱하면 NaN. keepLogin 기능 실효성 확인 필요.

### L4. 사용자 목록 "위시스" 이름 중복
Command Center V1/V2 모두에서 superadmin "위시스" 가 2명:
- `kakao_4861415260@users.wishes.co.kr`
- `wishes@wishes.co.kr`
동일 사람의 다른 계정인지, 실제 2명인지 구별 안 됨.

### L5. "스마트 매물 등록" 버튼 색상 일관성
사이드바 녹색 테마인데 주황/황색 그라데이션. "모바일 사진등록" 도 황색. 두 항목만 강조색 다름.

---

## 권장 조치 순서

1. **C1 먼저** — useAdminSession 을 localStorage 기반으로 통합 (7개 페이지가 즉시 살아남)
2. **H3** — 사이드바에 /admin/listings 진입점 추가 (간단한 수정, 즉시 효과)
3. **H1** — /admin/search 폰트 로드 전략 변경
4. **H2** — 대시보드 상단 위젯의 5000 limit 제거
5. **M1** — "선결조건 3건 미해결" 문구 교체 또는 dismissed 상태 저장
6. **M4** — /admin/geocode.html 에 auth wall 추가 또는 /admin/geocode React 페이지로 이동 + 사이드바 추가
7. **M2** — Command Center V1/V2 중 하나로 단일화 결정
8. **M3** — /admin/photo-enhancer 에 role 체크 (superadmin/admin 만 허용?)
9. **Medium 잔여** + **Low** — 별도 쓴 순서대로

**C1 해결이 다른 이슈 해결의 전제**: C1 수정해야 나머지 React 페이지들에 접근해서 각 페이지 내부 이슈도 점검 가능.

---

## 미점검 영역 (이번 라운드 스코프 밖)

- 모바일 해상도 admin 레이아웃
- admin API 엔드포인트 40+개 개별 동작 (POST/PATCH/DELETE 시나리오)
- /admin/listings/new 폼 검증, /admin/listings/bulk-upload CSV 파싱 (C1 해결 후 재점검 필요)
- /admin/contacts 실제 상담 등록 플로우
- 권한 체크: agent 계정으로 각 admin 페이지 접근 시 동작
- RBAC: admin_users.role (superadmin/admin/agent) 에 따른 기능 차등
- Audit log / 감사 기록
- Supabase RLS 정책 실제 보호 여부
- /api/admin/send-newsletter 대량 메일 안전장치
- /api/admin/mfa/* MFA 플로우 실동작

다음 세션에서 C1 수정 후 2차 점검 권장.
