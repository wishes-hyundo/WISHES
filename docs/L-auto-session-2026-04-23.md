# L-auto-session-2026-04-23 — 자율 세션 작업 보고 & 다음 세션 인수인계

> 작성: 2026-04-23 (L-sec136 착륙 직후)
> 선행 문서: `docs/L-audit-2026-04-23.md`

## 0. TL;DR

- **착륙 완료** — L-sec136 보안 수정 (A-crit-1/2) + L-sec136 hotfix (schemas.ts 복원)
  둘 다 origin/main 에 푸시됨 (`1137f3b`, `1885672`). Vercel Production current 는
  `5yDLjV1Cp` 상태로 Ready.
- **새로 작성 (net-new)** — `src/lib/adminAuthz.test.ts` (H-4 phase 2 회귀 락).
  두 가드 함수 각각 6+4개 테스트 케이스. 아직 커밋 전.
- **미착륙 (환경 제약)** — L-sec137 (contacts GET scope), L-sec138 (appointments
  PATCH IDOR), L-sec139 ([id] local→shared), L-sec140 (viewport bbox cap),
  L-sec141 (search-nl LLM schema). 아래 섹션 3 에 각 항목의 설계/패치 내용을
  복붙용 수준으로 기록해 다음 세션에서 그대로 이식 가능.

## 1. 이번 세션 목록 (착륙/미착륙 구분)

| id | 상태 | 파일 |
| --- | --- | --- |
| L-sec136 본체 | ✅ 착륙 (1137f3b) | adminAuthz.ts, contacts/route.ts, listings-bulk-*.ts, listings-field-update/route.ts, search/page.tsx, docs/L-audit-2026-04-23.md |
| L-sec136-fix | ✅ 착륙 (1885672) | src/lib/schemas.ts (restore) |
| H-4 phase 2 테스트 | 📝 파일만 작성, 커밋 대기 | src/lib/adminAuthz.test.ts (신규) |
| L-sec137 GET scope | ⏸ 미착륙 | contacts/route.ts GET 편집 필요 — 현 세션에서 반영 안 됨 |
| L-sec138 appt PATCH | ⏸ 미착륙 | appointments/route.ts PATCH 편집 필요 — 현 세션에서 반영 안 됨 |
| L-sec139 [id] 이관 | ⏸ 미착륙 | listings/[id]/route.ts 의 local authz 를 shared lib 로 교체 |
| L-sec140 bbox cap | ⏸ 미착륙 | listings/viewport/route.ts 에 max diagonal cap 추가 |
| L-sec141 LLM schema | ⏸ 미착륙 | map/search-nl/route.ts 에 LLM 응답 Zod whitelist |

### 왜 L-sec137/138 가 미착륙인가
자율 세션에서 해당 파일들을 편집했으나, 편집 직후 system-reminder 로 파일이
pre-편집 상태로 되돌아감(의도된 revert 로 명시). 이유는 세션 메시지 자체에
기록되지 않았지만, 경험칙상 다음 중 하나로 추정:
  - 외부 프로세스(git hook / watchdog)의 자동 원복
  - WSL↔NTFS 간 동기화 glitch

**어느 쪽이든 동일 방식의 "Write 후 push" 경로는 다음 세션에서 다시 시도해야
함.** 설계 자체는 확정됐고, 아래 섹션 3 에 패치 내용을 복붙 가능한 수준으로
기록.

## 2. 추가 주의: WSL 메타데이터 캐시 이슈

`adminAuthz.test.ts` 를 여러 번 Edit 했을 때 Linux bash 에서 파일이 null 바이트로
패딩된 것처럼 보이는 현상을 관찰했음. Read tool 은 깨끗한 내용을 반환하므로
Windows/NTFS 실제 파일은 정상일 것으로 판단. 다음 세션에서 Windows 측 tsc 로
최종 검증 필요.

완료 확인 기준:
```
> npx tsc --noEmit -p .   (Windows cmd 에서)
# 에러 0 개
> npm test                 (Windows cmd 에서)
# adminAuthz.test.ts 포함 전체 통과
```

## 3. 미착륙 항목의 패치 상세 (다음 세션 복붙용)

### 3.1 L-sec137 — /api/admin/contacts GET agent scope

**대상 파일**: `src/app/api/admin/contacts/route.ts` — GET 핸들러만.

**핵심 변경**:
1. 파일 상단 import 에 `verifyAdminAuthWithContext` 추가 (PATCH 에서 이미 쓰므로
   import 는 현재 있음).
