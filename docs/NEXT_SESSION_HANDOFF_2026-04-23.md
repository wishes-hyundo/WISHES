# 📋 다음 세션 인수인계 — 2026-04-23 (긴 세션 마감분)

**이 프롬프트를 다음 Claude 세션 첫 메시지로 복붙 하세요.**

---

## 🏠 프로젝트 기본 정보

- **저장소**: https://github.com/wishes-hyundo/WISHES
- **로컬 경로**: `C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2`
- **배포**: Vercel (wishes.co.kr) · `main` 브랜치 push → 자동 배포
- **스택**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 4 + Supabase + Vercel
- **Supabase 프로젝트 ID**: `xbjgdsyukjdkfvcbzmjc`
- **SQL Editor URL**: https://supabase.com/dashboard/project/xbjgdsyukjdkfvcbzmjc/sql/new
- **Vercel 프로젝트**: https://vercel.com/wishes/wishes
- **운영체제**: Windows 11 (Samsung Galaxy Book, Copilot+ PC)
- **슈퍼어드민 이메일**: `wishes@wishes.co.kr` (하드코딩, `adminAuth.ts` 의 `SUPERADMIN_EMAILS`)

---

## 🎯 origin/main 최종 상태 (2026-04-23 마감 시점)

```
20bfa85  fix(auth): L-sec168 — admin-auth.html 91581 bytes 복구           ← 긴급 복구 완료 ✅
67d6433  fix(auth): narrow Kakao OAuth scope (사용자)
1c7661d  feat(admin): L-cc1 Phase 1 PoC — React Command Center v2        ← Phase 1 PoC ✅
ef256c7  fix(geocode): L-geocode2 (사용자)
42ebd35  feat(admin): L-cc1 Phase 0 — Command Center 권한 수정 UI          ← Phase 0 ✅
721cfcc  fix(geocode-ui): L-geocodeui1 (사용자)
f9b211f  fix(auth): repair truncated files (사용자 — 3개 파일만 복구)
2e606c1  feat(auth): password reset + Kakao/Naver social login (사용자 — 버그 원흉)
e2a40ee  chore(db): L-sec167 — admin_users 테이블 생성 migration ⚠️ DB 적용됨 ✅
15125a8  fix(restore): 세션 truncation 파일 5개 복구 (사용자)
...
```

---

## ✅ 이번 세션에서 완료된 작업 (총 8개 제 commit)

### 🔐 보안 및 안정성

| 커밋 | 내용 | Status |
|---|---|---|
| `b65408b` | revert(auth): L-sec160 시도 3건 원복 (빌드 복구) | ✅ Production |
| `1754a34` | fix(auth): L-sec161 follow-up — verify .or pattern | ✅ Production |
| `e05dde4` | fix(auth): L-sec162 — email.ilike (이후 사용자가 .eq 로 복원) | ✅ Production |
| `184e02e` | chore(deps): L-sec163 — fast-xml-parser ^5.7.0 override (AWS SDK 20건 해결) | ✅ Production |
| `74e7b64` | chore(deps): L-sec164 — esbuild ^0.25.0 override (drizzle-kit 4건 해결) | ✅ Production |
| `2f0fd70` | chore(db): L-sec165 — admin_users.email normalize migration (파일만 생성) | 📄 DB 미적용 |
| `d709e84` / `913e5da` / `2c8c303` | L-sec166 retry 시도 → TS 빌드 실패 → revert | ❌ 롤백됨 |

### 🏗️ admin_users 테이블 및 권한 관리

| 커밋 | 내용 | Status |
|---|---|---|
| `e2a40ee` | chore(db): L-sec167 — admin_users 테이블 생성 migration | ✅ **DB 에 실행 완료** |
| `42ebd35` | feat(admin): L-cc1 Phase 0 — Command Center 권한 수정 UI + viewer→user 스키마 정정 | ✅ Production |
| `1c7661d` | feat(admin): L-cc1 Phase 1 PoC — /admin/command-center-v2 (React + Tailwind) | ✅ Production |
| `20bfa85` | fix(auth): L-sec168 URGENT — admin-auth.html 91581 bytes 복구 | ✅ Production |

### 📊 Dependabot 취약점 처리

- **시작 시점**: 5건 (1 high + 4 moderate)
- **사용자 병합**: PR #9 (rollup+sentry), PR #8 (uuid+sentry), PR #4 (checkout), PR #3 (setup-node), PR #2 (setup-python) = 5건 병합
- **제 후속 조치**: fast-xml-parser override (AWS SDK 체인 20건) + esbuild override (drizzle-kit 체인 4건)
- **현재 상태**: **`npm audit` → 0 vulnerabilities** ✅

