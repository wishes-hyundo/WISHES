# L-v7 scope=mine + TypeScript 정리 — 완료 보고

**완료일**: 2026-04-22
**담당**: Claude (Cowork)
**최종 커밋**: `6ce11e4`
**Vercel 배포**: `BN9REaA5G` (Ready) 기반으로 `abb0982` → `6ce11e4` 연속 배포

---

## 1. 완료 범위 요약

| 항목 | 결과 |
|---|---|
| TypeScript 사전 존재 에러 (14개) | **전부 해결, `tsc --noEmit` exit 0** |
| scope=mine GET 파이프라인 | 3개 쿼리 경로(minimal / full / page-scan) 모두 `eq('created_by', scopeUid)` 적용 |
| POST /api/admin/listings created_by 저장 | 수동 등록 시 JWT → UID 추출하여 저장 |
| .gitignore 정리 | 로컬 아티팩트 패턴 통합 (`.*_result.log`, `.push_retry.log`, `.push_status.*` 등) |
| 프로덕션 배포 | `main` 브랜치 자동 배포 |
| 401 응답 규약 | `{"success":false,"error":"인증 실패"}` + 상태 401 (정상) |

---

## 2. TypeScript 14건 수정 내역 (adfa96c)

| # | 파일 | 문제 | 수정 |
|---|---|---|---|
| 1 | `src/app/api/auth/me/route.ts` | `withTimeout(promise: Promise<T>)` 에 Supabase PostgrestBuilder (thenable) 전달 시 구조적 비호환 | `promise: PromiseLike<T>` 로 완화 |
| 2 | `src/app/api/alerts/send/route.ts` | `.insert({...}).catch(() => {})` — PostgrestBuilder 는 thenable 이라 `.catch` 없음 | `try/catch` 블록으로 대체 |
| 3 | `src/app/api/listings/[id]/real-prices/route.ts` | Next.js 15 dynamic route `params` 가 `Promise<{...}>` 로 변경됨 | `const resolvedParams = await params;` 추가 |
| 4–9 | `AdminTodayPanel / AdminAppointmentsPanel / AdminConversionPanel / AdminNewsletterPanel / AdminBriefingPanel / admin/contacts/page.tsx` | `onClick={asyncFn}` — React `MouseEventHandler` 는 `void` 반환 기대, async fn 의 `Promise<void>` 미스매치 | 전부 `onClick={() => asyncFn()}` 화살표 래퍼로 변경 |
| 10 | `src/lib/email.ts` | `admin_users` 조회 결과의 `phone / company / reason` 컬럼이 nullable | 타입을 `string \| null` 로 확장 |
| 11 | `src/app/api/admin/listings-bulk-delete/route.ts` | `.select('id', { count: 'exact' })` → `.delete(...)` 체인에 TS 오버로드 매칭 실패 | `{count: 'exact'}` 옵션 제거, `data?.length` 기반 카운트 |
| 12–14 | `AdminBriefingPanel.tsx` | `onClick={fetchBriefing}` 2회, 위와 같은 이벤트 핸들러 타입 미스매치 | `onClick={() => fetchBriefing()}` |

결과: `npx tsc --noEmit` **exit 0**, 332개 파일 UTF-8 검증 통과.

---

## 3. scope=mine 동작 원리 (코드 기준)

`src/app/api/admin/listings/route.ts` GET:

1. `verifyAdminAuth` 통과 후 쿼리 파라미터 파싱
2. `scope = searchParams.get('scope')` → 'mine' 이면 인증 헤더에서 UID 추출 시도
   - `admin_bridge_` 접두어 제거
   - JWT 구조 검증 (`eyJ` + 3 dot)
   - `supabase.auth.getUser(token)` (2s timeout) → UID
3. UID 획득 실패 시: `{success:true, data:[], total:0, scope:'mine', scope_auth:'failed'}` + `Cache-Control: private, no-store`
4. UID 성공 시: 모든 쿼리 경로에 `.eq('created_by', scopeUid)` 필터 부착
   - L197: minimal 경로 1차 페이지
   - L213: minimal 경로 병렬 페이지
   - L293: 비-minimal (full scan) 경로
