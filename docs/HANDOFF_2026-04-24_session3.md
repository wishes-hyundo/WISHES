# 다음 세션 핸드오프 (2026-04-24 세션 3)

이 문서 전체를 다음 Claude 세션 첫 메시지에 복사해서 붙여넣으세요. 세션 연속성이 그대로 유지됩니다.

---

## 🚨 가장 먼저: 현재 production 상태

* **origin/main HEAD**: `e8169ba` (L-session3 배포 완료)
* **Vercel 배포**: live
* **Listings**: DB 6,204 total / `v_map_coverage_drift` 정상 / /search 에 6,191건 표시
* **Images**: 88% (5,484/6,204) 로드 — 나머지 12% 는 업로드 안 된 매물
* **Copyright (저작권)**: 공개 `/map`, `/api/listings` 에 크롤링 이미지 완전 차단 확인 ✅
* **Session (세션 유지)**: 서버 `/api/auth/refresh-session` 기반 refresh 작동 확인 ✅

이번 세션 3 (2026-04-24 오전~오후) 에 누적된 커밋들을 반드시 숙지하고 시작할 것. 아래 § "이번 세션 커밋 목록" 참조.

---

## 프로젝트 컨텍스트 (매 세션 반복)

* repo: `C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2`
* sandbox mount: `/sessions/<session-id>/mnt/wishes-v2/`
* stack: Next.js 15 + Kakao Maps + Supabase + Vercel 자동 배포 (main branch)
* production: https://wishes.co.kr
* Supabase dashboard: https://supabase.com/dashboard/project/xbjgdsyukjdkfvcbzmjc
* Vercel dashboard: https://vercel.com/wishes/wishes/deployments
* GitHub repo: https://github.com/wishes-hyundo/WISHES
* git push 인증:
  ```bash
  TOKEN=$(grep '^GITHUB_PAT=' .env | cut -d'=' -f2)
  git push "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" main
  ```
* typecheck 명령:
  ```bash
  node node_modules/.typescript-iQjFuTcA/bin/tsc --noEmit --skipLibCheck 2>&1 | grep "^src/" | head -20
  ```

env 키 (`.env.local` 에 있음, 공유 금지)

* `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
* `NEXT_PUBLIC_KAKAO_MAP_KEY`
* `WISHES_ADMIN_MASTER_PASSWORD` (Vercel only)

---

## 이번 세션 누적 커밋 목록

| commit | 라벨 | 내용 | 효과 |
|--------|------|------|------|
| `7d5d291` | L-sec167 | adminAuth.ts Promise.race timeout 3s → 8s (6군데) | cold-start 401 감소 |
| `9fb132e` | L-search4 | listing_images `.limit(1, {foreignTable})` | 쿼리 4.8s → 0.9s (초기 시도) |
| `1131f8d` | L-search4b | `export const maxDuration = 30` + 페이지 10000 | Vercel 10s 504 회피 |
| `e92cac3` | L-img1/L-img2 | wishes-image-proxy whitelist + preferSelfHostedImages | 썸네일 88% 복구 |
| `cb3baf2` | L-mob2 | 터치 타겟 44px + safe-area-inset + max-width:360 | 모바일 표준 준수 |
| `44a05cb` | L-search5 | hydrate 401 재시도 | 상세 모달 1차 fix |
| `d3b1f01` | L-search5b | `[id]/route.ts` maxDuration=30 + 재시도 3회 | cold-start 504 커버 |
| `5949377` | L-search5c | `!l.images` 게이트 제거 | 상세 모달 17장 전부 렌더 |
| 🚨 `563a78a` | **L-img1-revert** | wishes-image-proxy whitelist 제거 | **크롤링 이미지 공개 노출 차단 (저작권)** |
| `9da1080` | L-search7 | `listing_images` JOIN 제거 + IN 쿼리 분리 | 27s → 3-4s |
| `c6e143e` | L-search7b | parallel → sequential pagination | 6,191 일관 로드 |
| `b06e0dc` | L-session1 | refresh 10s→100ms + 45min→15min + focus/online | 부분적 (client-side refresh 실패) |
| `235eae7` | L-session2 | refresh_token 이중저장 + setSession fallback | 부분적 (sb- 세션 부재) |
| ⭐ `e8169ba` | **L-session3** | `/api/auth/refresh-session` 서버 기반 refresh 단일화 | **세션 유지 완전 해결** |

---

## 🔥 가장 중요한 학습 사항 (다음 세션에서 유지할 것)

### 1. supabase-js client-side session persistence 가 안 먹히는 환경

사용자 브라우저 localStorage 에 `sb-<ref>-auth-token` 키가 **저장되지 않음**. 원인 불명 (persistSession: true 인데도). 결과:

* `supabase.auth.refreshSession()` 실패
* `supabase.auth.setSession({refresh_token})` 도 기대대로 작동 안 함
* L-session1/L-session2 의 client-side refresh 경로는 **항상 fail**

**해결 패턴**: 서버 `/api/auth/refresh-session` 엔드포인트를 호출하면 service-role 로 Supabase 에 직접 `refreshSession({refresh_token})` 해서 성공. 앞으로 client-side Supabase auth refresh 로직은 절대 믿지 말 것.

### 2. Vercel cold-start → adminFetch 로그아웃 폭탄

과거 `adminFetch.ts` 는 401 받으면 즉시 `sessionStorage.clear()` + `/admin/admin-auth.html` 로 redirect. Vercel serverless cold-start 시 `verifyAdminAuth` 의 Supabase `auth.getUser()` 가 간헐적으로 8s timeout → 401 → 세션 멀쩡한데 강제 로그아웃. 이번 세션에서 L-session3 이 refresh+retry 로 자동 복구하도록 수정. **절대 다시 "401 = 무조건 logout" 으로 되돌리지 말 것.**

### 3. wishes-image-proxy 는 크롤링 원본 프록시 (저작권상 외부)

`wishes-image-proxy.wishes-img.workers.dev` 도메인은 우리 Cloudflare Workers 계정이지만 **역할은 공실클럽/온하우스 등 외부 크롤링 소스의 원본 사진을 프록시 서빙** 하는 것. 원본 저작권은 여전히 외부에 있음. **절대 `isSelfHostedImage` whitelist 에 추가하지 말 것.** `src/lib/image-policy.ts` 주석에 경고 박제됨.

만약 "카드 썸네일이 안 보여요" 로 호소가 들어오면:
* 공개 페이지(`/map`, `/api/listings`) 는 **의도한 동작** — 크롤링 매물은 썸네일 비움
* 관리자 포털(`/search`, `/api/admin/listings`) 은 `preferSelfHostedImages` 로 여전히 표시됨
* 그게 아니면 Cloudflare Worker 쪽 상태 (403 stale) 확인

### 4. `/api/admin/listings` minimal 경로 구조 (L-search7/7b)

현재 구조:
```
1) main SELECT: id, title, ..., source_site (listing_images 제외)
   - sequential pagination (page 0, 1, 2, ..., 6)
   - 각 페이지 ~0.3s
