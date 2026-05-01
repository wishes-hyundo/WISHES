# RFC 0016 적용 완료 — PR-B NULL 정책

> **상태**: 적용 완료 (2026-05-01)
> **참조**: RFC 0016 (origin)

---

## 적용 결과

### 사장님 추천 default 적용 (RFC 0016 §7)
1. **다이제스트 빈도** — 매일 1통 (09:00 cron) ✅
2. **사용자 연락처 필수** — 전화 또는 이메일 (간단 검증) ✅
3. **Cloudflare Turnstile** — 후속 PR-B-2 (현재는 IP rate limit 만)

### 변경 (6 파일)

| 파일 | 변경 내용 |
|---|---|
| `docs/migrations/pr_b_info_requests_2026-05-01.sql` | info_requests 테이블 + RLS |
| `src/app/api/listings/[id]/info-request/route.ts` | POST endpoint (136 lines) |
| `src/hooks/useInfoRequest.ts` | 클라이언트 hook (111 lines) |
| `src/components/InfoRequestModal.tsx` | ARIA 모달 (202 lines) |
| `src/app/api/cron/info-requests-digest/route.ts` | 매일 다이제스트 (158 lines) |
| `vercel.json` | cron `0 9 * * *` 추가 (28 → 29 jobs) |

### DB 스키마

```sql
CREATE TABLE info_requests (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id),
  request_type TEXT CHECK (... IN ('area', 'price', 'address', 'other')),
  user_contact TEXT NOT NULL CHECK (length BETWEEN 8 AND 64),
  user_message TEXT (... <= 500),
  user_ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  notified_in_digest_at TIMESTAMPTZ
);
```

RLS:
- INSERT — anonymous 허용 (사용자 문의)
- SELECT/UPDATE — admin 전용 (`auth.jwt() ->> 'email' = 'wishes@wishes.co.kr'`)

### 흐름

```
사용자 매물 카드 "면적 문의" 클릭
  ↓
<InfoRequestModal listingId={id} requestType="area" />
  ↓ submit
useInfoRequest.submit()
  ↓ POST /api/listings/:id/info-request
  ↓ rate limit (IP 1분 1회)
  ↓ INSERT info_requests
  ↓ 200 OK + 토스트 "문의 접수"
  ↓
[09:00 cron] /api/cron/info-requests-digest
  ↓ SELECT WHERE notified_in_digest_at IS NULL
  ↓ Resend 이메일 1통 → wishes@wishes.co.kr
  ↓ UPDATE notified_in_digest_at = NOW()
```

### 헌법 준수

| 헌법 명시 | 구현 일관 |
|---|---|
| "면적 정보 부족 = 비공개 X" | 모달은 광고 보존 + 문의 채널만 추가 |
| "사용자 UI 부정적 표시 X" | 모달 본문 마케팅 친화 ("사장님이 곧 연락") |
| "사장님 손 가는 검수 페이지 X" | 매일 다이제스트 1통, 클릭 없이 일괄 확인 |
| "Resend 이메일만" | 카톡 알림톡 0 호출 |
| "전국 부동산" | 지역 필터 없음 (17 시도 모두) |

### UI 영향

- **매물 카드 자체 변경 0** — 모달 mount 만 (별도 PR-B-FE 에서 카드 통합)
- **모달 표시 시점** — 사용자가 "면적 문의" 클릭한 경우만 (의식적 행동)
- **`/admin` / `/search`** 영향 0

### 회귀 안전망

- DB CHECK 제약 (request_type whitelist, contact 길이)
- 클라이언트 + 서버 rate limit (이중 가드)
- HTML escape (Resend 이메일 본문, XSS 방어)
- ARIA dialog + ESC 닫기 + focus trap
- aria-modal=true (시니어 토글 호환)

---

## 후속 PR

- **PR-B-FE** 매물 카드 (`ListingCard.tsx`) "면적 문의" 클릭 통합
- **PR-B-2** Cloudflare Turnstile (CAPTCHA, 스팸 방어 강화)
- **PR-B-3** /admin/info-requests 응답 페이지 (사장님 답변 → 사용자 follow-up 이메일)
- **PR-B-4** Auto-enrichment 시도 (V-World 건축물대장 API, 문의 발생 시 자동 fetch)

---

작성: 2026-05-01 (RFC 0016 origin 적용)