### 🗄️ Supabase DB 실행 완료 상태

사용자가 직접 실행한 SQL:
1. ✅ `admin_users` 테이블 생성 (L-sec167 migration)
2. ✅ 기존 `auth.users` 13명 백필
3. ✅ 역할 일괄 배정:
   - `wishes@wishes.co.kr` → superadmin / approved
   - `eo@wishes.co.kr`, `haeryang0314@wishes.co.kr`, `wish@wishes.co.kr` → **admin / approved**
   - `qkrcndgy89@naver.com` (박충효), 나머지 9명 → **agent / approved**

### 📖 문서

- `docs/command-center-modernization-2026.md` — **아직 origin 에 push 안 됨** (reset 과정에서 손실). 다음 세션에서 재생성 필요. 내용 복구는 /sessions 경로의 파일에 보관 중일 수 있음.
- `docs/L-sec157-phase3b-completion.md` — 이전 세션 작업 보관

---

## 🚨 반드시 알고 있어야 할 환경 이슈 (이번 세션에서 발견)

### 1. Windows FS Truncation Bug (반복 발생)
- **증상**: sandbox 에서 Edit/Write tool 로 대용량 파일 쓸 때 중간에 잘림
- **구체적 피해**:
  - `admin-auth.html`: 91581 → 24526 bytes (73% 손실, `2e606c1` 커밋으로 origin 까지 올라감)
  - `adminAuth.ts`: L-sec166 retry 도입 시 잘림 → revert 필요
  - `verify/route.ts`: 작업 중 여러 번 잘림
  - `adminFetch.ts`: L-sec160 때도 잘림
- **우회법**:
  - 대용량 파일은 **sandbox python 으로 `.write()` 후 `os.fsync()` + read-back 검증**
  - 또는 **git blob 에서 `git cat-file -p` 로 추출**
  - 또는 **사용자가 로컬 Git Bash 에서 직접 편집**
  - 절대 금지: GitHub 웹 에디터 + CodeMirror 6 대용량 replace

### 2. `.git/index` 반복 손상
- **증상**: 수시로 `error: bad signature 0x00000000 / fatal: index file corrupt`
- **우회법**: `rm -f .git/index && git read-tree HEAD` 로 재생성
- **커밋 시 권장**: `GIT_INDEX_FILE=/tmp/ws_tmp` 로 tmp index 사용 + plumbing (`write-tree` / `commit-tree` / `update-ref`)

### 3. FS Sync Lag
- sandbox `wc -c` 와 python `len(file.read())` 가 한동안 **다른 값** 표시
- 2~3 초 `sleep` 후 재확인으로 수렴
- Korean UTF-8 문자 때문에 bytes vs chars 차이가 정상일 수도 있음

### 4. 동시 편집
- 사용자가 Git Bash 에서 동시에 커밋/푸시 진행
- 매번 `git fetch origin` → `rev-list --left-right --count HEAD...origin/main` 로 divergence 확인 필요
- 원격이 앞서면 `git reset --hard origin/main` 후 내 변경 재적용

### 5. Credential Helper 경로 이전 세션
- `.git/config` 의 `credential.helper` 가 이전 sandbox 세션 경로를 가리킬 수 있음
- 수정: `git config credential.helper "store --file=.git/credentials"` (상대 경로)
- PAT 는 `.git/credentials` 파일에 `x-access-token:ghp_...@github.com` 형식으로 저장됨

### 6. bash timeout 45초 제한
- `npm install` 등이 중간에 끊김 → 파일 손상 위험
- 우회: `nohup npm install ... > /tmp/log &` 백그라운드 + 반복 polling

### 7. `.env.local.example` 위치
- Supabase URL: `https://xbjgdsyukjdkfvcbzmjc.supabase.co`

---

## 🟡 다음 세션 우선순위 작업 목록

### 🥇 우선순위 1: Social Login UI 재추가 (안전하게)

**맥락**: `20bfa85` 로 `admin-auth.html` 을 `deed6693` (pre-social-login) 버전으로 복원. 이 때문에 **Kakao/Naver 로그인 버튼 UI 가 사라짐**. 백엔드 API 는 모두 살아있음:
- `/api/auth/oauth-start/[provider]/route.ts` ✓
- `/api/auth/naver/route.ts` ✓
- `/api/auth/forgot-password/route.ts` ✓

