# L-auth-migration Phase 3d — Internal Bearer 분리

작성일: 2026-04-23
상태: **Phase 3a 코드 배포됨 (L-sec156) / Phase 3b·3c 대기**
선행: L-sec154 (admin_password 철거), L-sec155 (7개 고위험 admin API strict 승격)

## 왜 하는가

현재 인증 체계에는 `WISHES_ADMIN_MASTER_PASSWORD` 가 두 가지 역할을 겸하고 있다.

1. **사람용 운영 마스터 키** — 슈퍼어드민이 긴급 상황에 비밀번호 로그인을 가능하게 하는 env 토큰 (`Authorization: Bearer <MASTER>`).
2. **내부 자가호출 베어러** — 서버가 자기 자신의 API 를 호출할 때 (`auto-generate-bulk` → `auto-generate`, `generate-description`, `building-registry-full` → `building-registry`) 쓰는 기계용 토큰.

둘이 같은 값이면, 한쪽이 유출되는 즉시 양쪽이 모두 털린다. 사람이 옮겨 적는 마스터 키가 Slack/메일/스크린샷에 남기 쉬우므로 기계용 토큰을 분리해 운영해야 한다.

또한 앞으로 `WISHES_ADMIN_MASTER_PASSWORD` 자체를 없애는 것이 목표 (슈퍼어드민 로그인은 JWT+admin_users 경로만 남긴다) 인데, 그 전에 기계용 경로부터 새 env 로 이주시켜야 한다.

## 3단계 이주 계획

### Phase 3a (완료, 코드는 L-sec156 에 포함)

`src/lib/adminAuth.ts` 에 `WISHES_INTERNAL_BEARER` env reader 를 추가하고, 3개 검증기 (`verifyAdminAuth` / `verifyAdminAuthWithContext` / `verifyAdminAuthStrict`) 가 기존 MASTER_PASSWORD 와 **병행** 으로 INTERNAL_BEARER 도 수신하도록 확장했다.

반환 role 은 `internal_bearer`. Phase 2 의 7개 strict 엔드포인트 `ALLOWED_ROLES` 에 `'internal_bearer'` 를 추가해 self-call 경로가 막히지 않게 했다.

기존 MASTER_PASSWORD 경로는 그대로 두었기 때문에 env 가 세팅되지 않아도 회귀는 없다.

### Phase 3b — env 세팅 + self-call 3곳 전환 (유저 action 필요 + L-sec157)

1. **Vercel 대시보드 → Settings → Environment Variables** 에 다음 추가:
   - Key: `WISHES_INTERNAL_BEARER`
   - Value: 새로 생성한 32자+ 랜덤 문자열 (예: `openssl rand -hex 24`)
   - Environment: Production / Preview / Development 전체
   - ※ 기존 `WISHES_ADMIN_MASTER_PASSWORD` 와 **다른** 값을 써야 의미가 있음.

2. 설정 반영을 위해 한 번 redeploy.

3. L-sec157 에서 3개 self-call 파일의 `INTERNAL_BEARER` 상수 소스를 `WISHES_ADMIN_MASTER_PASSWORD` → `WISHES_INTERNAL_BEARER` 로 교체:
   - `src/app/api/admin/auto-generate-bulk/route.ts:13`
   - `src/app/api/admin/generate-description/route.ts` (해당 라인)
   - `src/app/api/admin/building-registry-full/route.ts:11`

4. 배포 후 `/api/admin/auto-generate-bulk` 1건 호출해서 self-call 경로가 여전히 200 응답하는지 검증.

### Phase 3c — MASTER_PASSWORD accept path 완전 제거 (L-sec158)

Phase 3b 검증이 1주일 안정적이면 다음을 제거:

1. `src/lib/adminAuth.ts`:
   - `getMasterPassword()` 함수 제거 (또는 항상 무효화 값 반환하도록 축소)
   - `verifyAdminAuth` / `WithContext` / `Strict` 에서 `MASTER_PASSWORD` 일치 분기 삭제
   - `admin_bridge_` 경로의 MASTER 일치 분기 삭제
   - strict 의 `?token=` 쿼리 MASTER 수신 삭제

2. 7개 Phase 2 엔드포인트의 `ALLOWED_ROLES` 에서 `'master'` 제거.

3. Vercel `WISHES_ADMIN_MASTER_PASSWORD` env 삭제.

4. 문서 (`docs/security-posture.md`, `.env.local.example`) 갱신.

완료 후의 수용 가능 Bearer 는:
- `WISHES_CRAWLER_BRIDGE_TOKEN` → role `crawler_bridge`
- `WISHES_INTERNAL_BEARER` → role `internal_bearer`
- Supabase JWT → role `superadmin|admin|agent` (admin_users 테이블 기준)

이 시점에 "사람이 직접 입력하는 마스터 비밀번호" 개념이 완전히 사라진다. 운영 계정은 반드시 Supabase 계정 + admin_users 승인을 통해서만 접근 가능.

## 회귀 방지 체크리스트

Phase 3b 배포 직후 (15분 내):
- [ ] `/api/admin/auto-generate-bulk` POST 1건 → 200
- [ ] `/api/admin/building-registry-full?address=...` GET → 200
- [ ] `/api/admin/generate-description` 1건 호출 → 200
- [ ] 어드민 대시보드 로그인 → 기존 기능 정상 (JWT 경로에 영향 없음)
- [ ] 크롤러 브리지 (`admin_bridge_*`) 정상

Phase 3c 배포 직후:
- [ ] 위 4개 + `/admin` 로그인 (JWT 만 통과, master 경로 없음 확인)
- [ ] `WISHES_ADMIN_MASTER_PASSWORD` 를 Bearer 로 쏘면 401 응답
- [ ] `grep -r "WISHES_ADMIN_MASTER_PASSWORD" src/` 결과 0건

## 기록

- 2026-04-23: L-sec154 Chrome 확장 admin_password 철거 (4d52502)
- 2026-04-23: L-sec155 7개 고위험 admin API strict 승격 (f53c962)
- 2026-04-23: L-sec156 Phase 3a — 본 문서 + adminAuth.ts 병행 수신 추가