2) 수집된 listing ids 로 listing_images 별도 IN 쿼리
   - select: listing_id, url, sort_order
   - batch 1000 씩
3) 서버에서 groupBy listing_id, sort_order 오름차순 첫 1장만 map 에 저장
4) row.listing_images = [{url}] 주입
5) cacheKey: ['listings-minimal-v7'] (mine 은 uid 포함)
6) maxDuration = 30s
7) unstable_cache revalidate: 60s
```

* **절대 JOIN 으로 복원하지 말 것** — Vercel cold-start 27s 걸리고 pagination 깨진다
* **절대 parallel Promise.all 로 복원하지 말 것** — 간헐적 중간 페이지 실패로 2000/4000 rows 에서 잘린다

### 5. Edit 툴 silent truncation (극히 위험, 여전히 존재)

`Edit` 툴이 "updated successfully" 리턴하지만 **실제로는 파일 끝 수십 줄이 날아감**. 이번 세션 2에서 `route.ts` 2번 당함. 복구: `git show origin/main:<file> > <file>`.

**예방**: **Python heredoc 치환** 이 검증된 안전 패턴. 이번 세션 모든 큰 파일 수정은 Python 으로 처리:

```bash
python3 << 'PYEOF'
with open(path, 'r', encoding='utf-8') as f: c = f.read()
# ... substitutions ...
with open(path, 'w', encoding='utf-8') as f: f.write(c)
PYEOF
```

각 substitution 마다 `assert c.count(anchor) == 1` 로 anchor 존재 검증 필수. 수정 후 `wc -l` + `tail -3` 으로 truncation 체크.

### 6. 격리 index commit 패턴 (git index corruption 회피)

`.git/index.lock` 이 풀리지 않거나 동시 IDE 충돌로 `bad signature 0x00000000` 이 나면 격리 index 로 우회:

```bash
CUSTOM_IDX=/dev/shm/idx-$$
rm -f "$CUSTOM_IDX"
TOKEN=$(grep '^GITHUB_PAT=' .env | cut -d'=' -f2)
REMOTE=$(git ls-remote "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" main | awk '{print $1}')
GIT_INDEX_FILE=$CUSTOM_IDX git read-tree $REMOTE
GIT_INDEX_FILE=$CUSTOM_IDX git update-index --add <files>
TREE=$(GIT_INDEX_FILE=$CUSTOM_IDX git write-tree)
COMMIT=$(echo "message" | git commit-tree $TREE -p $REMOTE)
rm -f "$CUSTOM_IDX"
git push "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" "${COMMIT}:refs/heads/main"
```

warnings 는 무시해도 됨 ("Operation not permitted" on tmp cleanup).

---

## 핵심 파일 위치 cheatsheet

| 용도 | 경로 |
|------|------|
| /search 페이지 + refresh 로직 | `src/app/search/page.tsx` |
| /search 레거시 포털 JS | `public/search/content.js` (13,660+ lines, 거의 안 건드림) |
| /search 상세 모달 hydrate | `public/search/content-v295-detail-hydrate.js` (VERSION 2.9.8) |
| 관리자 fetch wrapper (401 refresh+retry) | `src/lib/adminFetch.ts` |
| 관리자 인증 verifier (8s timeout) | `src/lib/adminAuth.ts` |
| 관리자 listings API (sequential + IN) | `src/app/api/admin/listings/route.ts` (cacheKey v7, maxDuration=30) |
| 관리자 상세 API | `src/app/api/admin/listings/[id]/route.ts` (maxDuration=30) |
| 이미지 정책 (저작권) | `src/lib/image-policy.ts` (wishes-image-proxy 제외 경고 박제) |
| Supabase refresh 서버 엔드포인트 | `src/app/api/auth/refresh-session/route.ts` |
| /login (Supabase 기반) | `src/app/login/page.tsx` (refresh_token 저장) |
| /admin/admin-auth.html (legacy) | `public/admin/admin-auth.html` (refresh_token 저장) |
| 모바일 CSS | `public/search/styles.css` (846 lines, 터치 44px + Fold 360) |
| Vercel 함수 config | `vercel.json` (기본 maxDuration=10, individual routes override) |

---

## 현재 세션 전반 상태 (사용자가 관찰한 것)

| 영역 | 상태 |
|------|------|
| `/search` 전체 매물 수 | ✅ 6,191건 정상 |
| `/search` 카드 썸네일 | ✅ 88% 로드 (크롤링 매물 포함) |
| `/search` 상세 모달 | ✅ 17장 갤러리 렌더 확인 |
| `/map` 공개 페이지 | ✅ 크롤링 이미지 차단 (회색 placeholder) |
| 세션 유지 | ✅ /api/auth/refresh-session 15분 주기 작동 |
| 모바일 터치 타겟 | ✅ 44px 통일 |
| Fold / iPhone SE 초소형 | ✅ max-width:360 breakpoint 대응 |

---

## 남은 이슈 / 다음 세션 권장 작업

### 높음 (사용자 명시 요구)

1. **/search 로딩 속도** — 현재 cold 첫 호출 7-8초. cache hit 후엔 1-2초. 더 빠르게 하려면:
   * materialized view `mv_admin_listings_minimal` 생성해서 server-side pagination 제거
   * 또는 Supabase Edge Function 으로 한 번에 return

2. **모바일 실기기 검수** — 사용자가 "꼼꼼하게 검수" 요청함. L-mob1/2 코드 기반 개선 완료했지만 **실제 iPhone/Galaxy 에서 피드백** 받아야 함. 폰트 12-13px 31개가 아직 그대로 있음 (bumps 하지 않음 — 레이아웃 부작용 방지 차원). 필요시 추가 조정.

3. **"일부 매물 첫 이미지가 broken"** — 원본 gongsilclub 에서 삭제된 stale crawl 데이터. Cloudflare Worker 가 403 리턴. 재크롤링 또는 Worker 측 fallback 추가.

### 중간

4. **content.js 의 session 관련 legacy 경로** — 여기저기서 `sessionStorage.clear()` 나 redirect 를 스스로 수행하는 곳이 있을 수 있음. L-session3 의 보호 로직이 이 경로들을 뚫고 들어올 수 있으므로 audit.

5. **`admin-auth.html` legacy 로그인 페이지의 Supabase signInWithPassword 응답 검증** — refresh_token 이 항상 오는지 서버 로그로 확인 필요.

6. **Cache key 관리** — `listings-minimal-v7` 이 현재 버전. 차후 schema/로직 변경 시 v8, v9 ... bump 필수. 이번 세션에도 v3→v4→v5→v6→v7 총 4번 bump.

### 낮음

7. **unstable_cache 의 poisoned cache 감지** — 1회 실패로 빈 배열이 60초 저장되는 패턴. metric 으로 관측 필요.

8. **`/api/admin/listings` non-minimal 경로** (line 347 근처) — 현재 `.select('*, listing_images(*)')` 이 JOIN 쓰고 있음. 자주 호출되지 않지만 같은 JOIN 문제 재현 가능. 필요 시 L-search7 구조로 통합.

---

## 다음 세션 시작 시 추천 첫 액션 (순서대로)

### 1. 상태 스냅샷

```bash
cd /sessions/<new-session>/mnt/wishes-v2
git log --oneline -10
git status --short | head -10
```

### 2. DB drift + 이미지 정책 확인

```bash
source .env.local
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/v_map_coverage_drift?select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -m json.tool
```

정상 기대값: `listings_total: 6204, mv_visible: 6179, legacy_가용: 0`.

### 3. Vercel 최신 배포 + 저작권 검증

```bash
# 공개 API 에 크롤링 이미지 누출 없는지 (L-img1-revert 검증)
curl -s "https://wishes.co.kr/api/listings?perPage=20&sortBy=newest" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('data', [])
leak = sum(1 for r in rows for im in (r.get('listing_images') or [])
           if 'wishes-image-proxy' in str(im.get('url','')) if isinstance(im, dict))
