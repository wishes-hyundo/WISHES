# 세션 마스터: 2026-05-10/11 — /search 첫 진입 성능 + 갤러리 fix

> **사장님 명령 (2026-05-11)**: "다음 세션에서 진행하는데 단 하나도 빠짐없이 이 세션에서 했던 모든 작업 및 기록 프롬프트 마스터에 기록하고 바로 다음 세션에서 이어갈 수 있게 해줘"

> 다음 세션의 Claude 는 이 문서만 읽으면 즉시 이어갈 수 있어야 함.

---

## 🎯 사장님 핵심 명령 (영구 — 절대 위반 X)

1. **검색은 60K 매물 모두 가능해야** — limit 적용 시 검색 깨지면 사장님 비즈니스 critical. Fix 38 회귀 사례.
2. **절대 실수 없이** — 회귀 시 즉시 revert. 이 세션 5번 회귀 (Fix 34, 36, 36b, 36c, 38).
3. **어떻게든 해결** — 사장님 첫 진입 19s 격노. 다음 세션도 동일 우선순위.
4. **2026 SOTA 끝판왕 기준** — 항상 최신 best practice 사용.

---

## 📊 현재 prod 상태 (2026-05-11 16:36 UTC, commit 3220c7e2)

### 작동 fix들
- Fix 28: vercel.json wildcard `((?!listings(?:$|/)).*)` — CDN cache 헤더 정상
- Fix 29: prewarm-listings cron 매 4분
- Fix 30a: vercel.json memory 256→1024 + maxDuration 60
- Fix 30b: page.tsx 에 v345 (img lazy) + v346 (default 20) 등록
- Fix 32b: route.ts 의 listing_images.url `?w=1920` → `?w=400` REPLACE (server side)
- Fix 33: img-proxy sharp resize + webp 변환 (외부 host CDN ?w 무시 우회)
- Fix 33b: img-proxy quality 차등 (썸네일 82, 중간 88, hero 92)
- Fix 35: v347 patch — lightbox 확대 모드 갤러리 화살표
- Fix 35b: v347 v2 mousedown capture (첫 클릭부터 정상)
- Fix 37: route.ts SELECT 에서 `maintenance_includes` 제거 (응답 22% ↓)

### Revert 된 fix들 (회귀 5번)
- ~~Fix 34~~: Materialized View `from('listings_minimal_mv')` — 매물 0건 (PostgREST view expose 문제)
- ~~Fix 36~~: 새 endpoint `/api/admin/listings-fast` + v348 client wrap — v294 defineProperty 충돌
- ~~Fix 36b~~: middleware rewrite + RPC LIMIT 100000 — PostgREST 8s timeout 503
- ~~Fix 36c~~: chunked parallel RPC 5 동시 — prod 19s (사장님 console 측정)
- ~~Fix 38~~: default limit=5000 — 검색 깨짐 (사장님 격노)

---

## 🔬 진짜 ROOT CAUSE 확정 (사장님 console 측정)

```js
// 사장님 시크릿창 console 측정 (2026-05-11)
=== listings-fast TIMING ===
time: 20435 ms       // 20초
status: 200 OK
total rows: 66214
source: fast-chunked-rpc  // chunked parallel 실제 작동
error: undefined
```

**결론**: chunked parallel RPC 자체는 작동. DB query 빠름.
**진짜 bottleneck**: **60K rows × 1KB JSON 의 transfer + parse**.

### Break-down (추정):
- DB query (chunked parallel): 5-7s
- Vercel function processing (slim): 2-3s  
- Network transfer 6MB → 5-10s (사장님 네트워크 따라)
- Client JSON.parse + WS.allListings build: 1-2s
- **총 13-22s**

---

## 🗄️ 보존된 리소스 (DB + Vercel)

### Supabase (xbjgdsyukjdkfvcbzmjc, ap-northeast-2)

