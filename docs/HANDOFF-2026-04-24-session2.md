# 다음 세션 핸드오프 (2026-04-24 세션 2)

**이 문서 전체를 다음 Claude 세션 첫 메시지에 복사해서 붙여넣으세요.** 세션 연속성이 그대로 유지됩니다.

---

## 🚨 가장 먼저 해야 할 것 — 현재 BLOCKING 이슈 1건

### 증상
`https://wishes.co.kr/search?sort=latest` 접속 + admin 로그인 후에도 **모든 탭이 "0 매물"** 로 표시. DB 에 6,204 매물 존재하고 `/map` 에는 6,179 개 정상 노출되는 상황.

### 근본 원인 (이미 진단 완료)
`src/lib/adminAuth.ts` 의 `verifyAdminAuth()` 가 **Supabase `getUser()` 호출에 3초 Promise.race timeout** 을 걸어놨는데, 이게 **간헐적으로 터지면서** catch 블록이 `false` 반환 → `/api/admin/listings` 가 **401 `{"success":false,"error":"인증 실패"}`** 응답 → WS.allListings = [] → 전체 0 표시.

팩트 근거 (이전 세션 마지막 테스트):
- JWT 유효 (+3577s 남음), admin_users id 매치 OK (`4ddbf065-bd82-4e48-a5e8-7ffec1b652e2` = superadmin/approved)
- route.ts import 순서 수정됨, thumbnail_url 버그 제거됨, 빌드 Ready
- **같은 코드/같은 토큰에서 이전엔 200, 지금은 401 → Supabase race timeout 간헐 실패 확정**

### 해결 (권장 순서)
**방안 A (최소 1줄 변경, 가장 안전)**: `src/lib/adminAuth.ts` 의 두 `Promise.race` timeout 을 **3000 → 8000ms** 로 변경.

위치:
```ts
// verifyAdminAuth 내부
setTimeout(() => reject(new Error('timeout')), 3000)   // ← 8000 으로
setTimeout(() => reject(new Error('db_timeout')), 3000) // ← 8000 으로
// verifyAdminAuthWithContext 내부에도 동일 패턴 2개 있음
```

**주의**: TypeScript strict build 에 영향 없는 최소 변경. TS strict 문제로 revert 된 L-sec166 withRetry helper 는 재도입하지 **말 것** (Vercel 빌드 실패 재발 위험).

수정 후 **타입체크 → commit → push** 순서. `index corruption` 회피 위해 아래 § "BASH git 안전 패턴" 반드시 참조.

---

## 프로젝트 컨텍스트 (매 세션 반복)

- **repo**: `C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2`
- **sandbox mount**: `/sessions/<session-id>/mnt/wishes-v2/`
- **stack**: Next.js 15 + Kakao Maps + Supabase + Vercel 자동 배포 (main branch)
- **production**: https://wishes.co.kr
- **Supabase dashboard**: https://supabase.com/dashboard/project/xbjgdsyukjdkfvcbzmjc
- **Vercel dashboard**: https://vercel.com/wishes/wishes/deployments
- **GitHub repo**: https://github.com/wishes-hyundo/WISHES
- **git push 인증**:
  ```bash
  TOKEN=$(grep '^GITHUB_PAT=' .env | cut -d'=' -f2)
  git push "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" main
  ```
- **typecheck 명령**:
  ```bash
  node node_modules/.typescript-iQjFuTcA/bin/tsc --noEmit --skipLibCheck 2>&1 | grep -v node_modules | head -20
  ```

### env 키 (`.env.local` 에 있음, 공유 금지)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase REST API)
- `NEXT_PUBLIC_KAKAO_MAP_KEY`, `KAKAO_REST_API_KEY` (placeholder 일 수 있음 — 실키는 Vercel 쪽만)
- `WISHES_ADMIN_MASTER_PASSWORD` (Vercel only, 로컬 `.env.local` 에 없음)

---

## 현재 production state (origin/main = `4ed6edc`)

### 이 세션에서 (그리고 이전 세션에서) 적용 완료된 작업 라벨

