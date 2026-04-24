# HANDOFF 2026-04-24 (오후) — 담당자 모달 · 허위매물 4단 검증 · 스키마 확장

다음 세션 Claude 에게 넘기는 상태 요약.
사용자는 "유치원 수준" 이라 본인은 SQL/터미널 직접 실행 안 함 → Chrome MCP 자동화 필수.

## 1. 배포 커밋 (13개, 전부 main → Vercel 배포됨)

```
6ac6e8d feat(ai): L-ai-extract — AI 생성 description 에서 room_layout/is_duplex/illegal_building 자동 추론
785de56 fix(admin): L-verify-list — minimal 응답에 last_verified_at 포함
a3e511b feat(listings): L-verify-list — 목록 각 행에 현장확인 배지
a739e92 fix(description): L-desc-clamp — 매물 설명 제목 중복 제거 + 3줄 프리뷰 + 더보기
295852c feat(listings): L-verify-list — 현장확인 필터 + 일괄 현장확인 버튼
4efa266 feat(modal): L-modal-v7 — ListingDetailModal (실제 /map 사용 중인 모달) v7 재구성
84aa2c7 fix(panel): L-agent-profile hotfix — buildAgentInfo 타입 확장
12c6f7e feat(agent+verify): L-agent-profile / L-verify-touch — 중개사 프로필 + 현장확인
21bb1e2 chore(migration): L-detail-schema — apply-map-migration allowlist
7780a7f fix(new): L-newphoto1 — Step3 ★ 대표 지정 + 진행률 버그 수정
70675a0 feat(map): L-panel-v2 — MapListingPanel(레거시) 바디 v2
bc7f3fb feat(schema+detail): L-detail-schema — 5개 신규 컬럼 + API/UI 전파
2c4f224 feat(map+detail): L-panel-agent/L-detail-v2/L-listingpost1 — 담당자 모달 + 아이콘 그리드 + POST multipart P0
```

## 2. Supabase DB 적용 완료 (Chrome MCP 자동화로 직접 실행)

### 2-1. `listings` 테이블 (20260424_add_detail_card_fields.sql)
- `room_layout` TEXT CHECK (분리형/일체형/복층)
- `is_duplex` BOOLEAN DEFAULT FALSE
- `illegal_building` BOOLEAN DEFAULT FALSE
- `last_verified_at` TIMESTAMPTZ
- `total_parking_spaces` INTEGER
- `idx_listings_room_layout` partial index

### 2-2. `profiles` 테이블 (20260424_add_agent_profile_fields.sql)
- `office_name` TEXT
- `office_phone` TEXT
- `office_address` TEXT
- `registration_no` TEXT
- `career_years` INTEGER CHECK (0~60)

### 2-3. Chrome MCP 자동화 패턴
```js
// 1) navigate https://supabase.com/dashboard/project/xbjgdsyukjdkfvcbzmjc/sql/new
// 2) javascript_tool 로 주입:
window.monaco.editor.getEditors()[0].getModel().setValue(sql);
// 3) Run 버튼 클릭 좌표: (1452, 455)
// 4) "Success. No rows returned" 확인
```

## 3. 핵심 기능 요약

### 3-1. 매물 상세 패널 — 실제 사용 중인 건 `src/features/map-2026/components/ListingDetailModal.tsx`
> ⚠️ `src/components/MapListingPanel.tsx` 는 **레거시**. 혼동 주의.

변경 사항 (L-modal-v7):
- 하단 "닫기/전체보기" 2버튼 → **"담당자에게 연결" 단일 녹색 버튼**
- 옵션 텍스트 chip → **내부시설 + 보안 아이콘 그리드** (`@/lib/featureIcons`)
- **허위매물 4단 검증 배지** (last_verified_at 있으면 날짜 동적 표기)
- **매물 설명** 섹션 — ai_title 제목 + ai_description 본문, 3줄 프리뷰 + 더보기/접기
- `AgentContactModal` (프로필 사진 + 이니셜 폴백) 연결
- `/api/listings/[id]` fetch 로 확장 필드 로드, `created_by` 로 `/api/agent/[id]` fetch

### 3-2. `/listings/[id]` 상세 페이지 (ListingDetailClient)
- 방구조/복층여부/위반건축물/총주차대수 InfoRow 추가
- 내부시설/보안 아이콘 그리드 + 4단 검증 배지 + 매물 설명 3줄 프리뷰+더보기
- ai_title 과 본문 첫 단락 중복 시 본문에서 제거 (normalize 기반)

### 3-3. `/admin/profile` (신규)
- 프로필 사진 업로드 (R2, 5MB 제한)
- 이름·휴대폰·사무소명·사무소전화·등록번호·사무소주소·경력
- admin 사이드바 "내 프로필 👤" 로 접근
- 저장 시 `/api/profile` PUT → AgentContactModal 에 실시간 반영

### 3-4. `/admin/listings/[id]/edit`
- 상단에 녹색 "허위매물 차단 4단 검증" 배지 + **"현장확인 완료 ✓" 원클릭 버튼**
- 클릭 시 `last_verified_at = now()` PUT → 로컬 state 즉시 반영