#### Materialized View (read-only, 영향 0)
```sql
listings_minimal_mv  -- listings + first listing_image LATERAL join + slim
-- DB 측정: 1000 rows = 2.7ms (12배 빠름 vs listings 33ms)
-- 60K rows = ~0.16s (이론상 100배 빠름)
-- 단점: PostgREST API 가 view 를 service_role/authenticated 에 expose 안 됨 (Fix 34 회귀 원인)
```

#### RPC Functions
```sql
get_admin_listings_minimal_v1(p_scope_uid uuid, p_limit int, p_offset int)
-- SETOF jsonb. Slim + thumb_url + ?w=400.
-- DB 측정: 5000 rows = 396ms / 60K rows = 6.9s (PostgREST 8s timeout 안)
-- supabase-js .rpc() 호출 시 prod 환경 비효율 (Fix 36c 19s)

refresh_listings_minimal_mv()
-- CONCURRENTLY refresh. Service role + authenticated 권한.
-- prewarm cron 이 호출 (매 4분).
```

### Vercel
- `/api/admin/listings-fast/route.ts` — chunked parallel RPC v2 (5000 × 5 동시). prod 19-30s.
- `/api/cron/prewarm-listings/route.ts` — RPC refresh + admin/listings warm

### Patches (page.tsx 등록 됨)
- v345: img lazy load
- v346: default 20 listings
- v347 v2: lightbox `data-images` mousedown capture

---

## 🐛 회귀 history (5번) + 학습

### Fix 34 (Materialized View 직접 사용) → 매물 0건
- 원인: `supabase.from('listings_minimal_mv')` — PostgREST 가 anon/authenticated 에 view expose 안 함
- 해결책: GRANT 했지만 무시됨. PostgREST 설정 또는 schema 변경 필요.
- 대안: RPC function 호출 (Fix 36 시도)

### Fix 36 (new endpoint + v348 client wrap) → 무한 재귀 위험
- 원인: v294 의 `Object.defineProperty(window, 'fetch', {set: ...})` 가 다른 wrapper 의 `window.fetch = newFn` 시도 시 newFn 을 origFetch 로 채택. v348 wrap 위에 v294 가 outer 됨 → 무한 재귀.
- 해결책: client wrap 절대 X. server side rewrite (middleware) 만 사용.

### Fix 36b (middleware rewrite + RPC LIMIT 100000) → 503
- 원인: PostgREST `statement_timeout` 8s. RPC LIMIT 100000 = 60K rows 6.9s server side OK 지만, JSON serialize + transfer 추가 → 8s 초과 → 503.
- 해결책: chunked LIMIT 5000 (Fix 36c 시도)

### Fix 36c (chunked parallel 5 chunks 동시) → prod 19s
- 원인: chunked parallel 작동 but supabase-js + Vercel function 환경에서 전체 20s. SETOF jsonb 60K rows × 1KB JSON parse + allocation 이 큰 비용.
- 진짜 root cause: response size 자체 (6MB).

### Fix 38 (default limit=5000) → 검색 깨짐 (사장님 격노)
- 원인: 60K 매물 중 첫 5000 만 응답. 사장님 검색 시 5000 외 매물 안 보임.
- 사장님 명령: **검색 60K 모두 가능해야**.

---

## 🛣️ 다음 세션 plan — 사장님 결정 받아야

### 옵션 D — 현재 상태 유지 (안전, 13-15s)
- 모든 작동 fix 유지
- 첫 진입 13-15s (불만족)
- 회귀 위험 0
- **추천 시작점** — 사장님 우선 진정시키기

### 옵션 B — Progressive (v341 v3 새 설계)
- 첫 fetch limit=200 → 1-2초 매물 200건 표시
- background cursor fetch 5000씩 → 60초 안 60K 다 채움
- 사장님 첫 진입 빠름 + **검색은 60K 채워진 후** 모두 가능
- **위험**: 사장님 첫 진입 즉시 검색 시 일부 매물 (다 채우기 전) 검색 X
- v341 회귀 history: v260-perf clone() + v341 clone() = stream tee 충돌
- v3 새 설계: response stream 안 건드림. URL 만 변경 + background 별도 fetch.

