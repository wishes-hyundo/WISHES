# 세션 핸드오프 — 2026-04-24 (매물/사진 등록 작업)

이 문서를 다음 세션 첫 메시지에 통째로 복사/붙여넣으면 바로 이어 진행됩니다.

---

## 0. 프로젝트 컨텍스트 (매 세션 반복)

- repo: `C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2`
- stack: Next.js 15 + Kakao Maps JS SDK + Supabase (Postgres + Realtime + Auth) + Vercel 자동배포 (main branch)
- 프로덕션 URL: https://wishes.co.kr
- Supabase 대시보드: https://supabase.com/dashboard/project/xbjgdsyukjdkfvcbzmjc
- Vercel 대시보드: https://vercel.com/wishes/wishes/deployments
- git push: `TOKEN=$(grep '^GITHUB_PAT=' .env | cut -d'=' -f2) && git push "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" main`
- typecheck: `node node_modules/.typescript-iQjFuTcA/bin/tsc --noEmit --skipLibCheck 2>&1 | grep -v node_modules | head -20`

핵심 환경변수 (`.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_KAKAO_MAP_KEY`, `KAKAO_REST_API_KEY`
- `WISHES_ADMIN_MASTER_PASSWORD` (Vercel only)

---

## 1. 이번 세션 (2026-04-23~24) 전체 커밋 이력

21개 commit, /map 페이지 전면 리뉴얼 + 프라이버시/저작권 컴플라이언스 + UX 폴리싱.

### 파트 1 — Core fixes
| 커밋 | 라벨 | 내용 |
|---|---|---|
| `6ea59df` | L-viewport2, L-sidebar1, L-slidepanel1 | 3,000 cap 해제, 층 중복/단위 보정, 슬라이드 패널 복구 |
| `a4b9083` | L-sidebar1b | B1층/지하1 edge case |
| `7612e88` | L-catfix1, L-privacy1, L-slidepanel2, L-thumb2 | 주거 카테고리 필터, 비로그인 주소 마스킹, 패널 좌측 이동, 썸네일 |
| `028a0e8` | L-card3 | 네이버식 v3 전면 리뉴얼 |

### 파트 2 — 저작권·데이터 위생
| 커밋 | 라벨 | 내용 |
|---|---|---|
| `f778a05` | L-img-proxy1, L-card4, L-areafix1 | 사진 도메인, NEW 상단 이동, 단지명 노출, 5m² 임계값 |
| `29beae8` | L-imgpolicy1 | /map viewport 크롤링 사진 서버단 차단 |
| `9629bc9` | L-imgpolicy2/3, L-catcount1, L-pill1, L-minicard1 | /search 정책, 카테고리 count, 필터 pill, 미니카드 |

### 파트 3 — 지도 UX
| 커밋 | 라벨 | 내용 |
|---|---|---|
| `4e8965e` | L-tsfix1, L-mapctl1 | 지도 컨트롤 단순화 (내 위치 + 줌) |
| `9fc749d` | L-mylocation1 | geolocation 에러 메시지 개선 |
| `7c816a7` | L-mylocation2, L-imgrestore1 | GPS 정확도 + 자체 업로드 사진 복원 |
| `e749081` | L-cluster1, L-mylocation3 | 클러스터 그리드 축소 + 정확도 경고 |
| `8ddc823` | L-imgrestore2, L-photofilter1 | viewport 성능 + 사진 필터 정확도 |
| `e6b6674` | L-residential-use1 | 사무실/근린 50㎡ 미만 주거 탭 크로스 분류 |

### 파트 4 — Panel UX 완성
| 커밋 | 라벨 | 내용 |
|---|---|---|
| `a8bc630` | retry deploy | GitHub 500 복구 empty commit |
| `938da14` | L-filterpanel1 (v1) | 필터 → 우측 슬라이드 패널 |
| `9cc3208` | L-detailcache1, L-filterpanel1(pos), L-photocount1 | 패널 캐시, 위치 정합, 사진 카운트 |
| `42a5f65` | L-panelexclusive1, L-gallery1, L-newbadge1 | 필터↔매물 배타, 갤러리, NEW 노란색 |
| `8680048` | L-cardheight1 | 카드 겹침 해소 (160px 고정) |
| `f865971` | L-lightbox1, L-photocount2 | 라이트박스 + photo_count 확장 |
| `f65fc85` | L-tsfix-order1, L-filtericon1 | 패널 사이즈 380 통일 + 아이콘 |
| `3dcf196` | L-lightbox2, L-card5 | Portal 풀스크린 라이트박스 + 카드 사진수 배지 제거 |

---

## 2. 현재 /map 페이지 상태 (2026-04-24 기준)

### 레이아웃 구조
```
┌─ Header (WISHES 로고 + 검색바 + 매물내놓기 + 로그인)
├─ CategoryTabs (주거/상가·사무실/토지/투자 + count 배지)
├─ ActiveFilterPills (적용 필터 초록 ✕ 칩, 없으면 빈 슬롯)
└─ Body
    ├─ ListPanel (좌측 280-380px, 매물 리스트 카드 160px 고정)
    └─ Map Area (relative)
        ├─ Kakao 지도 canvas
        ├─ HtmlMarkerOverlay (녹색 클러스터 pin)
        ├─ MiniCard (hover 시)
        ├─ MapControls (우상단: 내 위치 + 줌 +/-)
        ├─ FilterModal (absolute left-0, z-20)      ← 카테고리 탭 클릭 시
        └─ ListingDetailModal (absolute left-0, z-30) ← 매물 클릭 시
               ↑ 둘은 배타적 — filter/detail 동시 오픈 불가
```

### 데이터 흐름
- 클라: `useViewport()` → `/api/listings/viewport?bbox+filters`
- 서버: `mv_map_listings` 쿼리 + 카테고리별 count 4-parallel + 크롤링 매물 배치 이미지 조회 (300개)
- 응답: `{ listings, counts: { residence, retail_office, land, investment } }`

### 프라이버시/저작권 정책
| 상황 | 동작 |
|---|---|
| 비로그인 viewport | `title` = 구+동까지만 / `building_name` = null |
| 로그인 viewport | 모든 필드 full |
| 크롤링 매물 (`source_site NOT NULL`) | `thumb_url` / `listing_images` 에서 self-hosted 만 통과 |
| 자체 매물 (`source_site IS NULL`) | 모든 이미지 통과 |

### Self-hosted 이미지 판별 (`src/lib/image-policy.ts`)
화이트리스트 패턴:
- `/api/images/...`
- `https://wishes.co.kr/api/images/...`
- `*.supabase.co/storage/...`
- `*.r2.dev/`, `*.r2.cloudflarestorage.com/`

크롤링 원본 도메인 (`wishes-image-proxy.wishes-img.workers.dev` 등) 은 모두 차단.

### 카드 표기 현행 (L-card3 + 후속)
```
[NEW][월세] {단지명|업종|타입}
9,000/630
원룸 · 19/60㎡ · 3/8층 · 남동향
봉천역 초역세 신축 옥탑층 깨끗한 원룸   ← ai_title (없으면 skip)
[10년이내] [풀옵션]                     ← NEW/연식/타입 chip (단일 행, overflow hidden)
확인매물 26.04.22                       ← updated_at 기준 (카드 하단 고정)
                                        썸네일 108px 우측 align-stretch
```

고정: 카드 높이 160px, flex-nowrap + overflow-hidden 로 겹침 방지.

### 슬라이드 패널 (상세)
- 너비 380px (필터와 통일)
- Hero: 220px 사진 갤러리 (← → 화살표 + 도트 인디케이터 + N/M 카운터)
- Hero 클릭 → **Portal 로 document.body 에 fixed inset-0 라이트박스** (95vw × 95vh)
- 헤더 배지: [NEW][월세][매물번호 N][업종][연식] (NEW 노란색 amber-400)
- 본문: 기본정보 / 타입별 추가 (주거/상가/토지 동적) / 옵션 칩
- 푸터: [닫기] [전체보기 → /listings/[id]]

### DB 실측 (2026-04-23 23:00)
| 지표 | 수치 |
|---|---|
| listings 전체 | 6,204 |
| mv_visible | 6,179 |
| `source_site IS NULL` (자체 등록) | **0** |
| `source_site = 'gongsilclub'` (크롤링) | 6,204 |
| listing_images 에 자체 업로드 이미지 | **57장 / 5개 매물** (46163, 46363, 46183, 47155, 46114) |

---

## 3. ⚠️ 반드시 피해야 할 함정

### A. Edit/Write 툴 VFS desync
- Edit/Write 툴은 Windows 파일시스템에 쓰지만 bash VFS 는 간헐적으로 stale 상태 유지
- 증상: Read 는 업데이트된 내용 보여주는데 bash `wc -l`, `cat` 은 옛날 버전
- **대응**: 크고 구조적인 변경은 **`cat > file <<EOF` bash heredoc** 또는 **python3 heredoc** 으로 직접 작성

### B. Git index corruption (반복적)
- 증상: `error: bad signature 0x00000000` / `fatal: index file corrupt`
- 원인: 사용자 로컬 IDE/agent 와 동시 접근
- **대응**: 커밋은 index 우회 plumbing 으로 — 다음 Python 스니펫 템플릿:
  ```python
  # hash-object + write-tree + commit-tree + update-ref
  # /tmp/tmp-git-index<N> 에 read-tree FETCH_HEAD → update-index cacheinfo → write-tree
  # commit-tree -p <parent> -m "..." <tree>
  # update-ref refs/heads/main <commit_sha>
  ```
- 이번 세션 내내 이 방식으로 21개 commit 성공

### C. 파일 삭제 권한
- `.git/index`, `.git/ORIG_HEAD`, `.git/REBASE_HEAD` 등 삭제 필요 시
- **`mcp__cowork__allow_cowork_file_delete`** 를 먼저 호출해 권한 획득

### D. Vercel 빌드 실패 (GitHub HTTP 500)
- 증상: "There was a permanent problem cloning the repo"
- 원인: GitHub 일시 장애 (내 코드 아님)
- **대응**: empty commit push 로 재배포 트리거

### E. TypeScript strict — 변수 선언 순서
- `useEffect` 가 참조하는 `useState` 변수는 반드시 **useEffect 앞에** 선언
- "used before declaration" 빌드 실패 자주 발생

### F. CSS `transform` 과 `position: fixed` 호환성
- 부모에 `translate-x`, `scale` 등 transform 속성이 있으면 **자식 fixed 가 그 영역에 갇힘**
- 풀스크린 오버레이는 반드시 **React createPortal** 로 document.body 루트에 렌더

---

## 4. 다음 세션 스코프: 매물 등록 및 사진 등록 🎯

### 현재 인프라 (이미 구축됨)
- **이미지 업로드 API**: `/api/listings/[id]/images` (POST) — R2 업로드, 최대 20장, JPEG/PNG/WebP/GIF, 10MB/장
  - Helper: `src/lib/r2.ts` `uploadToR2(key, buf, mime)`
  - URL 형식: `https://wishes.co.kr/api/images/listings/{id}/{timestamp}_{i}.{ext}`
- **매물 등록 API**: `/api/admin/listings` (POST) — zod schema validation
  - 지오코딩: 클라가 lat/lng 안 보내면 서버가 `geocodeAddress(address)` 로 자동 채움
- **관리자 UI 페이지들** (`src/app/admin/`):
  - `/admin/listings` — 매물 목록
  - `/admin/listings/new` — 신규 등록
  - `/admin/listings/[id]/edit` — 수정
  - `/admin/listings/bulk-upload` — 대량 업로드 (excel)
  - `/admin/dedup` — 중복 정리
- **인증**: `verifyAdminAuth()` / `src/lib/adminAuth.ts`

### 작업 가능한 방향
1. **`/admin/listings/new` 폼 개선** — UX, 유효성, 사진 업로드 flow
2. **사진 업로드 드래그&드롭** — 다중 선택, 미리보기, 진행률 표시, 자동 썸네일 지정
3. **이미지 에디터** — 크롭, 회전, 필터 (sharp 기반 서버 처리)
4. **대량 등록 개선** — `bulk-upload` 의 excel 파싱, 매핑 UI, 실패 항목 리포트
5. **매물 수정 flow** — 인라인 편집, 버전 이력, 변경사항 diff
6. **공개/비공개 전환 UX** — 상태 일괄 변경, 만료일, 거래완료 처리
7. **자체 등록 flag** — `source_site = NULL` 강제 저장 (DB 에 현재 자체 등록 0건, 이거부터 활성화 필요)

### 사용자 명시 방향
- "**사진 등록 및 매물 등록**" 에 집중
- 상세 요구사항은 새 세션에서 질문

### 시작 시 체크리스트
```bash
cd "/sessions/<new>/mnt/wishes-v2"
git log --oneline -5                              # 최신 HEAD = 3dcf196 이거나 그 이후
git status --short | head -5
```

### 빠른 탐색 포인트
- `src/app/admin/listings/new/page.tsx` — 신규 등록 폼
- `src/app/admin/listings/[id]/edit/page.tsx` — 수정 폼
- `src/app/api/listings/[id]/images/route.ts` — 이미지 POST (현재 정상, L-imgpolicy2 적용됨)
- `src/app/api/admin/listings/route.ts` — 매물 CRUD
- `src/lib/r2.ts` — R2 업로드 헬퍼
- `src/lib/image-policy.ts` — self-hosted 판별 (변경 금지 — 저작권 정책)
- `src/lib/geocode.ts` — 카카오 지오코딩
- `src/components/ExcelUpload.tsx` — 대량 업로드 UI
- `src/types/index.ts` — Listing type

---

## 5. 중요 미해결/알림

1. **`mv_map_listings` 재정의 SQL migration** (선택 작업)
   - 현재 배치 쿼리(300개 제한) 로 자체업로드 썸네일 복원 중
   - 근본 해결: MV 에서 `thumb_url` 을 `listing_images` 에서 self-hosted 우선 선택하도록 재작성
   - 이점: 300개 제한 해제, viewport 응답 latency 개선
   - 작업자: 사용자가 Supabase SQL Editor 에서 직접 실행 필요
   - 파일: `supabase/migrations/` 에 새 파일 작성 후 실행

2. **`source_site IS NULL` 자체 등록 실적 0건**
   - 현재 admin 에서 등록해도 source_site 가 설정되는 경로 존재 가능
   - 매물 등록 작업 시 zod schema 및 insert 로직 점검 필수 (route.ts 508라인 근처)

3. **데이터 품질 이슈**
   - `area_m2 < 5` 쓰레기 데이터 (0.1, 0.5 등) — 클라이언트에서 `formatArea` 가 필터. 서버에서도 정리 고려
   - `built_year` null/이상치 — 현재 `formatAgeBadge` 가 방어

4. **아이콘 시스템 선택** (보류)
   - 옵션 A (이모지) / B (Phosphor Duotone) / C (Heroicons Solid) / D (Custom SVG)
   - 미리보기 widget 은 확인됨, 사용자 선택 대기 중
   - 현재 FilterModal 헤더: Lucide 아이콘 (Home/Building2/Trees/TrendingUp)

---

## 6. 첫 메시지 추천 템플릿

> 이전 세션에서 /map 페이지 리뉴얼 완료했고 이제 매물 등록 및 사진 등록 작업 들어갑니다.
>
> 우선 `/admin/listings/new` 페이지 상태 점검하고 UX 개선점 찾아줘. 특히 **사진 업로드 flow** (드래그&드롭, 미리보기, 썸네일 지정) 부분을 네이버·당근 수준으로 끌어올리고 싶어.
>
> 진행 전에 `HANDOFF_2026-04-24_listings_photos.md` 참고해서 컨텍스트 파악하고, 현재 `/admin/listings/new` 의 폼 구조랑 `/api/listings/[id]/images` POST 스펙 요약부터 보여줘.

끝. 굳건히 이어가 주세요.
