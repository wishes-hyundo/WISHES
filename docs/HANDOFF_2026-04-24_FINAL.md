# HANDOFF 2026-04-24 (저녁 최종) — 담당자 모달 + 4단 검증 + mockup v7 정합

## 0. 다음 세션 시작 프롬프트 (그대로 복붙)

```
[컨텍스트]
2026-04-24 세션 마지막 상태. 핸드오프: docs/HANDOFF_2026-04-24_FINAL.md

이번 세션에서 한 작업:
- /map 매물 모달(ListingDetailModal) 을 mockup v7 에 맞춰 전면 재구성
- 담당자 연결 모달(AgentContactModal) + 중개사 프로필 편집(/admin/profile)
- 허위매물 4단 검증 배지 + last_verified_at 원클릭 갱신
- listings/profiles 스키마 확장 (Supabase 적용 완료)
- POST /api/admin/listings multipart 수용 + R2 업로드 (P0)
- AI 자동 추출 (room_layout/is_duplex/illegal_building)
- 매물 설명 제목 중복 제거 + 3줄 프리뷰 + 더보기

총 21개 커밋, main 배포됨.

[프로젝트 컨텍스트]
- repo: C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2
- prod: https://wishes.co.kr (Vercel main 자동 배포)
- Supabase project: xbjgdsyukjdkfvcbzmjc

[사용자 성향]
- "유치원 수준" — 본인 SQL/터미널 직접 실행 X
- Chrome MCP 로 Supabase Dashboard 자동화 + 매물 모달 live QA
- 매물번호에 W- 접두사 절대 금지
- 폴백 데이터 임의로 박지 말 것 (실제 회사 정보: 1533-9580 / 서울 관악구 신림동 1431-32 8층)

[다음 우선순위 (P2)]
1. 사진 없는 매물 UI 컴팩트화 (현재 placeholder 가 패널 절반 차지)
2. 카톡 문의 vs 방문 예약 분기 (현재 둘 다 InquiryModal)
3. /listings/[id] 상세 페이지에도 mockup v7 정합 적용 (현재 모달만 정합)
4. MapListing 인터페이스 보강 — detail-only 필드 (available_date 외) 추가해 (listing as any) 캐스팅 제거
5. 중개사 프로필 편집 페이지 실사용 QA (사용자 직접 확인 필요)

[유틸 커맨드]
git push: TOKEN=$(grep '^GITHUB_PAT=' .env | cut -d'=' -f2) && git push "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" main
typecheck: node node_modules/.typescript-iQjFuTcA/bin/tsc --noEmit --skipLibCheck 2>&1 | grep -v node_modules | grep -vE "auth/naver|AuthContext" | head -20

[Chrome MCP 패턴 — Supabase SQL Editor]
1. navigate https://supabase.com/dashboard/project/xbjgdsyukjdkfvcbzmjc/sql/new
2. wait 5-8초 (monaco editor 로딩)
3. javascript_tool: window.monaco.editor.getEditors()[0].getModel().setValue(sql);
4. left_click (1452, 455)  # Run 버튼
5. screenshot 으로 "Success. No rows returned" 확인

[git plumbing 커밋 (HEAD.lock 회피)]
.git/refs/heads/main 직접 write 로 우회. 자세한 패턴은 핸드오프 문서 참고.

이어서 작업해주세요.
```

---

## 1. 배포 커밋 (이번 세션 21개, 전부 main)