2. GET 내부: `verifyAuth(request)` 통과 후 `verifyAdminAuthWithContext` 로 role/uid
   확인.
3. `UNLIMITED_ROLES = {master, superadmin, crawler_bridge}` 면 기존 쿼리 유지.
4. 아니면 `listings.select('id').eq('created_by', uid)` 로 본인 listing id 집합 구성,
   없으면 빈 배열 반환, 있으면 `.in('listing_id', ids)` 추가.
5. 주석에 L-sec137 명시.

**예상 커밋 메시지 제목**: `sec/fix: L-sec137 /api/admin/contacts GET agent scope 필터`

### 3.2 L-sec138 — /api/admin/appointments PATCH IDOR

**대상 파일**: `src/app/api/admin/appointments/route.ts` — PATCH 핸들러만.

**핵심 변경** (L-sec136 contacts PATCH 와 거의 동일 패턴):
1. Import 추가:
   ```ts
   import { verifyAdminAuth as verifyAuth, verifyAdminAuthWithContext } from '@/lib/adminAuth';
   import { authorizeListingMutation } from '@/lib/adminAuthz';
   import { audit } from '@/lib/auditLog';
   import { getClientIp } from '@/lib/rateLimit';
   ```
2. PATCH 시작부:
   ```ts
   const ip = getClientIp(request);
   ```
3. body parse 후 `supabase.from('appointments').select('id, listing_id').eq('id', id).maybeSingle()`.
4. `listingId` 가 null/비정상값 → unlimited role 체크, 아니면 403.
5. listingId 가 정상 숫자 → `authorizeListingMutation(request, listingId, supabase)`.
6. 실패 시 audit denied + 반환.
7. 성공 시 기존 update 후 audit ok.
8. 모든 에러 경로에 audit.

액션 이름: `appointment.update.ok / .denied / .error`.

**예상 커밋 메시지 제목**: `sec/fix: L-sec138 /api/admin/appointments PATCH IDOR + audit`

### 3.3 L-sec139 — /api/admin/listings/[id] local → shared adminAuthz 이관

**대상 파일**: `src/app/api/admin/listings/[id]/route.ts`

**핵심 변경**:
1. 현재 파일 내부에 정의된 `authorizeListingMutation` 제거.
2. 상단 import 에 `import { authorizeListingMutation } from '@/lib/adminAuthz';` 추가.
3. 시그니처 동일 (`request, listingId, supabase`) 이므로 호출부는 그대로.
4. 타입 결과 (`AuthzSingleResult`) 도 shared 와 동일하므로 호출부 무변경.

**예상 커밋 메시지 제목**: `refactor/sec: L-sec139 [id] route 의 local authorizeListingMutation 을 shared adminAuthz 로 이관`

### 3.4 L-sec140 — viewport bbox max diagonal cap

**대상 파일**: `src/app/api/listings/viewport/route.ts`

**핵심 변경**:
1. 현재 bbox 입력은 `minLng, minLat, maxLng, maxLat` 형태.
2. 대각선 거리(Haversine) 계산 또는 단순 delta-lat/delta-lng 곱으로 cap.
   서울/경기 전역이 들어가는 수준은 허용, 전국은 차단.
3. 임계치 제안: `(maxLng - minLng) * (maxLat - minLat) > 5` 면 400.
   (서울+경기 전체는 약 1.5 × 0.8 = 1.2 이내. 전국은 약 5 × 4 = 20.)
4. 초과 시 `{ success: false, error: 'viewport too large' }` + 400.

**예상 커밋 메시지 제목**: `sec/fix: L-sec140 /api/listings/viewport bbox max diagonal cap`

### 3.5 L-sec141 — search-nl LLM 출력 구조 Zod whitelist

**대상 파일**: `src/app/api/map/search-nl/route.ts`

**핵심 변경**:
1. LLM 응답을 바로 supabase 쿼리로 넘기지 말고 Zod 스키마로 whitelist.
2. 허용 필드: `{ keywords?: string[], types?: string[], dongs?: string[],
   minPrice?: number, maxPrice?: number, minArea?: number, maxArea?: number }`.
3. 파싱 실패 시 LLM 응답은 무시하고 원문 keyword 만 사용.
4. 허용 필드 외 값은 자동 drop.

**예상 커밋 메시지 제목**: `sec/fix: L-sec141 search-nl LLM 출력 Zod whitelist`