print(f'누출 {leak}건 / {len(rows)} rows')"
```

**반드시 0건 이어야 함**. 1건이라도 있으면 저작권 위반 재발 → 즉시 `src/lib/image-policy.ts` 확인.

### 4. Chrome MCP 로 /search 실전 테스트

```javascript
// 사용자 탭에서:
(async () => {
  const token = localStorage.getItem('ws_token') || '';
  const t0 = performance.now();
  const r = await fetch('/api/admin/listings?fields=minimal&_v=' + Date.now(), {
    headers: { 'Authorization': 'Bearer ' + token },
    cache: 'no-store'
  });
  const j = r.ok ? await r.json() : null;
  return { ms: Math.round(performance.now()-t0), total: j?.total, status: r.status };
})()
```

기대: `total: 6191 또는 6204`, `ms < 10000`.

### 5. 세션 유지 검증 (필요 시)

```javascript
// ws_refresh_token 유효성 서버 검증
fetch('/api/auth/refresh-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    refresh_token: localStorage.getItem('ws_refresh_token')
  })
}).then(r => r.json()).then(j => ({ ok: !!j.access_token, rotated: !!j.refresh_token }));
```

---

## 사용자 스타일 메모 (개인 팁)

* 사용자는 코딩은 안 함 — Chrome MCP + Supabase SQL Editor 로 내가 대신 수행.
* 비밀번호 안 알려줌 — 로그인 필요 작업은 "비밀번호 한 번만 입력해주세요" 부탁 후 대기.
* 이메일은 `wishes@wishes.co.kr` 자동완성 OK.
* Vercel 빌드 1~2분 대기. Push 직후 확인 금지. 최소 60-90s 대기.
* 사용자가 화낼 때: "절대 절대 절대" / "5번 반복" → 근본원인 즉시 찾아야. **표면 증상 여러 개 → 근본원인 1~2개 패턴**.
* 저작권 이슈는 **치명적** — "책임질거임?" 질문 받으면 즉시 롤백 + 주석에 경고 박제.
* 꼼꼼하게 검수 요청하면 **한 번에 끝내려 하지 말고** AskUserQuestion 으로 범위 좁힘.

---

## 작업 라벨 명명 규칙 (유지)

* `L-search<n>` — /search 포털 관련
* `L-session<n>` — 세션/인증
* `L-img<n>` — 이미지 정책
* `L-mob<n>` — 모바일 UX
* `L-status<n>` — 매물 status
* `L-geocode<n>` — 지오코딩
* `L-sec<n>` — 보안 (user 가 주로 사용)
* `L-mapmarker<n>`, `L-viewport<n>` — /map 관련
* `L-importorder<n>` — JS import 순서

새 라벨 만들 때는 카테고리 + 번호 순으로 중복 피할 것.

---

## 끝 메모

이번 세션 3 은 "0 매물 고착" 문제가 다시 터진 것으로 시작해서, 이미지 whitelist 오판으로 **저작권 노출 사고**까지 한 번 내고 (L-img1-revert 로 즉시 복구), 마지막으로 세션 유지 문제 (L-session1 → 2 → 3 진화) 까지 **세 단계 깊이까지 파고들어야** 진짜 근본원인이 나오는 어려운 세션이었음.

핵심 교훈: **supabase-js client-side session 은 믿지 말 것.** 서버 엔드포인트를 통한 refresh 만 확실. L-session3 이 이걸 증명했음.

다음 세션 Claude 에게: 이미 사용자가 많은 스트레스를 받았으므로, **추측 금지**, **무조건 증거 기반 진단**. 각 주장마다 실측 데이터 첨부. 배포 후엔 반드시 Chrome MCP 로 사용자 탭에서 검증.

Good luck.