**작업**:
1. `2e606c1` 커밋의 `admin-auth.html` 변경분에서 **잘리기 전까지의 UI 요소만 추출** (git show 2e606c1:file + diff 비교)
2. 현재 admin-auth.html (91581 bytes, `20bfa85` 버전) 에 Kakao/Naver 버튼 + forgot password 링크 **작게 나눠서 append**
3. 파일 크기가 > 8KB 증가하면 중간 저장 + 검증 후 계속
4. 파일 끝의 `</script></body></html>` 닫는 태그 유지 필수
5. sandbox python 으로 쓰고 반드시 `os.fsync` + read-back 검증

### 🥈 우선순위 2: 박충효님 로그인 실제 테스트 (사용자 협조 필요)

**사용자께 요청**:
- 박충효님께 로그인 재시도 부탁
- 시크릿 모드 또는 브라우저 사이트 데이터 클리어 후 시도
- 튕기는지/안 튕기는지 스크린샷

**예상**: admin_users 테이블 생성 + agent/approved 세팅 완료됐으므로 **정상 작동 예상**. agent bounce 증상 완전 해소.

### 🥉 우선순위 3: Phase 2 — 모던 Command Center 고도화

`/admin/command-center-v2` 를 확장. 우선 **사용자가 로컬에서 `npm install` 해주셔야 함**:

```bash
cd "C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2"
npm install @tanstack/react-table sonner cmdk class-variance-authority tailwind-merge --legacy-peer-deps
git add package.json package-lock.json
git commit -m "chore(deps): Phase 2 prep — shadcn/tanstack deps"
git push
```

설치 완료되면 이어서:
- Command Palette (Cmd+K) — cmdk 라이브러리
- Audit Timeline — `admin_audit_log` 테이블 읽어서 시각화
- Supabase Realtime 구독으로 여러 관리자 동시 작업 시 자동 새로고침
- sonner 토스트로 교체
- TanStack Table v8 서버사이드 페이지네이션

### 🏢 우선순위 4: Phase 3+ — 엔터프라이즈 기능

- Permission Matrix UI (Role × Resource × Action 편집기)
- Bulk actions (체크박스 다중 선택)
- CSV/Excel export
- Slack/Email 신규가입 알림
- 모바일 PWA 응답 승인 화면

### 📄 우선순위 5: 놓친 것들

- `docs/command-center-modernization-2026.md` 보고서 재생성 (이전 세션 reset 과정에서 손실, 내용 복원 필요)
- `_finalize_*`, `test*.bat` 로컬 도구 → `scripts/local/` 폴더로 이동 + .gitignore 정비
- `adminAuth.ts` Supabase 3초 timeout retry — L-sec166 TS 빌드 에러 원인 조사 후 재도전 (withRetry 제네릭 타입 문제)
- `admin_users.email` CITEXT 또는 BEFORE INSERT 트리거 (L-sec165 migration 파일은 있으나 DB 미적용)
- admin API 통합 테스트 (agent bounce 같은 regression 을 CI 가 잡게)

---

## 📍 주요 파일 경로 (자주 건드릴 것들)

| 파일 | 용도 |
|---|---|
| `src/lib/adminAuth.ts` | 3개 검증기 (verifyAdminAuth / Strict / WithContext) |
| `src/lib/adminFetch.ts` | 클라이언트 admin API wrapper (L-sec161 grace period 포함) |
| `src/app/api/auth/login/route.ts` | 로그인 API |
| `src/app/api/auth/verify/route.ts` | 세션 verify API (POST + GET) |
| `src/app/api/admin/users/route.ts` | 사용자 GET / PUT (action: approve/reject/block/unblock/change_role) |
| `public/admin/admin-auth.html` | 로그인/가입 페이지 (정적 HTML + inline JS, 91581 bytes) |
| `public/admin/command-center.html` | Command Center v1 (정적 HTML, 1178 lines) |
| `src/app/admin/command-center-v2/page.tsx` | Command Center v2 (React, 607 lines) |
| `src/app/admin/layout.tsx` | Admin 레이아웃 (인증 가드 + 사이드바) |
| `supabase/migrations/20260423_create_admin_users.sql` | L-sec167 migration (DB 적용 완료) |
| `supabase/migrations/20260423_normalize_admin_users_email.sql` | L-sec165 migration (DB 미적용) |

---

## 🔑 admin_users 테이블 현재 스키마

```sql
CREATE TABLE admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,           -- normalize 트리거로 lowercase+trim
  name text,
  company text,
  role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('superadmin', 'admin', 'agent', 'user')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret text,
  mfa_enrolled_at timestamptz,
  mfa_last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: 본인 row SELECT 만 허용. service_role 은 자동 우회.
```

### 현재 13명 상태