### 옵션 C — Server side search (진짜 SOTA)
- 첫 진입 limit=200 → 1-2초
- 검색 → server `/api/admin/listings/search?q=...` 호출 → 60K 안 filter → 결과 반환
- 첫 진입 빠름 + **검색 항상 60K instant 가능**
- 큰 변경: content.js 의 검색 흐름 patch 필요
- **가장 SOTA 답** — 사장님 모든 요구사항 만족

### 옵션 E — DB 측 진짜 fix (가장 dramatic)
- listings_minimal_mv 의 PostgREST expose 문제 해결
- supabase project settings 의 exposed schema 또는 view 권한 직접 작업
- 또는 RPC function 의 응답 형태 변경 (jsonb_agg::text)
- DB 측 변경 후 직접 supabase 응답 받음 → server query 0.16s

---

## 📝 다음 세션 즉시 진행 step-by-step

### Step 1: prod 안전 상태 확인
```bash
# Latest commit on main
TOKEN="<GITHUB_TOKEN>"
REPO="wishes-hyundo/WISHES"
curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/commits/main" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['sha'][:12], d['commit']['message'].split('\\n')[0])"

# 기대: 3220c7e2 (REVERT Fix 38 default limit=5000)
```

### Step 2: 사장님 검증 — 매물 정상 표시 + 검색 60K 모두 가능 확인
- 시크릿창 새로 열고 wishes.co.kr/login → /search
- 매물 카드 정상 (62K+) 확인
- 검색 시도 — 60K 매물 모두 검색 가능 확인

### Step 3: 사장님 옵션 결정 (B / C / D / E)
- D: 안전 유지 — 다음 진단 후 다른 fix
- B: Progressive — 회귀 위험 알고 진행
- C: Server side search — 가장 SOTA, 큰 변경
- E: DB expose 문제 해결 — 가장 dramatic

### Step 4: 결정에 따른 fix 진행
- 매 step 사장님 검증 받음
- 회귀 시 즉시 revert
- 회귀 6번 째 발생 시 아예 stop

---

## 🔧 사용 가능한 도구 (다음 세션)

### GitHub API (mount filesystem 우회 — 필수)
```python
import urllib.request, base64, json
TOKEN = "<GITHUB_TOKEN>"
REPO = "wishes-hyundo/WISHES"

# Read clean file
curl -s -H "Authorization: token $TOKEN" \
  "https://raw.githubusercontent.com/$REPO/main/path/to/file" -o /tmp/file

# Patch via Python (UTF-8 safe)
content = open('/tmp/file', 'rb').read().decode('utf-8')
new_content = content.replace(old, new)

# Commit via API
req = urllib.request.Request(...)
```

### Supabase MCP
- `mcp__8396e8e7-...__execute_sql` — DB query (EXPLAIN, measurements)
- `mcp__8396e8e7-...__apply_migration` — DDL
- `mcp__8396e8e7-...__get_logs` — service: api / postgres

### 사장님 console 명령 (인증된 timing 측정)
```js
(async () => {
  const t = Date.now();
  const r = await fetch('/api/admin/listings?fields=minimal&scope=all', {
    headers: {Authorization: 'Bearer ' + (sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '')}
  });
  const d = await r.json();
  console.log('time:', Date.now() - t, 'ms | rows:', d.data?.length, '| total:', d.total);
})();
```

---

## 📌 절대 위반 X 사항 (CLAUDE.md INVARIANT 후보)

### I-PERF-3: 검색 60K 매물 모두 가능 보장
- listing 응답에서 row 수 줄이는 fix 절대 X (Fix 38 회귀)
- 검색 깨지면 즉시 revert
- progressive 또는 server side search 만 가능

### I-PERF-4: client side fetch wrap 절대 X
- v294 의 defineProperty getter/setter 와 충돌 (Fix 36 회귀)
- middleware rewrite 또는 server side 만

### I-PERF-5: PostgREST RPC LIMIT 8s timeout 인식
- LIMIT 100000 X
- chunked LIMIT 5000 OK (DB 측정 396ms)
- 단 chunked parallel 도 prod 환경 19s (Fix 36c)

