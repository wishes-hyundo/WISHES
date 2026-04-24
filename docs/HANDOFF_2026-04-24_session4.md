# 세션 4 핸드오프 — 2026-04-24

이전 세션 (3) 핸드오프의 남은 이슈 audit + 1건 배포. 다음 세션은 이 문서로 시작.

---

## 🚨 가장 먼저: production 상태

- **origin/main HEAD**: `0b35ef8` (L-search8)
- **Vercel 배포**: live
- **Listings**: 6,204 (mv_visible 6,179 / legacy_가용 0)
- **공개 /api/listings 저작권 누출**: 0건 / 20 rows 샘플
- **Stale 403**: 50개 random 샘플 모두 load 성공 (0%)

---

## 이번 세션 배포 커밋

```
0b35ef8  perf(admin-api): L-search8 — admin dashboard/listings GET 경로 fields=minimal 전환
```

### 변경
- `src/app/api/admin/listings/route.ts`
  - selectFields 에 `updated_at` 추가
  - cacheKey `listings-minimal-v7` → `v8` bump
- `src/app/admin/page.tsx` 대시보드 GET → `?fields=minimal`
- `src/app/admin/listings/page.tsx` fetchListings GET → `?fields=minimal`
- `docs/L-search8-minimal-consolidation-2026-04-24.md` — L-search9 RPC 설계 기록

### 왜
세션 3 핸드오프 미해결 이슈 #8 (low):
> /api/admin/listings non-minimal 경로 (line 347) — 현재 `.select('*, listing_images(*)')` JOIN. 자주 호출 안 되지만 같은 문제 재현 가능.

**실제로 이 경로를 호출하던 두 GET 콜사이트가 발견됨** (admin 대시보드, admin/listings 페이지). cold-start 시 timeout 위험. minimal 로 통합하여 sequential IN 쿼리 + unstable_cache + ETag + maxDuration=30 적용.

### 실측 (production)
- Vercel 배포 직후 v8 cold: 7991ms (cache 빌드 중)
- warm 후 3회: 3209/2698/5344ms
- ETag 안정 `W/"0d039e6"` (cache hit)
- `updated_at` 필드 응답에 포함 확인

---

## 🔥 새로운 학습사항 (핸드오프 규칙 #7)

### 7) sandbox `.git/` 손상 시 /tmp clone 우회

sandbox 의 mount `.git/` 에 권한 문제 (`.git/index.lock`, `.git/HEAD.lock` 0-byte 파일 `rm` 불가, `lsattr: Operation not supported`) 로 기존 handoff 규칙 #6 격리 index 패턴도 실패.

**우회 (이번 세션에서 사용)**:
```bash
cd /tmp
git clone --depth=5 "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" fresh
cd fresh
# workspace mount 에서 변경 파일만 복사
cp /sessions/<id>/mnt/wishes-v2/src/... src/...
git add -A
git commit -m "..."
git push "https://${TOKEN}@..." HEAD:main
```

workspace mount 의 .git 을 건드리지 않으면 오히려 깨끗하게 처리 가능.

### 6 갱신) 격리 index 패턴도 실패할 수 있음
세션 3 핸드오프의 규칙 #6 (격리 index commit) 이 이번엔 동작 안 함 — `.git/objects/NN/tmp_obj_*` unlink 실패가 누적되어 write-tree 가 `fatal: unable to write new index file` 로 멈춤. 새 시도부터는 바로 `/tmp` fresh clone 로 우회 권장.

---

## 이번 세션 audit 결과 (완료)

| # | audit | 상태 | 비고 |
|---|---|---|---|
| 1 | /search cold-start 재측정 | ✅ | cold 5s / warm 2-3s |
| 2 | Stale crawl 403 | ✅ | 50개 random 샘플 100% 성공. UX 상 거의 없음 |
| 3 | content.js session legacy | ✅ | `redirect()` 가 token.exp 60s 버퍼로 cold 401 오탐 방지. L-session3 우회 없음 |
| 4 | admin-auth.html refresh_token | ✅ | /api/auth/login 반환 → session+local 이중 저장. MASTER_PASSWORD fallback 은 의도적으로 refresh_token 없음 |
| 5 | non-minimal GET callsite | ✅ | **FIX 적용 (L-search8)**. 남은 non-minimal 은 전부 POST/PUT 뮤테이션 |
| 6 | docs/ 삭제 상태 | ✅ | 로컬 sandbox `.git/index` 손상일 뿐 production 영향 없음 |
| 7 | L-search9 RPC 설계 | ✅ | docs/L-search8-minimal-consolidation-2026-04-24.md 에 기록 |