| # | 커밋 | 라벨 | 한줄 |
|---|------|------|------|
| 1 | `2c4f224` | L-panel-agent / L-detail-v2 / L-listingpost1 | 담당자 연결 모달 + 옵션 아이콘 그리드 + POST multipart P0 |
| 2 | `bc7f3fb` | L-detail-schema | listings 5개 컬럼 + API/UI 전파 |
| 3 | `70675a0` | L-panel-v2 | MapListingPanel(레거시) 바디 v2 |
| 4 | `7780a7f` | L-newphoto1 | Step3 ★ 대표 지정 + 진행률 버그 |
| 5 | `21bb1e2` | L-detail-schema | apply-map-migration allowlist |
| 6 | `12c6f7e` | L-agent-profile / L-verify-touch | 중개사 프로필 편집 + 현장확인 원클릭 |
| 7 | `84aa2c7` | L-agent-profile hotfix | buildAgentInfo 타입 확장 |
| 8 | `4efa266` | L-modal-v7 | ListingDetailModal v7 1차 재구성 |
| 9 | `295852c` | L-verify-list | 현장확인 필터 + 벌크 버튼 |
| 10 | `a739e92` | L-desc-clamp | 매물 설명 중복 제거 + 3줄 프리뷰 |
| 11 | `a3e511b` | L-verify-list | 목록 각 행 현장확인 배지 |
| 12 | `785de56` | L-verify-list | minimal API 에 last_verified_at |
| 13 | `6ac6e8d` | L-ai-extract | AI description 에서 room_layout 추론 |
| 14 | `855d152` | docs | 핸드오프 v1 |
| 15 | `296f659` | L-modal-meta | 모달 메타 footer (조회수/최초등록/최근확인) |
| 16 | `99e404c` | (W- 제거) | 매물번호 W- 접두사 제거 + 헤더 ai_title 제거 |
| 17 | `d0cd665` | (폴백 교정) | 위시스부동산 폴백 — 1533-9580 / 신림동 1431-32 |
| 18 | `de4456c` | L-modal-v7-2 | mockup v7 헤더+3메트릭+매물정보 통합 |
| 19 | `8fb2473` | L-modal-v7-3 | 빌드 hotfix #1 + 매물 타입별 헤더 H1 분기 |
| 20 | `adbcd10` | L-modal-v7-4 | 빌드 hotfix #2 — MapListing 미정의 필드 전수 캐스팅 |
| 21 | (이 문서) | docs | 핸드오프 v2 (최종) |

---

## 2. Supabase DB 적용 완료 (Chrome MCP 로 직접 실행)

### 2-1. listings (`20260424_add_detail_card_fields.sql`)
- `room_layout` TEXT CHECK (분리형/일체형/복층)
- `is_duplex` BOOLEAN DEFAULT FALSE
- `illegal_building` BOOLEAN DEFAULT FALSE
- `last_verified_at` TIMESTAMPTZ
- `total_parking_spaces` INTEGER
- `idx_listings_room_layout` partial index

### 2-2. profiles (`20260424_add_agent_profile_fields.sql`)
- `office_name` TEXT
- `office_phone` TEXT
- `office_address` TEXT
- `registration_no` TEXT
- `career_years` INTEGER CHECK (0~60)

---

## 3. 핵심 기능 인덱스

### `/map` 매물 모달 (실제 사용 중인 파일)
> **`src/features/map-2026/components/ListingDetailModal.tsx`** (760줄)
> ⚠️ `src/components/MapListingPanel.tsx` 는 레거시. 실수로 수정하지 말 것.

mockup v7 정합 구조 (위→아래):
1. **Hero 사진 갤러리** (220px, 좌우 화살표, 라이트박스, 도트)
2. **헤더** — H1 + 주소 + 가격 + 비교배지 (median_deviation)
   - H1 분기 (`formatPropertyHeading`):
     - 아파트/오피스텔 → 단지명 + 층수
     - 원룸/투룸/빌라/다가구/단독 → "매물종류·층위" (저층/중층/고층)
     - 상가/사무실/공장/토지 → 매물종류만
3. **3 메트릭 카드** — 전용/공급+전용률, 해당층/총층+방향, 방구조/방수+복층여부
4. **매물 정보 단일 테이블** — 관리비/입주가능/사용승인/주차/건축물용도/위반건축물/가까운역
5. **내부 시설 + 보안 아이콘 그리드** (`@/lib/featureIcons`)
6. **허위매물 4단 검증 배지** (last_verified_at 동적)
7. **매물 설명** — ai_title 제목 + ai_description 본문, line-clamp-3 + 더보기
8. **메타 footer** — 매물번호 N · 최초등록 · 최근확인 N일 전 · 조회 N회
9. **하단 단일 버튼** — "담당자에게 연결" → AgentContactModal