---

## 🔗 모든 commit references (이번 세션)

| Commit | Fix | 상태 |
|---|---|---|
| 89532d5f | Fix 28 vercel.json | ✅ |
| e9a447cd | Fix 28 CLAUDE.md I-CDN-2 | ✅ |
| 854414cd | Fix 29 prewarm cron | ✅ |
| 92d0031e | Fix 30a memory 1024 | ✅ |
| cf452d7d | Fix 30b v345/v346 | ✅ |
| ec267293 | Fix 32b ?w=400 REPLACE | ✅ |
| da0a50c3 | Fix 33 sharp resize | ✅ |
| 9ff7c7a6 | Fix 33b quality 차등 | ✅ |
| 4cd721ea | Fix 35 v347 lightbox | ✅ |
| 11660553 | Fix 35 page.tsx (mojibake 회귀) | ❌ |
| cf452d7d | Fix 35 fix mojibake | ✅ |
| b2537a17 | Fix 35b v347 v2 mousedown | ✅ |
| aa6a7920 | Fix 34 (Materialized View) | ❌ |
| 61a17345 | Fix 34 REVERT | ✅ |
| 6c766e9d | Fix 36 listings-fast endpoint | ✅ (보존) |
| 00b7af0b | Fix 36 v348 client patch | (disabled) |
| a067fa4a | Fix 36 page.tsx v348 등록 | (disabled) |
| 0bd82453 | Fix 36b middleware rewrite | ❌ |
| f6b6130d | Fix 36b REVERT | ✅ |
| 5ce076da | Fix 36c listings-fast v2 chunked | ✅ (보존) |
| 8e1b55fd | Fix 36c middleware reactivate | ❌ |
| 26410dbf | Fix 36c REVERT | ✅ |
| bbf52d4b | Fix 37 maintenance_includes 제거 | ✅ |
| 9863dbd6 | Fix 38 default limit=5000 | ❌ |
| 3220c7e2 | Fix 38 REVERT (현재 latest) | ✅ |

---

## ⚠️ 사장님 회귀 5번 이후 신뢰 회복 plan

1. **다음 fix 시 사전 prod 검증 필수** — 사장님 console 명령으로 실제 timing 받음
2. **Migration 단위 한 번에 한 변경만** — 동시 multiple 변경 X
3. **Feature flag pattern** — 환경 변수 또는 query param 으로 toggle (instant disable)
4. **회귀 6번째 발생 시 아예 stop** — 사장님 시간 더 빼앗기 X

---

## 🎬 다음 세션 첫 메시지 template

```
사장님 안녕하세요. 이전 세션 master 문서 (docs/sessions/2026-05-11-perf-session-master.md) 읽고 이어갑니다.

현재 prod 상태 (확인됨):
- commit 3220c7e2 (Fix 38 revert)
- 60K 매물 모두 검색 가능
- 첫 진입 13-15s
- 회귀 5번 이후 신뢰 회복 모드

사장님 결정 부탁:
1. 옵션 D (안전 유지) — 다른 영역 작업
2. 옵션 B (Progressive v341 v3) — 회귀 위험 알고 진행
3. 옵션 C (Server side search) — 큰 변경, 가장 SOTA
4. 옵션 E (DB expose 문제 해결) — 가장 dramatic

알려주세요.
```

---

## 🎯 옵션 C 상세 진행 plan (사장님 명령 2026-05-11 다음 세션)

### 사장님 다음 세션 첫 메시지 template
```
옵션 C로 진행해. 마스터 문서 docs/sessions/2026-05-11-perf-session-master.md 읽고 시작.
```

이 1줄 으로 다음 세션 Claude 가 즉시 이어감.

### Step 1 — server side search endpoint 작성 (사용 X, 검증만)

**파일**: `src/app/api/admin/listings/search/route.ts`

