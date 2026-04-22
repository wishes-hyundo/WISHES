# L-mfa1 — Admin TOTP MFA 설계

_Owner: 보안 / Date: 2026-04-23 / Status: draft_

## 배경

현재 admin 인증은 다음 경로로 통과된다.
- env `WISHES_ADMIN_MASTER_PASSWORD` (마스터 — 단일 비밀번호)
- `CRAWLER_BRIDGE_TOKEN` (서버간)
- Supabase JWT 서명 검증 + `admin_users.role` 스캔 (L-sec2)

단일-factor 패스워드/토큰 만으로 prod DB 를 변이할 수 있어
토큰 유출 시 바로 계정 탈취/전매물 삭제 시나리오가 성립한다.
L-sec112 IDOR 수정으로 horizontal privilege escalation 은 막았지만,
vertical (master/superadmin 탈취) 는 여전히 single-factor.

## 목표

1. master / superadmin / crawler_bridge 로그인에 TOTP 2nd factor 강제
2. 분실/재설정용 recovery codes (10개, SHA-256 해시 저장)
3. TOTP 활성화는 admin portal UI 에서 self-serve
4. brute-force 방지 — TOTP 검증 10회/10분 per-user rate limit

## 데이터 모델 (Supabase)

```sql
-- 2026-04-23-add-admin-mfa.sql
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret text,            -- base32, encrypted at rest
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_last_used_at timestamptz;

CREATE TABLE IF NOT EXISTS admin_mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,            -- sha256(code)
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_recovery_admin_id
  ON admin_mfa_recovery_codes(admin_user_id)
  WHERE consumed_at IS NULL;
```

`mfa_secret` 은 DB 에 저장하되 `MFA_ENCRYPTION_KEY` env (32바이트) 로 AES-256-GCM 암호화.
Supabase service_role 키가 유출되더라도 bare secret 은 노출되지 않도록.

## 서버 플로우

### enrollment (POST /api/admin/mfa/enroll)

```
1. verifyAdminAuth() 통과 필요 (현재 로그인된 admin)
2. generateSecret() → base32 20바이트
3. QR 용 otpauth URL 반환 (issuer=wishes, label=admin@wishes.co.kr)
4. mfa_secret = encrypt(secret, MFA_ENCRYPTION_KEY)
5. 아직 mfa_enabled=false — verify 후 true 로
```

### verify (POST /api/admin/mfa/verify)

```
1. body: { code: 6-digit }
2. 사용자 rate limit: `mfa:verify:uid:${uid}` — 10/10min
3. decrypt mfa_secret → speakeasy.totp.verify(window=1)
4. 성공 시: mfa_enabled=true, mfa_enrolled_at=now(), recovery_codes 10개 생성 반환
5. 실패 시: 400, audit('mfa.verify.fail')
```

### login challenge (POST /api/admin/mfa/challenge)

```
1. 1-factor (password/JWT) 통과 직후 호출
2. mfa_enabled=true 이면 challenge token 을 short-lived (5분) HMAC 으로 발급
3. client 는 /admin/mfa 페이지에서 code 입력 → POST /api/admin/mfa/login-verify
4. 성공 시에만 admin cookie/JWT 세션 완료
```

### recovery

```
POST /api/admin/mfa/recovery
  body: { recovery_code: "xxxx-xxxx-xxxx" }
  1) hash = sha256(normalize(recovery_code))
  2) admin_mfa_recovery_codes where consumed_at is null and code_hash=hash
  3) 발견 시 consumed_at=now(), mfa_last_used_at=now()
  4) 세션 발급 후 프론트에서 재등록 유도
```

## 클라이언트

- `/admin/mfa/setup` — QR + code input, speakeasy otpauth URL → qrcode.react
- `/admin/mfa/challenge` — 로그인 직후 숫자 패드
- `/mypage/security` (일반 사용자 미노출) — admin 전용

## 라이브러리 / 의존성

- `speakeasy` ^2.0 또는 `otplib` ^12 (RFC 6238 호환)
- `qrcode` 또는 `qrcode.react` (클라이언트 QR)
- crypto.subtle (Node >=20) AES-256-GCM 직접 구현

## 롤아웃

1. DB migration (add columns + table) — 기존 admin 무영향
2. /api/admin/mfa/* 4개 route 구현 + 단위 테스트
3. admin portal 의 /admin/mfa/setup 강제 배너 (미등록자에게 14일 grace)
4. 14일 후 MFA 미등록 admin 은 로그인 차단 (mfa_enabled=false → 403 at login-verify)
5. audit log 에 mfa.enroll / mfa.verify / mfa.recovery 전부 기록

## 리스크 / 주의

- `mfa_secret` encryption key 분실 시 전 admin 재등록 필요 → 3곳 복수 보관
- crawler_bridge 서버간 토큰은 TOTP 부적합 → 대신 IP 화이트리스트 + mTLS 로 분리
- Clock skew 허용은 ±1 step (30초) — 대부분 서버는 NTP 로 동기되어 있음
- 쿠키/세션 하이재킹 감지용으로 UA/IP 변화 로깅 추가 고려

## 체크리스트

- [ ] SQL migration 작성 + 스테이징 적용
- [ ] MFA_ENCRYPTION_KEY env 생성 + Vercel 3환경 주입
- [ ] speakeasy 의존성 추가
- [ ] /api/admin/mfa/{enroll,verify,challenge,login-verify,recovery} 구현
- [ ] 단위 테스트 (drift ±1 / replay 방지 / recovery code once-only)
- [ ] admin portal UI
- [ ] 14일 grace banner + 강제 차단 플래그
- [ ] audit log 덴스체크
- [ ] runbook: MFA 재설정 절차 (support 채널)