5. 캐시 키 분리: `['listings-minimal-v3-mine', scopeUid]` vs `['listings-minimal-v3']` — 사용자 간 캐시 누수 방지
6. 응답 헤더: `Cache-Control: private, max-age=30` (mine) vs `s-maxage=300, stale-while-revalidate=86400` (all)

POST 핸들러: JWT → UID 추출 후 `insert({ ..., created_by: uid })`. Bearer 토큰 없거나 UID 추출 실패 시 `created_by` 를 `null` 로 저장 (스키마 허용).

---

## 4. 프로덕션 DB 현황 (Supabase 실측, 2026-04-22 기준)

| 지표 | 값 |
|---|---|
| `listings` 전체 행 수 | **6,204** |
| `created_by IS NOT NULL` | **0** |
| 가장 최근 10건의 `source_site` | 전부 `gongsilclub` (크롤러) |
| `profiles` 테이블 행 수 | 13 (wishes@wishes.co.kr → `69c9e14e-b1e8-4888-a26e-75a6e07a74cf` 포함) |

**해석**: 현재 DB 의 모든 매물은 외부 사이트(공실클럽 등) 크롤링분이라 `created_by` 가 정상적으로 `null`. 관리자가 `/admin/listings/new` 등에서 **직접 수동 등록**한 매물만 `created_by` 에 해당 관리자 UID 가 박힌다. 그러므로 wishes 계정의 `scope=mine` 응답이 `total:0` 인 것은 **기대 동작**.

---

## 5. 실증 검증 가이드 (운영자용)

scope=mine 이 실제로 필터링함을 눈으로 확인하려면:

```
1. 관리자 로그인
2. /admin/listings/new 에서 매물 1건 수동 등록 (예: 제목 "테스트 매물 L-v7 확인용")
3. POST /api/admin/listings 응답에 id 가 찍히면 Supabase 에서 해당 row 확인:
   SELECT id, title, created_by FROM listings WHERE id = <new_id>;
   → created_by = '69c9e14e-b1e8-4888-a26e-75a6e07a74cf' 이어야 함
4. /admin/listings 로 이동, "내 매물" 토글 ON
5. 네트워크 탭: GET /api/admin/listings?scope=mine&fields=minimal
   → Authorization: Bearer admin_bridge_eyJ... 헤더 붙음
   → 응답: {"success":true,"data":[{...id=<new_id>...}],"total":1,"scope":"mine"}
   → Cache-Control: private, max-age=30
```

---

## 6. 배포 이력 (오늘 반영된 커밋)

```
(신규)   sec: L-sec103 — /api/og/listing IP rate limit(180/min) + CDN s-maxage=3600 캐시
(신규)   docs(L-v7): completion report + gitignore pattern refinement
001f745  fix(csp): L-sec102 drop img-src https://*.workers.dev wildcard
6ce11e4  chore(gitignore): add .push_retry.log to local artifact list
abb0982  chore(gitignore): extend L-v7 local artifact patterns
883fda0  sec: L-sec101 — SVG XSS 차단 (업로드 MIME whitelist + R2 proxy Content-Type 가드)
c852af7  chore: untrack .commit_result.log (local build artifact)
adfa96c  fix(ts): resolve 14 pre-existing TypeScript errors + gitignore updates
0993b19  sec: L-sec100 — /api/auth/delete-account Supabase Admin 에러 메시지 prod 노출 차단
```

---

## 7. 남은 선택사항 / 개선 아이디어

- **일괄 역추적 백필**: `listings.source_site IS NULL` 인 수동 등록 추정 행들에 대해 `created_by` 를 대표 관리자 UID 로 소급 적용 (정확성 보장이 어려워 기본은 비권장)
- **admin 매물 편집/삭제 시 권한 체크**: 현재는 단일 관리자 roles 가정. 다중 관리자 운영 시 `listings.created_by = auth.uid() OR role = 'superadmin'` 체크 추가
- **RLS 정책**: Supabase 레이어에서도 `created_by` 기반 정책 적용 (현재는 API 레이어만)

---

끝.