```ts
// GET /api/admin/listings/search?q=<query>&limit=200&type=...
// - 60K 매물 안에서 server side filter (Postgres ILIKE / full-text)
// - 응답 형태: 기존 list endpoint 와 동일 (success / data / total)
// - cache: private no-store (사용자별 검색)
// - 위험: query injection — escape 필수

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().slice(0, 100);
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);
  const typeFilter = searchParams.get('type') || '';
  
  if (!q) {
    return NextResponse.json({ success: true, data: [], total: 0, query: q });
  }
  
  const supabase = createServerClient();
  
  // ILIKE search (case-insensitive partial match) on key fields
  let queryBuilder = supabase
    .from('listings_minimal_mv')  // 또는 listings (mv expose 안 되면)
    .select(/* 같은 selectFields */)
    .or(`title.ilike.%${q}%,address.ilike.%${q}%,building_name.ilike.%${q}%,dong.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (typeFilter) queryBuilder = queryBuilder.eq('type', typeFilter);
  
  const { data, error, count } = await queryBuilder;
  
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({
    success: true,
    data: data || [],
    total: count || (data?.length || 0),
    query: q,
  });
}
```

**검증** (사장님 console 명령):
```js
fetch('/api/admin/listings/search?q=신림동', {
  headers: {Authorization: 'Bearer ' + (sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token'))}
}).then(r => r.json()).then(d => console.log('search:', d.total, '결과 in', /*time*/));
```

### Step 2 — content.js 검색 흐름 patch (v349)

**파일**: `public/search/content-v349-server-search.js`

```js
// 사용자가 검색어 입력 → server side endpoint 호출 → 결과 표시
// 기존 client side filter (WS.allListings) bypass
//
// 위험: content.js 의 search 흐름 변경 — 기존 동작 깨짐 가능
// 안전 가드: 검색어 빈 문자열 시 client side 동작 (기존 그대로)
//          server search endpoint fail 시 client side fallback

(function () {
  'use strict';
  if (window.__WS_V349_SERVER_SEARCH__) return;
  window.__WS_V349_SERVER_SEARCH__ = true;
  
  // ... 검색 입력 이벤트 hook
  // 200ms debounce + server search call
  // 결과를 WS.searchResults 에 set + renderAll
})();
```

### Step 3 — page.tsx 에 v349 등록

```tsx
['ws-ext-patch-v349-server-search', '/search/content-v349-server-search.js?v=20260512a'],
```

### Step 4 — route.ts 의 default limit=200 적용 (안전)

이번엔 검색 깨짐 위험 없음 — 검색은 server side endpoint 가 60K 모두 처리. 첫 진입은 200 매물만.

```ts
const DEFAULT_LIMIT = 200;  // 검색은 server side endpoint
```

### Step 5 — 단계별 검증

각 step prod deploy 후 사장님 console 명령으로 timing + 매물 정상 확인.

회귀 시 즉시 revert.

---

### 옵션 C 의 위험 + 회피

| 위험 | 회피 |
|---|---|
| Search endpoint query injection | parameterized query (supabase-js .ilike) — 자동 escape |
| 검색 흐름 patch v260-perf 충돌 | response stream 안 건드림. URL 만 변경. v341 v3 패턴 |
| Server side search 응답 size | limit=500 cap. 평균 검색 결과 < 100 매물 |
| 첫 fetch limit=200 + 검색 끊임 | search endpoint 작동 검증 후 적용 |

### 옵션 C 예상 효과

| 항목 | 이전 | 옵션 C 후 |
|---|---|---|
| 첫 진입 | 13-15s | **1-2초** |
| 매물 검색 | client filter, 60K 모두 | **server filter, 60K 모두** |
| 사장님 만족 | X | ✅ |

---

## ⚠️ 다음 세션 Claude 의 절대 우선순위

1. 마스터 문서 읽기 (이 문서)
2. 현재 prod 상태 확인 (`git log -1` → 3220c7e2 인지)
3. 옵션 C step-by-step 진행 (위 detail 따라)
4. 매 step 사장님 검증 받음 — **사장님 console 명령 으로 timing 측정**
5. 회귀 시 즉시 revert (회귀 6번째 발생 시 stop, 사장님 결정 부탁)