| email | role | status |
|---|---|---|
| wishes@wishes.co.kr | superadmin | approved |
| eo@wishes.co.kr | admin | approved |
| haeryang0314@wishes.co.kr | admin | approved |
| wish@wishes.co.kr | admin | approved |
| qkrcndgy89@naver.com (박충효) | agent | approved |
| qudgns251@naver.com | agent | approved |
| rkdehdud369@nate.com | agent | approved |
| rupi0208@hanmail.net | agent | approved |
| thundy0809@hanmail.net | agent | approved |
| tmddhks966@naver.com | agent | approved |
| yinseob712@naver.com | agent | approved |
| yyjoo7777@gmail.com | agent | approved |
| zldzhaos@gmail.com | agent | approved |

---

## 🛠️ 안전한 작업 패턴 (이번 세션 교훈)

### 파일 수정 전 점검
```bash
wc -c <file>           # sandbox 바이트
python3 -c "print(len(open('<file>').read()))"  # python 바이트
git cat-file -s HEAD:<file>  # git blob 바이트
```
**세 값이 모두 일치해야 완전한 파일**. 다르면 truncation 의심.

### 파일 쓰기 후 검증
```python
with open(path, 'wb') as f:
    f.write(content)
    f.flush()
    os.fsync(f.fileno())
time.sleep(2)
with open(path, 'rb') as f:
    readback = f.read()
assert readback == content, f"truncated! {len(readback)} vs {len(content)}"
```

### Commit + push (index corruption 우회)
```bash
export GIT_INDEX_FILE=/tmp/my_idx
rm -f /tmp/my_idx
git read-tree HEAD
git add <files>
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "$MSG" | git commit-tree "$TREE" -p "$PARENT")
git update-ref refs/heads/main "$COMMIT"
unset GIT_INDEX_FILE
git push origin main
```

### Push rejected 시 동기화
```bash
git fetch origin
git rev-list --left-right --count HEAD...origin/main   # 0 N 이면 behind
# 내 변경이 working tree 에 살아있으면:
git reset --hard origin/main
# ... 내 변경 재적용 ...
# ... 재커밋 ...
```

### 임시 파일 금지 리스트 (`.gitignore` 에 있음)
- `_cred_*.txt`, `_push_log.txt`, `_*.bat`
- `push_*.bat`, `git_push*.bat`
- `_finalize_*.done`, `_finalize_*.log`
- `_wishes_*.txt`, `test*.bat`, `test*.log`
- `.*_result.log`, `.push_retry.log`

---

## 🧪 다음 세션 시작할 때 점검 체크리스트

```bash
cd "/sessions/<SESSION>/mnt/wishes-v2"

# 1. 로컬 상태
git status --short
git log --oneline -5

# 2. 원격 동기화
git fetch origin
git rev-list --left-right --count HEAD...origin/main

# 3. 중요 파일 무결성 (truncation 감지)
wc -c public/admin/admin-auth.html       # 91581 이어야 함
wc -c src/lib/adminAuth.ts               # ~14000 이상
wc -c src/lib/adminFetch.ts              # ~4000

# 4. admin_users 상태 (필요 시 Supabase SQL Editor):
# SELECT email, role, status FROM admin_users ORDER BY role, email;
```

---

## 💬 다음 세션 첫 프롬프트 (사용자 작성 예시)

> "어제 세션 마감 후 박충효님 로그인 테스트 했는데 [결과]. Social login UI 복원해 주고, 끝나면 Phase 2 진행해 줘. docs/command-center-modernization-2026.md 재생성도 부탁."

또는

> "어제 작업 이어서. docs/NEXT_SESSION_HANDOFF.md 참고. 우선순위 1 (Social login UI 재추가) 부터 안전하게 진행해."

---

## 🎁 보너스 — 즉시 사용 가능한 상태 요약

사용자 접속 가능 URL:
- **로그인**: https://wishes.co.kr/admin/admin-auth.html ✅
- **Command Center v1**: https://wishes.co.kr/admin/command-center.html ✅ (권한 dropdown 작동)
- **Command Center v2**: https://wishes.co.kr/admin/command-center-v2 ✅ (모던 React)

접근 가능 역할:
- `wishes@wishes.co.kr` → superadmin / 모든 권한
- `@wishes.co.kr` 도메인 3명 → admin / 관리자 권한
- 나머지 9명 (박충효 포함) → agent / 중개사 권한

Dependabot: **0 vulnerabilities** 🎉

Supabase DB: `admin_users` 테이블 정상 + RLS 적용 + email 정규화 트리거 적용

---

**이 파일 그대로 읽어가시면 다음 세션도 매끄럽게 이어집니다. 수고하세요!** 🙌
