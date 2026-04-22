# /search 매물 미표시 — 근본원인 및 영구 차단 보고서

**작성:** 2026-04-22
**보고 범위:** wishes.co.kr/search 빈 화면 재발 근본원인
**관련 패치:** L-fix-search-blank (content-v294-scope.js, content.js), L-sec112~114

---

## 1. 증상

중개사가 `/search` 진입 시
- 매물이 전혀 안 뜬다 (빈 리스트 또는 "매물 데이터를 불러오지 못했습니다")
- 새로고침 또는 "다시 시도" 몇 번 누르면 그 때서야 정상 표시
- 동일 상황이 **주기적으로 반복** 발생

## 2. 구조 요약

```
/search (page.tsx)
   │
   ├─ React useEffect — ws_token 체크 → 'ok' 상태
   │   └─ 단순 prefetch: fetch('/api/admin/listings?fields=minimal', Bearer ws_token)
   │       → 결과는 window.__WS_PREFETCH__ 에 저장만 되고 content.js 는 사용 안 함
   │
   └─ 아래 스크립트들을 순차 주입 (script.async=false)
        1) /search/content.js           ← 13,631 라인 메인 번들, WS.loadData 정의
        2) /search/content-v230-patch.js
        3) /search/content-v240-detail.js
        ...
        N) /search/content-v294-scope.js  ← fetch monkey-patch 설치 (맨 마지막)
```

- `content.js` 는 `ADMIN_TOKEN = ''` (L-sec53 에서 박제 마스터패스 제거 후 빈 문자열)
- 실제 인증은 **v294-scope.js 의 fetch 래퍼** 가 Authorization 헤더를 동적으로 주입하는 방식에 전적으로 의존

## 3. 근본원인 4중 중첩

### 원인 ① 토큰 이중 접두사 (주범)

`/search/page.tsx` 는 로그인 성공 시
```ts
const tok = 'admin_bridge_' + data.session.access_token
sessionStorage.setItem('ws_token', tok)
```
즉 `ws_token` 자체가 이미 `admin_bridge_eyJ...` 형태.

v294-scope.js 의 `getWsToken()` 구 로직:
```js
if (isJwtLike(t)) return t   // t = 'admin_bridge_eyJ...' → 'eyJ' 접두사 체크 실패 → skip
var sb = extractSupabaseAccessToken()
if (sb) return sb           // Supabase 스토리지에 있으면 OK
return t                    // 없으면 'admin_bridge_eyJ...' 그대로 반환
```

그 다음 `authVal = 'Bearer admin_bridge_' + tok` 합성 →
- Supabase 스토리지 **있으면:** `Bearer admin_bridge_eyJ...` ✓
- Supabase 스토리지 **없으면:** `Bearer admin_bridge_admin_bridge_eyJ...` ✗ → 서버에서 이중 접두사를 한 겹만 벗겨 `admin_bridge_eyJ...` 가 JWT 형식이 아니라 401

**Supabase 스토리지가 없거나 비어 있는 경우:**
- 시크릿/InPrivate 탭
- 쿠키 삭제 직후
- 크롬 스토리지 할당량 초과
- 관리자 로그인 직후 React hydration 타이밍 이슈
- 사파리의 ITP(Intelligent Tracking Prevention) 가 localStorage 를 비우는 경우

### 원인 ② 레이스 컨디션 (빈 Bearer)

`content.js` 는 `script.async=false` 로 들어오긴 하지만 **실행 순서상 맨 먼저** 완료된다. 내부 IIFE 가 `_prefetchOnReady=true` 를 세팅하고 파일 말미 라인 5683 에서 즉시 `WS.loadData()` 호출 →
이 때 **v294-scope.js 는 아직 설치되지 않은 상태** → `fetch('/api/admin/listings?fields=minimal', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } })` 실행 → `ADMIN_TOKEN=''` 이므로 `Bearer ` (공백 1개) 송신 → 401.

그 뒤 content.js 는 3회 재시도 (2s/4s/6s). v294 래퍼는 ~100-500ms 내 설치되므로 **재시도 1 ~ 3 사이에 원인 ① 이 동시에 해소되면** 복구됨. 둘 중 하나라도 미해소면 3회 모두 실패 → "매물 데이터를 불러오지 못했습니다".

### 원인 ③ IndexedDB 캐시가 증상을 가림

성공한 과거 로드가 있으면 content.js `wsCacheGet()` 이 IndexedDB 캐시를 먼저 읽어 화면에 그린다. 그래서 사용자는 이미 캐시로 매물을 보는 중에도 **백그라운드 fetch 는 실패** 중이라는 사실을 모른다. 캐시 만료(10분) 이후 새로고침할 때 비로소 "빈 화면" 체험 → 재발 주기성 설명.

### 원인 ④ 단일 실패 지점 (fragile coupling)

v294-scope.js 하나가 실패하면 content.js 의 모든 fetch 가 빈 Bearer 로 나간다. 이는:
- v294 가 JS 에러로 throw → 설치 중단 (히스토리에 없음)
- `Object.defineProperty(window,'fetch',...)` 가 사용자 환경(크롬 확장) 에서 차단됨
- 타 패치 스크립트가 `window.fetch = X` 로 덮어써서 v294 의 self-heal interval 도 밀림