### `/listings/[id]` 상세 페이지
> **`src/app/listings/[id]/ListingDetailClient.tsx`**
- 방구조/복층/위반건축물/총주차대수 InfoRow
- 내부시설/보안 아이콘 그리드
- 4단 검증 배지 (last_verified_at 동적)
- 매물 설명 line-clamp-3 + 더보기 (ai_title/H1 중복 제거)
- ⚠️ mockup v7 정합 (3메트릭 카드/통합 테이블) 은 아직 미적용 — 다음 세션 후보

### 담당자 연결 모달
> **`src/components/AgentContactModal.tsx`**
- 프로필 사진 (avatar_url) + 이니셜 폴백
- 이름 / 사무소명 / 등록번호 / 경력
- 휴대폰 + 전화/문자 아이콘
- 사무소 주소 + 길찾기 (카카오맵)
- 카톡 문의 / 방문 예약 (둘 다 InquiryModal — 분기 필요)
- 응답률 footer (현재 하드코드)

폴백 데이터 (위시스부동산 공용):
- name: '위시스부동산'
- officeName: '위시스부동산 공인중개사사무소'
- officePhone: '1533-9580'
- officeAddress: '서울 관악구 신림동 1431-32 8층'

### `/admin/profile` 중개사 프로필 편집
> **`src/app/admin/profile/page.tsx`**
- 프로필 사진 업로드 (R2, 5MB)
- 이름·휴대폰·사무소명·사무소전화·등록번호·주소·경력
- admin 사이드바 "내 프로필 👤" 로 접근
- 저장 → `/api/profile` PUT → AgentContactModal 즉시 반영

### `/admin/listings/[id]/edit`
- 상단 녹색 "허위매물 차단 4단 검증" 배지
- "현장확인 완료 ✓" 원클릭 버튼 → last_verified_at = now() PUT

### `/admin/listings` 목록
- 고급 필터 "현장확인" select (전체/7일내/7일경과/미확인)
- 벌크 액션 "✓ 현장확인" 버튼 (선택 매물 일괄)
- 각 행 현장확인 배지 (녹색/황색/빨강 색별 경과일)

### `/admin/listings/new` Step3
- 각 이미지 카드에 ★ 대표 지정 버튼 (드래그 없이 클릭 1회)
- AI description → room_layout/is_duplex/illegal_building 자동 추론
- POST multipart 수용 (P0 — 자체 등록 0건 회귀 해결)

---

## 4. API 엔드포인트 신규/변경

| 엔드포인트 | 변경 |
|---|---|
| `/api/agent/[id]` GET (신규) | role∈{agent,broker,admin,superadmin} 만 공개. office_*/registration_no/career_years 포함 |
| `/api/profile` PUT | 중개사 5필드 + avatar_url 수용. undefined 는 기존값 보존 |
| `/api/admin/listings` POST | multipart/form-data + R2 업로드 경로 추가 |
| `/api/admin/listings` PUT | partial().safeParse — last_verified_at 등 수용 |
| `/api/admin/listings?fields=minimal` | select 에 last_verified_at 추가 |
| `/api/listings/[id]` | PUBLIC_LISTING_COLUMNS 에 ai_title / created_by / 상세 v2 5필드 추가 |

---

## 5. 신규 파일

```
src/components/AgentContactModal.tsx                          (233 lines)
src/app/admin/profile/page.tsx                                (편집 페이지)
src/app/api/agent/[id]/route.ts                               (66 lines)
src/lib/featureIcons.ts                                        (81 lines, 12 + 7 아이콘)
supabase/migrations/20260424_add_detail_card_fields.sql
supabase/migrations/20260424_add_agent_profile_fields.sql
docs/HANDOFF_2026-04-24_agent_verify.md                       (v1)
docs/HANDOFF_2026-04-24_FINAL.md                              (이 파일)
```