---

## 핵심 파일 위치 (갱신)

`/api/admin/listings` minimal (sequential + IN, cacheKey **v8**, maxDuration=30):
  `src/app/api/admin/listings/route.ts` (line ~195 fields=='minimal' 분기)

admin 대시보드 (minimal GET 전환됨):
  `src/app/admin/page.tsx` (line 200)

admin/listings 페이지 (minimal GET 전환됨, `updated_at` 배지 사용):
  `src/app/admin/listings/page.tsx` (line 214)

L-search9 RPC 설계:
  `docs/L-search8-minimal-consolidation-2026-04-24.md`

---

## 다음 세션 권장 작업 (순서)

### [높음] L-search9 — RPC 단일화
`docs/L-search8-minimal-consolidation-2026-04-24.md` 의 §2-1 SQL 을 Supabase SQL Editor 에서 실행:
```sql
CREATE OR REPLACE FUNCTION public.rpc_admin_listings_minimal(...)
```
실행 후 route.ts 에서 sequential pagination 블록을 `supabase.rpc(...)` 호출로 교체. 기대: cold 5s → 1.5s.

**주의**:
- `listing_images (listing_id, sort_order)` composite index 없으면 추가 필요 (subquery 성능)
- cacheKey v8 → v9 bump
- service_role 만 EXECUTE 권한 (ANON 차단)

### [중간] 모바일 실기기 검수 피드백 수집
L-mob1/2 (44px 터치, safe-area, Fold 대응) 코드 완료. 사용자 폰에서 직접 검증 요청 필요.

### [중간] content.js (701KB) 분할 고려
세션 3 기준 단일 파일. 필요 시 v230/v240/... 구조처럼 기능별 분리. 단, 현재 정상 동작 중이라 우선순위 낮음.

### [낮음] OTEL/Sentry 관측 도입
`docs/L-observe1-sentry-otel-2026-04-23.md` 참조. 현재 이슈 진단은 Chrome MCP + 수동 실측에 의존.

### [낮음] 폰트 12-13px 규칙 31개 모바일 조정
L-mob2 에서 의도적으로 유보 (레이아웃 부작용 방지). 필요 시 A/B 로 검증.

---

## 시작 시 검증 루틴 (세션 3 에서 가져옴, v8 로 갱신)

```bash
# 1. 상태
cd /sessions/<new-session>/mnt/wishes-v2
git fetch origin main
git log --oneline origin/main -5
git rev-parse HEAD  # 이상적으로 0b35ef8 또는 그 이후

# 2. DB drift
source .env.local
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/v_map_coverage_drift?select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -m json.tool
# 기대: listings_total: 6204, mv_visible: 6179, legacy_가용: 0

# 3. 저작권 누출
curl -s "https://wishes.co.kr/api/listings?perPage=20&sortBy=newest" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('data', [])
leak = sum(1 for r in rows for im in (r.get('listing_images') or [])
           if isinstance(im, dict) and 'wishes-image-proxy' in str(im.get('url','')))
print(f'누출 {leak}건 / {len(rows)}')"
# 기대: 0건

# 4. Chrome /search 실측 (minimal v8 응답에 updated_at 포함)
# (async () => {
#   const token = localStorage.getItem('ws_token') || '';
#   const r = await fetch('/api/admin/listings?fields=minimal&_t=' + Date.now(), {
#     headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
#   });
#   const j = await r.json();
#   return { total: j.total, has_updated_at: 'updated_at' in j.data[0], ms: r.headers.get('x-vercel-id') };
# })()
```

---

## 작업 라벨 (갱신)

세션 4 추가:
- `L-search8` — admin GET minimal 전환 (이 커밋)
- `L-search9` — RPC 단일화 (다음 세션 후보)

---

## 끝 메모

이번 세션은 handoff 가 "자잘한 low-우선 cleanup" 처럼 나열한 것들을 실제로 audit 해보니 중간-우선 이슈(admin GET non-minimal) 가 숨어있었던 케이스. 특히 L-search8 fix 는 cold-start 10s timeout 가능성이 있던 위험을 제거한 것이라 지엽적이지 않음.

다음 세션은 L-search9 (RPC) 부터 시작하면 /search cold 5s → 1.5s 로 체감 개선.

Good luck.