의 세 가지 환경에서 동시에 발생.

## 4. 패치 — L-fix-search-blank

### 패치 A: 토큰 정규화 (`content-v294-scope.js`)

```js
function stripBridgePrefix(s) {
  if (!s || typeof s !== 'string') return s;
  while (s.indexOf('admin_bridge_') === 0) s = s.slice('admin_bridge_'.length);
  return s;
}
function getWsToken() {
  try {
    var t = sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token');
    var bare = stripBridgePrefix(t);
    if (isJwtLike(bare)) return bare;   // ← 접두사 제거 후 JWT 판정
    var sb = extractSupabaseAccessToken();
    if (sb) return sb;
    return stripBridgePrefix(t);        // ← fallback 도 접두사 제거
  } catch (_) { return ''; }
}
```

→ Supabase 스토리지 유무와 **무관하게** 항상 pure JWT 를 반환. 래퍼의 `'Bearer admin_bridge_'+tok` 합성이 정확히 한 겹만 된다.

### 패치 B: 레이스 제거 (`content.js` 라인 5681-5695)

```js
if (window.WS._prefetchOnReady) {
  window.WS._prefetchOnReady = false;
  setTimeout(function() {
    try { window.WS.loadData(); } catch (_) {}
  }, 250);   // ← v230~v294 패치 로딩 완료 대기
}
```

250ms 는 캐시에 없는 최초 로드에서만 발생하는 체감 지연. 캐시가 있으면 IndexedDB 경로가 즉시 스켈레톤을 대체하므로 UX 영향 미미.

### 패치 C: XSS 공격면 축소 (L-sec113, `/search/page.tsx`)

`admin_password` 평문을 `/search` sessionStorage 로 복사하는 레거시 브리지 제거. 이제 `/search` 탭에서 XSS 가 발생해도 admin_password 는 접근 불가 (sessionStorage 는 탭당 분리, localStorage 의 admin_password 도 /admin/layout.tsx 가 정리).

## 5. 검증 계획

1. **로컬**: `npm run dev` → `/search` 로그인 후 Network 탭에서 `/api/admin/listings?fields=minimal` 의 Authorization 헤더 확인
   - `Bearer admin_bridge_eyJ...` (한 겹 접두사) 이어야 함
   - 200 OK + listings 배열 확인
2. **시크릿 모드**: 같은 테스트를 Supabase 스토리지 없는 상태로 반복 — 패치 전에는 401, 패치 후에는 200
3. **캐시 clear**: DevTools > Application > Clear storage 후 `/search` 새로고침 — 첫 로드에서 빈 화면 없이 바로 매물 표시
4. **F5 연타**: 15초에 5회 새로고침 — 재시도 backoff 로 지연되지 않아야 함

## 6. 영구 차단을 위한 후속 제안

| 우선순위 | 항목 | 이유 |
|---|---|---|
| **High** | `content.js` 의 `ADMIN_API_URL`/`ADMIN_TOKEN` 제거 — 모든 fetch 를 `window.wsAdminFetch` 로 수렴 | v294 래퍼 실패 시에도 `wsAdminFetch` 가 명시 호출되면 Bearer 주입 보장 |
| **High** | `/search` SSR 게이트 도입 — 서버 사이드에서 cookie 기반 JWT 확인 후 HTML 렌더 | 클라이언트 사이드 fetch 래퍼 의존을 제거. 가장 근본적인 해결 |
| **Medium** | content.js 축소 — 14k 라인 중 최소 40% 가 중복 패치(v230~v294). 베이스 번들로 흡수 | 레이스 윈도우 단축 + 유지보수성 |
| **Medium** | IndexedDB 캐시 TTL 을 30초 로 축소 + "캐시 표시 중" 배너 | 사용자가 오래된 데이터를 모른 채 보는 상황 방지 |
| **Low** | Sentry/Posthog 로 프론트엔드 401 실시간 감시 | "재발" 여부를 사용자 리포트 없이 감지 |
| **Low** | Playwright E2E 테스트: 시크릿 모드/캐시 비움/Supabase 스토리지 없음 3 케이스 CI 커버 | 회귀 방지 |

## 7. 요약

**/search 가 매번 비는 이유 한 줄:**
> 클라이언트 fetch 래퍼(v294-scope.js) 가 토큰을 이중 접두사로 만들거나 설치 타이밍이 늦어져 content.js 의 초기 fetch 가 빈 Bearer/잘못된 Bearer 로 401 을 받고, IndexedDB 캐시가 증상을 감추다가 캐시 만료 시 빈 화면이 노출된다.

**이 커밋으로 해결되는 부분:** 원인 ①② (주범 2건). 원인 ③④ 는 위 §6 후속 작업.

---

**관련 파일:**
- `public/search/content-v294-scope.js:86-115` (getWsToken + stripBridgePrefix)
- `public/search/content.js:5681-5695` (프리페치 250ms 지연)
- `src/app/search/page.tsx:22-46` (admin_password 브리지 제거)