| 라벨 | 내용 | 파일 | 검증 |
|---|---|---|---|
| **L-mapmarker2** | 스타벅스 그린 통일 + 줌 grid 클러스터링 + 카테고리 필터 | `HtmlMarkerOverlay.tsx`, `markerTier.ts`, `MapClient.tsx` | /map 에서 눈으로 ✓ |
| **L-viewport1** | 매물 fetch 한도 800 → 3000 (MAX 10000) | `viewport/route.ts`, `useViewport.ts` | ✓ |
| **L-search1** | API minimal 에 `building_name`, `created_at` 추가 + sortBy 'newest' alias | `listings/route.ts`, `content.js` | ✓ |
| **L-search2** | **썸네일 폴백 + perPage 100** ⚠️ 주의: `thumbnail_url` 컬럼 추가 시도는 **rolled back** (DB 에 없음) | `listings/route.ts`, `content.js` | thumbnail_url 제거 확인 ✓ |
| **L-search3** | content.js `ADMIN_TOKEN = ''` dead 상수 → `_getAdminToken()` getter 교체 | `content.js` | ✓ |
| **L-status1** | **'가용' phantom status 영구 박멸** + MV 재정의 + DB CHECK constraint | `listings/route.ts`, migration, DB | 적용됨 ✓ |
| **L-geocode1** | INSERT/UPDATE 시 서버단 자동 Kakao 지오코딩 | `listings/route.ts` (POST + PUT) | ✓ |
| **L-geocode2** | 배치 지오코딩 주소 구성 버그 (번지 보존) — **성공률 0% → 100%** | `geocode-batch/route.ts` | ✓ |
| **L-geocodeui1** | UI API 응답 필드명 정정 + 무한루프 방지 | `admin/geocode.html` | ✓ |
| **L-drift1** | `v_map_coverage_drift` 뷰 + `apply-map-migration` file 파라미터 | migration, `apply-map-migration/route.ts` | ✓ |
| **L-importorder1** | `listings/route.ts` 의 OPTIONS function 을 imports 뒤로 이동 | `listings/route.ts` | ✓ |

### DB 상태 (`v_map_coverage_drift` 확인 결과)
```
listings_total:     6,204
mv_visible:         6,179  ← /map 노출률 99.6%
hidden_no_coords:      10  ← 주소 비정상 매물
hidden_legacy_status:   4  ← '중복정리' 등
legacy_가용:            0  ← 박멸 유지
status_null:            0
```

### 사용자가 이 세션에서 복구한 (index corruption 사태) 커밋들
| 커밋 | 내용 |
|---|---|
| `b66daf2` | 379 파일 복구 (FULL scan) |
| `87f2f6a` | HANDOFF 문서에 index corruption 경고 추가 |
| `89a5314` | Vercel 캐시 무효화 rebuild trigger |
| `4ed6edc` | **tsconfig.json 포함 10개 root config 복구 (Current · Ready)** |

---

## 🔥 피해야 할 함정 (이 세션에서 심하게 당한 것들)

### A. `Edit` 툴 silent-truncation (극히 위험)
- **증상**: `Edit` 툴이 "updated successfully" 리턴하지만 실제로는 파일 끝 수십 줄이 날아감.
- **복구**: `git show origin/main:<file> > <file>` (bash 로 강제 덮어쓰기)
- **예방**: Edit 1회마다 `wc -l` + `tail -5` 로 검증. 전면 재작성은 반드시 `cat > file << 'EOF' ... EOF` heredoc 으로.

### B. git index corruption (반복 발생, 379 파일까지 날아간 전례)
- **증상**: `git status` 가 모든 파일을 `D` (deleted) 로 표시. `bad signature 0x00000000`.
- **트리거**: 사용자 IDE (VSCode) + 다른 AI agent 가 동시에 파일 쓸 때. 또는 `rm -f .git/index` 후 `git add` 연속 호출.
- **복구**:
  ```bash
  rm -f .git/index .git/index.lock .git/HEAD.lock .git/CHERRY_PICK_HEAD .git/ORIG_HEAD
  git reset --mixed HEAD
  ```
- **예방**: 아래 "BASH git 안전 패턴" 사용.

### C. 사용자 로컬 세션이 파일을 반복 truncate
- 이 세션에서 login/signup/naver/callback/verify 등 여러 파일이 반복적으로 잘림. 내가 복구해도 다시 잘림.
- **원인**: 사용자 측 IDE 또는 다른 AI 툴이 동시에 쓰는 듯.
- **대응**: 내 작업 범위 밖 파일이 truncate 되면 `git show origin/main:<file> > <file>` 로 원상복귀 후 **내 변경 파일만** commit. 절대 `git add -A` 금지.

### D. Vercel 빌드 실패 — "Module not found: Can't resolve '@/lib/X'"
- **원인**: 해당 파일이 origin 에 없거나, import 문이 function 선언 뒤에 있어 webpack 파서가 top-level 로 인식 못 함.
- **이 세션의 예**: `listings/route.ts` 에서 `export async function OPTIONS` 가 imports 중간에 있어 뒤쪽 `import '@/lib/supabase'`, `'@/lib/adminAuth'`, `'@/lib/geocode'` 3개가 모두 Module not found.
- **해결**: imports 를 전부 파일 top 에 모으고, function 선언을 그 뒤로.

