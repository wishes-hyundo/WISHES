# L-sec157 Phase 3b 완료 + 남은 수동 작업

작성: 2026-04-23

## 이미 완료 (Production 배포됨)

| 항목 | 상태 | 비고 |
|---|---|---|
| Phase 3b 코드 커밋 **d9a867b** | ✅ origin/main | Vercel Production 배포 확인됨 |
| 3개 self-call site → WISHES_INTERNAL_BEARER 분리 | ✅ | route.ts 3곳 |
| adminAuth.ts dual accept | ✅ Phase 3a | MASTER + INTERNAL 둘 다 인정 |
| 세션 임시 파일 24개 정리 | ✅ | File Explorer 127→103 |
| multi-pack-index 복구 | ✅ | Windows fsck exit 0 |
| origin/main 추적 ref 동기화 | ✅ | 4e325ca → d9a867b |

## 로컬에만 있는 변경 (아직 push 안 됨)

| 파일 | 커밋 | 상태 |
|---|---|---|
| `.gitignore` 확장, `_commit_msg_l-sec153.txt` 제거 | **c08465d** (로컬) | push 대기 |
| `src/app/api/version/route.ts` | 미커밋 | commit + push 대기 |

push 가 막힌 이유는 단순히 **GitHub Credential Manager 계정 선택 팝업** 이에요.
코드 자체에는 아무 문제 없음.

## 남은 수동 작업 (2개)

### ① Vercel 환경변수 `WISHES_INTERNAL_BEARER` 등록 — 가장 중요

랜덤 토큰을 이미 만들어 둠:
- 파일: `C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2\_wishes_internal_bearer.txt`
- 64자 hex (32바이트 엔트로피)

**절차**:
1. https://vercel.com/ 로그인 → wishes 프로젝트 선택
2. **Settings → Environment Variables**
3. **Add New**:
   - Key: `WISHES_INTERNAL_BEARER`
   - Value: `_wishes_internal_bearer.txt` 파일 내용을 복사해서 붙여넣기
   - Environments: **Production / Preview / Development 모두 체크**
4. Save
5. 새 deployment 자동 트리거되거나, 없으면 Deployments → 최신 항목 **Redeploy** 클릭
6. 완료 후 `_wishes_internal_bearer.txt` 삭제 (값은 Vercel 에 안전하게 저장됨)

등록 후에는 서버가 내부 자기호출에서 `WISHES_INTERNAL_BEARER` 를 먼저 쓰고, 없으면 기존 `WISHES_ADMIN_MASTER_PASSWORD` 로 폴백함. 서비스 무중단.

### ② (선택) 로컬 커밋 2개 push — 하실 수 있을 때

터미널이나 Git Bash 를 열고:

```bash
cd "C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2"
git add src/app/api/version/route.ts
git commit -m "feat(obs): /api/version endpoint — VERCEL_GIT_COMMIT_SHA 노출"
git push origin main
```

push 할 때 계정 선택 팝업 뜨면 **x-access-token** 클릭 (이 후 세션은 자동).

성공하면 두 커밋 (c08465d cleanup + 새 /api/version 커밋) 이 한 번에 올라감.

**급하지 않음** — 이건 단순히 "지금 라이브 커밋이 뭔지" 확인용 엔드포인트라서, 나중에 아무때나 push 해도 됩니다.

## 이후 로드맵

- **L-sec158 Phase 3c** (약 1주일 뒤): 위 ①번 완료 확인 후 `adminAuth.ts` 에서 MASTER_PASSWORD accept 경로 제거 → INTERNAL_BEARER 만 유효

## 기술 배경 참고

- `docs/L-auth-migration-phase3d-internal-bearer.md` (Phase 3 로드맵)
- `src/lib/adminAuth.ts` line 37, 61, 120, 123 (dual accept 검증 지점)