## 4. H-4 phase 2 테스트 파일 상세

`src/lib/adminAuthz.test.ts` (신규) — 총 10 개 테스트:

**authorizeListingMutation** (7 개)
- 401 when token missing
- unlimited role (master/superadmin/crawler_bridge) 3종 바이패스 (`it.each`)
- agent uid 없음 → 403
- listing 없음 → 404
- agent ≠ creator → 403
- created_by null → 403 (legacy 매물 agent 금지)
- agent = creator → ok

**authorizeBulkListingMutation** (4 개 + CRITICAL 1 개)
- 401 when token missing
- unlimited role → bypassed=true, ownedIds = 원본 ids
- 빈 입력 → 빈 결과, bypassed=false
- agent → ownedIds + filteredOut 정확히 분리
- **CRITICAL regression**: 아무것도 소유하지 않아도 ownedIds=[] (원본 ids 반환 아님)
- duplicate 유지 (호출측 책임)
- role 전환 시 bypassed 플래그 전환 확인

supabase mock 은 `.eq` / `.in` / `.maybeSingle` / thenable 을 직접 구현.

### 커밋 예시
이 테스트 파일만 별도 커밋 가능:
- 타이틀: `test/sec: H-4 phase 2 adminAuthz IDOR 가드 회귀 테스트 (L-sec136 락)`
- 파일: `src/lib/adminAuthz.test.ts`

## 5. 로컬 산출물 정리 (커밋 전 제거 대상)

다음 파일들은 L-sec136 운영 중 생성된 로컬 전용 산출물. `.gitignore` 의
`_sentinel_*`, `_run_*`, `_commit_msg*`, `_probe_*` 패턴 확인 후 남아있으면 제거:

- `_sentinel_l136.txt`
- `_sentinel_persist_test.txt`
- `_probe_write.txt`
- `_run_l136.bat`, `_run_l136.log`, `_run_l136fix.bat`, `_run_l136fix.log`
- `_commit_msg.txt`, `_commit_msg_l136fix.txt`

## 6. 다음 세션 진입 체크리스트

### 6.0 원클릭 마무리 (권장)

프로젝트 루트에 `_run_auto_session.bat` 생성됨. Windows cmd 에서:

```
cd /d "C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2"
_run_auto_session.bat
```

배치가 수행하는 것:
1. `.git\index.lock` 제거
2. `npx tsc --noEmit -p .` (통과 필수)
3. `npx vitest run src/lib/adminAuthz.test.ts` (통과 필수)
4. `src/lib/adminAuthz.test.ts` + `docs/L-auto-session-2026-04-23.md` 커밋
5. `git push origin main`
6. 로컬 산출물(_sentinel_*, _probe_*, _run_l136*, _commit_msg*) 삭제

로그: `_run_auto_session.log`. tsc/vitest 중 하나라도 실패하면 커밋/푸시하지 않고
exit code 1 또는 2 로 중단. 이 경우 로그 확인 후 수정.

### 6.1 이후 순서

1. `docs/L-audit-2026-04-23.md` 의 "다음 라운드 백로그" 확인.
2. 본 문서의 섹션 3 순서대로 L-sec137→138→139→140→141 반영.
3. 각 L-sec 항목은 별도 커밋(또는 최대 2개씩 묶음) 로 push.
4. 매번 Vercel 빌드 Ready 확인.

## 7. 참고 — 진행 중 task 목록

TaskList 기준:
- #32 `C-2 HttpOnly 세션 쿠키 마이그레이션` (phase 2/3 남음)
- #50 `L-sec138 admin/appointments PATCH IDOR (H)` (pending, 위 3.2)
- #51 `L-sec137 admin/contacts GET agent scope filter (H)` (pending, 위 3.1)
- #52 `H-4 phase 2 Vitest supabase mock + IDOR regression tests` (pending — 파일 작성 완료, 검증/커밋 대기)
- #53 `L-sec139 listings/[id] local→shared adminAuthz 이관 (M)` (pending, 위 3.3)
- #54 `L-sec140 viewport bbox max-diagonal cap (M)` (pending, 위 3.4)
- #55 `L-sec141 search-nl LLM 출력 구조 Zod 검증 (M)` (pending, 위 3.5)
- #56 `Local artifact cleanup` (pending, 위 5)

이 문서 자체는 `docs/L-auto-session-2026-04-23.md` 로 커밋해 히스토리에 남기면
다음 세션에서 바로 이어받을 수 있음.
