# RFC 0016 — PR-B: NULL 정책 + UI 모달 (정보 부족 매물 처리)

> **상태**: Draft → 사장님 승인 대기
> **작성**: 2026-05-01
> **라벨**: `[UI:1]` `[approval-required]`
> **참조**: CLAUDE.md `면적 정보 부족 = 비공개 사유 X` / `사용자 UI 부정적 표시 X` / `formatArea.ts 폴백`

---

## 0. 11 줄 자기검증

- [x] Discovery — 12K 매물 중 면적 NULL = 1,800건 / 가격 NULL = 200건
- [x] 회귀 0 — 비공개 처리 X (헌법 명시)
- [x] 무료/OSS — 클라이언트 모달 (라이브러리 0)
- [x] 만든 것 보존 — formatArea.ts 폴백 함수 그대로 (PR-G2-AREA)
- [x] UI 헌법 §54 — 카드 표시 변경 0, "문의" 클릭 시에만 모달
- [x] 네이버·구글 SEO — 영향 0
- [x] 5 층 방어 — axe-core CI 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 — 정보 부족 매물도 광고 진행 (헌법 명시)
- [x] Phase 1 인프라 보강
- [ ] [UI:1] — 사장님 승인 필수

---

## 1. 헌법 명시 정책

### 1.1 CLAUDE.md `면적 정보 부족 = 비공개 사유 X`
> 영업 손실 방지 — 면적 미확정 매물도 광고 진행
> auto_fix_problematic_listings 의 hidden_area_invalid 로직 영구 제거

### 1.2 CLAUDE.md `사용자 UI 부정적 표시 X`
> 금지: "면적 미정" / "신뢰도 낮음" / "확인 불가"
> 대신: 면적 모름 → "면적 문의"

본 RFC 는 **상기 정책 일관 적용**.

---

## 2. Scope (3 파일 추가, 2 수정)

### 2.1 신규 — 정보 문의 모달
`src/components/InfoRequestModal.tsx` (120줄):
- 트리거: 매물 카드 "면적 문의" / "가격 문의" / "주소 문의" 클릭
- 본문: 매물 ID + 어떤 정보 요청 + 사용자 연락처 입력
- 버튼: "사장님께 문의" (Resend 이메일 자동 발송) / 닫기

### 2.2 신규 — Hook
`src/hooks/useInfoRequest.ts` (60줄):
- POST `/api/listings/:id/info-request`
- 사용자 입력 sanitize (XSS 방어)
- localStorage rate limit (1분 1회)

### 2.3 신규 — API endpoint
`src/app/api/listings/[id]/info-request/route.ts` (90줄):
- Resend 이메일 → 사장님 (`wishes@wishes.co.kr`)
- 본문: 매물 ID + 사용자 연락처 + 요청 정보 종류
- DB log (`info_requests` 테이블, RLS)

### 2.4 신규 — RFC 본 문서
`docs/RFC/0016-pr-b-null-policy.md`

### 2.5 수정 — 매물 카드
`src/components/listings/ListingCard.tsx`:
- area_m2 = 0 → "면적 문의" 클릭 가능 (모달 mount)
- 가격 NULL → "가격 문의" 동일
- 부정적 단어 0 (헌법 준수)

### 2.6 수정 — formatArea.ts (확장)
`src/lib/formatArea.ts`:
- "면적 문의" 표시 시 onClick 핸들러 prop 추가

---

## 3. UX 정책

### 3.1 매물 카드 표시 (헌법 일관)
| DB 상태 | 표시 |
|---|---|
| 공급 > 전용 모두 있음 | "전용 23.5㎡ (7.1평) / 공급 31.2㎡ (9.4평)" |
| area_m2 > 0 | "23.5㎡ (7.1평)" |
| area_m2 = 0 / NULL | "면적 문의" (clickable, 파란색 link) |
| 가격 NULL | "가격 문의" (clickable) |

### 3.2 모달 본문
```
🏠 매물 #123456 정보 문의

이 매물의 면적 정보가 미확정입니다.
정확한 면적을 확인하려면 사장님께 문의 가능합니다.

연락처: [전화번호 입력]
[사장님께 문의]
```

### 3.3 사장님 받는 이메일 (Resend)
```
제목: [WISHES] 매물 #123456 면적 문의
본문:
- 사용자 연락처: 010-1234-5678
- 요청 정보: 면적
- 매물 URL: https://wishes.co.kr/map?listing=123456
- 요청 시각: 2026-05-01 14:23
```

---

## 4. 데이터베이스

### 4.1 신규 테이블 `info_requests`
```sql
CREATE TABLE info_requests (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT REFERENCES listings(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('area', 'price', 'address')),
  user_contact TEXT NOT NULL,
  user_ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX idx_info_requests_listing ON info_requests(listing_id);
CREATE INDEX idx_info_requests_pending ON info_requests(created_at) WHERE responded_at IS NULL;
```

### 4.2 RLS
- 사용자: INSERT 만 (anonymous 허용)
- 사장님 (`/admin/*`): SELECT 전부

---

## 5. 위험 + 완화

| 위험 | 완화 |
|---|---|
| 스팸 문의 폭주 | rate limit 1분 1회 / IP + Cloudflare Turnstile |
| 사장님 이메일 받은편지함 폭주 | 매일 1통 다이제스트 (cron + Resend, PR-G3 패턴) |
| 사용자 연락처 유출 | Supabase RLS + admin 전용 SELECT |
| 모달 ARIA 위반 | aria-modal=true + focus trap + ESC 닫기 |

---

## 6. 보존 (헌법 §101)

- formatArea.ts 폴백 (PR-G2-AREA) 그대로
- area_split_suspected (DB) admin 만 노출
- /admin/* 의심 플래그 검토 페이지 영향 0
- /search vanilla 영향 0 (모달 미적용)

---

## 7. 사장님 결정 필요

1. **이메일 다이제스트 빈도**: 즉시 (건당) vs 매일 1통?
2. **사용자 연락처 필수**: 전화 vs 이메일 vs 둘 중 하나?
3. **Cloudflare Turnstile** 사용 (CAPTCHA 무료 OSS)?

---

## 8. 후속 PR

- **PR-B-2** 사장님 admin 답변 페이지 (info_requests 응답)
- **PR-B-3** 자동 enrichment 시도 (V-World API, info_request 발생 시)
- **PR-B-4** 사용자 follow-up (사장님 응답 시 사용자에게 이메일)

---

작성: 2026-05-01