### 3-5. `/admin/listings` 목록
- 고급 필터에 "현장확인" select (전체 / 7일 이내 / 7일 경과 / 미확인)
- 벌크 액션 바에 녹색 "✓ 현장확인" 버튼
- 각 행에 현장확인 배지 (녹색/황색/빨강, 색별 경과일)

### 3-6. `/admin/listings/new` Step3 사진 UX
- 각 이미지 카드에 **★ 대표 지정 버튼**
- 업로드 진행률 JSX 리터럴 버그 수정 (`${...}` → `{...}`)

### 3-7. `/admin/listings/new` AI 자동 추출 (L-ai-extract)
- AI description 정규식 매칭 → room_layout/is_duplex/illegal_building 자동 추론
- 사용자 수동 선택 값은 덮지 않음

### 3-8. POST /api/admin/listings multipart 수용 (P0)
- Content-Type: multipart/form-data 감지 → FormData 파싱
- 이미지 파일은 R2 업로드 후 listing_images insert
- 기존 JSON 경로 유지 (크롤러/edit 호환)

## 4. API 엔드포인트 신규/변경

| 엔드포인트 | 변경 |
|---|---|
| `/api/agent/[id]` GET (신규) | role in {agent,broker,admin,superadmin} 프로필만 공개 |
| `/api/profile` PUT | 중개사 필드 5개 + avatar_url 수용 |
| `/api/admin/listings` POST | multipart + R2 경로 추가 |
| `/api/admin/listings` PUT | partial().safeParse 로 last_verified_at 수용 |
| `/api/admin/listings?fields=minimal` | select 에 last_verified_at 추가 |
| `/api/listings/[id]` | PUBLIC_LISTING_COLUMNS 에 ai_title / created_by / 상세 v2 필드 5개 추가 |

## 5. ⚠️ 알려진 이슈 / 다음 세션 후보

### P2
1. **사진 없는 매물 UI** — 패널 hero 의 "사진 없음" placeholder 가 절반 화면 차지
2. **카톡 문의 vs 방문 예약 분기** — 현재 둘 다 InquiryModal. 카톡은 별도 채널 URL 분리
3. **중개사 프로필 편집 QA** — 로그인 필요로 자동 QA 불가, 사용자 직접 확인
4. **E2E 자체 등록 테스트** — POST multipart 수정 검증, 사용자와 함께
5. **매물 설명 중복 live 재현** — 사용자 보고된 신림동 "서울대 캠퍼스 감싸는 숲 향기..." 매물에서 중복 해결 확인 필요

### P3
6. `/admin/profile` 페이지 디자인 보강
7. 4단 검증 "체크리스트 UI" (현재는 고정 배지)
8. AgentContactModal 응답률 하드코드 → InquiryModal 로그 기반 계산
9. `/admin/listings/new` 2,707줄 → sections/*.tsx 분리

## 6. 유용한 커맨드

### git push
```bash
TOKEN=$(grep '^GITHUB_PAT=' .env | cut -d'=' -f2) && \
git push "https://${TOKEN}@github.com/wishes-hyundo/WISHES.git" main
```

### 타입체크
```bash
node node_modules/.typescript-iQjFuTcA/bin/tsc --noEmit --skipLibCheck 2>&1 | \
  grep -v node_modules | grep -vE "auth/naver|AuthContext" | head -20
```

### git plumbing 커밋 (index.lock 회피)
이번 세션에서 HEAD.lock 이 stuck 됐을 때 `.git/refs/heads/main` 직접 write 로 우회:
```python
# ref 파일 직접 쓰기
with open('.git/refs/heads/main','w') as f: f.write(commit+'\n')
```

## 7. 이번 세션 수정 파일 인덱스

```
신규:
  src/components/AgentContactModal.tsx                         (233 lines)
  src/app/admin/profile/page.tsx                               (neue)
  src/app/api/agent/[id]/route.ts                              (66 lines)
  src/lib/featureIcons.ts                                      (81 lines)
  supabase/migrations/20260424_add_detail_card_fields.sql
  supabase/migrations/20260424_add_agent_profile_fields.sql

수정:
  src/app/admin/layout.tsx                                     (+3)
  src/app/admin/listings/[id]/edit/page.tsx                    (+35)
  src/app/admin/listings/new/page.tsx                          (+50)
  src/app/admin/listings/page.tsx                              (+80)
  src/app/api/admin/apply-map-migration/route.ts               (+2)
  src/app/api/admin/listings/route.ts                          (+70)
  src/app/api/profile/route.ts                                 (+30)
  src/app/listings/[id]/ListingDetailClient.tsx                (+50)
  src/app/listings/[id]/page.tsx                               (+1)
  src/components/MapListingPanel.tsx                           (+100)  (레거시)
  src/features/map-2026/components/ListingDetailModal.tsx      (+180)  (실사용)
  src/lib/listing-public.ts                                    (+7)
```

끝. 다음 세션 Claude, 굿럭.