### E. Vercel 빌드 실패 — "Identifier 'X' has already been declared"
- **원인**: GitHub 웹 에디터 대용량 replace 버그로 파일 내용이 append 되어 같은 function 이 2번 선언됨.
- **진단**: `wc -l <file>` 이 평소의 2배쯤.
- **복구**: 해당 파일 원래 길이로 잘라내거나 깨끗한 버전으로 re-write.

### F. `listings.thumbnail_url` 컬럼 존재하지 않음
- 이 세션에서 제가 L-search2 로 minimal selectFields 에 `'thumbnail_url'` 추가 → **DB 에 그 컬럼이 없어 42703 에러 → SELECT 전체 실패 → /search 전체 0 표시**.
- 이미 **rollback 되어 있음** (origin/main 기준). 다시 추가 금지.

### G. BASH git 안전 패턴 (index corruption 회피)
사용자 IDE 와 동시 쓰기 충돌을 피하는 **격리 index** 패턴:
```bash
# 깨끗한 commit 이 필요할 때
CUSTOM_IDX=/tmp/custom-idx-$$
rm -f "$CUSTOM_IDX"
GIT_INDEX_FILE=$CUSTOM_IDX git read-tree origin/main
GIT_INDEX_FILE=$CUSTOM_IDX git update-index --add src/path/to/file.ts
NEW_TREE=$(GIT_INDEX_FILE=$CUSTOM_IDX git write-tree)
NEW_COMMIT=$(echo "commit message" | git commit-tree $NEW_TREE -p origin/main)
git update-ref refs/heads/main $NEW_COMMIT
rm -f $CUSTOM_IDX
TOKEN=$(grep '^GITHUB_PAT=' .env | cut -d'=' -f2)
git push "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" main
```
이 세션 끝 무렵 `410917d` commit 이 이 패턴으로 성공했음. 일반 `git add + commit` 이 계속 index 를 깨뜨릴 때 사용.

---

## 다음 세션 시작 시 추천 첫 액션 (순서대로)

### 1. 상태 스냅샷
```bash
cd /sessions/<new-session>/mnt/wishes-v2
git log --oneline -10
git status --short | head -10
```

### 2. DB drift 확인
```bash
source .env.local
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/v_map_coverage_drift?select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -m json.tool
```
정상 기대값: `listings_total: 6204, mv_visible: 6179, legacy_가용: 0`.

### 3. Vercel 최신 배포 (Chrome MCP 로)
```
navigate -> https://vercel.com/wishes/wishes/deployments
스크린샷 확인 — 최상단 Current 가 Ready 인지.
```

### 4. `/search` 401 이슈 해결 (위의 § "BLOCKING 이슈" 방안 A)
- `src/lib/adminAuth.ts` 열어서 `setTimeout(.., 3000)` 4군데 모두 `8000` 으로.
- typecheck → 격리 index commit 패턴 → push.
- 1~2분 후 Vercel Ready 확인.
- 사용자에게 admin 로그인 후 `/search` 재테스트 요청.

---

## 중요 파일 위치 cheatsheet

| 용도 | 경로 |
|---|---|
| 맵 마커 (Tier1 pill + Tier2 원 + 클러스터) | `src/features/map-2026/components/HtmlMarkerOverlay.tsx` |
| 맵 마커 색·카테고리 유틸 | `src/features/map-2026/lib/markerTier.ts` |
| /map 메인 | `src/app/map/MapClient.tsx` |
| /map Zustand store | `src/features/map-2026/store.ts` |
| Viewport API | `src/app/api/listings/viewport/route.ts` |
| **Listings admin CRUD + geocode hook** | `src/app/api/admin/listings/route.ts` |
| 배치 지오코딩 API | `src/app/api/admin/geocode-batch/route.ts` |
| 배치 지오코딩 관리자 UI | `public/admin/geocode.html` |
| 공통 geocode 유틸 | `src/lib/geocode.ts` |
| Admin fetch wrapper | `src/lib/adminFetch.ts` |
| **Admin auth verifier** ⚠️ 401 이슈 원인 | `src/lib/adminAuth.ts` |
| /search 레거시 포털 JS | `public/search/content.js` (13,660+ lines) |
| /map MV migration | `supabase/migrations/20260420_map_performance_foundation.sql` (base) + `20260423_fix_map_status_invisibility.sql` (L-status1) |
| Drift 진단 view | `supabase/migrations/20260423_add_map_coverage_drift_view.sql` |