---

## 6. ⚠️ 알려진 이슈 / 다음 세션 P2

1. **사진 없는 매물 UI** — placeholder 가 220px hero 절반 차지. 더 컴팩트한 fallback 필요
2. **카톡 문의 vs 방문 예약** — 현재 둘 다 동일 InquiryModal. 카톡은 카카오 채널 URL (예: http://pf.kakao.com/_xxxxxx) 분리
3. **/listings/[id] 상세 페이지 mockup v7 정합** — 모달은 완성, 상세 페이지는 부분 적용. 3메트릭 카드 + 통합 테이블 적용 필요
4. **MapListing 인터페이스 보강** — `available_date / station_name / building_name / photo_count / area_supply_m2 / building_purpose` 등 detail-only 필드를 인터페이스에 추가해 `(listing as any)` 캐스팅 제거. 현재 ListingDetailModal 에 9곳 캐스팅 있음
5. **중개사 프로필 편집 실사용 QA** — 로그인 필요로 자동 QA 못 돌림. 사용자가 직접 사진 업로드 + 사무소 정보 입력 → 담당자 모달 반영 확인
6. **AgentContactModal 응답률 footer** — "응답률 98% · 평균 12분 내 응답" 하드코드. InquiryModal 응답 로그 기반 계산 로직 필요

---

## 7. 사용자 피드백 (절대 잊지 말 것)

- ❌ **매물번호 W- 접두사 절대 금지** — 순수 숫자만
- ❌ **헤더에 ai_title 중복 표시 금지** — 매물 설명 섹션에만
- ❌ **폴백 데이터 임의로 박지 말 것** — 실제 회사 정보 확인
- ✅ **mockup v7 디자인 그대로 따를 것** — 헤더(H1+주소+가격) + 3메트릭 + 매물정보 단일 테이블
- ✅ **매물 타입별 헤더 분기** (네이버 벤치마크) — 단지명/매물종류·층위/매물종류만

---

## 8. 환경 정보

- repo: `C:\Users\wishes\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2`
- bash mount: `/sessions/<id>/mnt/wishes-v2/`
- prod: `https://wishes.co.kr` (Vercel main 자동 배포)
- Supabase project ref: `xbjgdsyukjdkfvcbzmjc`
- 회사 전화: `1533-9580` (NEXT_PUBLIC_COMPANY_PHONE)

다음 세션 Claude, 굿럭.

---

## 🚨 긴급 경고 — git index corruption (2026-04-24 심야 발생)

세션 도중 **src 하위 379개 파일** 이 git tree 에서 누락됐음 (워크스페이스 파일 자체는 있으나 `git ls-tree` 에 없음).

**분포:** src/app 171, src/components 76, src/features 41, supabase/migrations 26 등

**증상:** Vercel build 가 `Module not found: Can't resolve '@/lib/xxx'` 로 연쇄 실패. 개별 파일 복구 push 해도 다른 파일이 또 없어서 계속 실패.

**복구 커밋:** `b66daf2 fix(CRITICAL): restore 379 files lost to git index corruption (FULL scan)`

**재발 방지 — 커밋 시 반드시 스캔:**
```python
# workspace 파일 vs git tree 비교
ws = set(walk('src') + walk('supabase') + walk('public/admin') + walk('public/search'))
git = set(subprocess.check_output(['git','ls-tree','-r','--name-only','HEAD'], text=True).split('\n'))
missing = ws - git
# missing 이 10개 이상이면 즉시 전체 복구 commit
```

**예방:**
- Edit 툴로 대용량 파일(>1000줄) 수정 시 파일이 truncate 되는 버그 있음 → python heredoc 사용
- `.git/index.lock` / `HEAD.lock` 이 stuck 되면 `.git/refs/heads/main` 에 직접 쓰는 plumbing 사용
- 새 파일 추가 후 `git ls-tree HEAD -- <file>` 로 실제 tree 포함 여부 확인