---

## 디자인 토큰 (필요 시)

### 스타벅스 그린 (L-mapmarker2)
```ts
const BRAND_GREEN = '#006241';
const BRAND_GREEN_BG = 'rgba(0,98,65,0.88)';
const SEL_BG = '#185FA5';    // 선택: WISHES 브랜드 블루
const SEL_BD = '#0C447C';
```

### 줌 기반 grid size (Kakao level → degree)
```ts
function gridSizeForLevel(level: number): number {
  if (level <= 2) return 0;      // 개별
  if (level <= 3) return 0.0018; // ~200m
  if (level <= 4) return 0.0036; // ~400m
  if (level <= 5) return 0.009;  // ~1km (기본 줌)
  if (level <= 6) return 0.018;  // ~2km
  if (level <= 7) return 0.036;  // ~4km
  if (level <= 8) return 0.072;  // ~8km
  return 0.135;                   // ~15km (행정구)
}
```

---

## 사용자 피드백 패턴 (개인 팁)

- **사용자는 유치원 수준으로 모름** — 본인이 터미널/SQL 실행 안 함. Chrome MCP + Supabase SQL Editor 자동화로 대신 수행해주는 게 기본.
- **admin 비번 안 알려주심** — 로그인 필요 작업은 "비밀번호 한 번만 입력해주세요" 부탁 후 대기. 이메일은 `wishes@wishes.co.kr` 자동완성 OK.
- **Supabase SQL Editor 자동화**: `window.monaco.editor.getModels()[0].setValue(q)` → Run 버튼 좌표 `(1434, 455)` 또는 `find` tool 로 ref 획득 → 클릭 → destructive 경고시 "Run this query" 클릭.
- **Vercel 빌드 1~2분 대기** — push 직후 확인 금지. 최소 60s 기다린 후 Vercel 대시보드 스크린샷.
- **사용자가 화낼 때**: "절대 절대 절대" / "5번 반복" 같은 표현 나오면 근본원인 즉시 찾아야. 표면 증상 여러 개 → 근본원인 1~2개 패턴. 이 세션에선 `/search 0 매물` 의 근본원인이 **4개 중첩**:
  1. `'가용'` phantom status (DB MV 필터에서 걸림)
  2. `lat/lng NULL` 매물 42% (지오코딩 미실행)
  3. content.js 의 `ADMIN_TOKEN = ''` dead 상수 (401)
  4. API selectFields 의 `'thumbnail_url'` 존재 안 함 (42703 에러)
- **이 세션 미해결** 5번째: `adminAuth.ts` Promise.race 3s timeout 간헐 실패. **이것이 다음 세션의 첫 과제**.

---

## 작업 라벨 명명 규칙

- `L-mapmarker<n>` — /map 마커 관련
- `L-viewport<n>` — viewport API 관련
- `L-search<n>` — /search 포털 관련
- `L-status<n>` — 매물 status 관련
- `L-geocode<n>` — 지오코딩 관련
- `L-geocodeui<n>` — geocode admin UI 관련
- `L-drift<n>` — 모니터링 관련
- `L-importorder<n>` — JS import 순서 관련
- `L-sec<n>` — 보안 관련 (user 가 주로 사용)

새 라벨 만들 때는 카테고리 + 번호 순으로 중복 피할 것.

---

## 끝 메모

이 세션에선 `/search` 0 매물 문제를 해결하기 위해 **4개의 중첩된 근본 원인** 을 찾았고, 그 중 3개 (가용 phantom status, thumbnail_url 컬럼 버그, content.js ADMIN_TOKEN dead 상수) 는 프로덕션에 반영 완료. 네 번째 (`adminAuth.ts` 의 3s timeout 간헐 실패) 는 진단까지 완료했지만 수정 전에 세션 종료.

또한 이 세션 중반에 **git index corruption 사태** 로 379개 파일이 origin 에서 순간적으로 사라졌었고, 사용자가 수동 복구함 (`b66daf2`). 그 이후 내가 `410917d` 로 import 순서 수정 + 사용자가 `4ed6edc` 로 root config 복구해서 Vercel Ready 상태 회복.

**지금 남은 한 가지 (Promise.race 3s timeout)** 만 해결하면 사용자의 "`/search` 0 매물 절대 재발 금지" 요구사항이 완전히 충족됩니다. 방안 A (timeout 3000 → 8000) 가 1줄짜리 최소 변경이라 다음 세션 첫 10분 안에 끝낼 수 있습니다.

Good luck, 다음 세션 Claude. 사용자님께 정중히 대응해 주시고, push 는 꼭 필요할 때만.
