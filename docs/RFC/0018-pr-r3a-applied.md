# RFC 0018 Phase 2.B — PR-R-3-A 결제 페이지 활성화

> **상태**: 적용 완료 (2026-05-01)
> **참조**: PR-R-3 (#39 골격), 사장님 Toss 사업자 보유 (MID KIO_wishesvlsk)

---

## 적용 결과

사장님이 이미 Toss 사업자 가입 완료 → 가입 0, 키만 등록.

### 변경 (8 파일, ~720 lines)

| 파일 | 라인 | 역할 |
|---|---|---|
| `src/lib/toss-client.ts` | 133 | stub → 실제 confirmPayment / refundPayment |
| `src/app/api/reports/init/route.ts` | 98 | 결제 시작 (orderId 발급) |
| `src/app/api/payments/toss/confirm/route.ts` | 146 | 결제 승인 + DB 업데이트 |
| `src/app/report/buy/[listingId]/page.tsx` | 24 | 결제 페이지 SSR |
| `src/app/report/buy/[listingId]/BuyReportClient.tsx` | 198 | Toss SDK widget |
| `src/app/report/success/page.tsx` + Client | 118 | 결제 완료 callback |
| `src/app/report/fail/page.tsx` | 28 | 결제 취소 |
| `docs/setup/toss-payments-key.md` | 116 | 사장님 5분 가이드 |

### 결제 흐름

```
[/report/buy/123456]
  ↓ 사용자: 이메일 입력 + 약관 동의 + "₩3,000 결제"
  ↓
POST /api/reports/init
  ↓ reports.INSERT (status='pending')
  ↓ 응답: orderId='wishes-report-{id}'
  ↓
Toss SDK widget.requestPayment()
  ↓ Toss 결제창 (카드/계좌/간편)
  ↓
[Toss success_url]
  ↓ /report/success?paymentKey=...&orderId=...&amount=3000
  ↓
POST /api/payments/toss/confirm
  ↓ Toss API 호출 (검증)
  ↓ 금액 검증 (DB amount_krw 와 일치)
  ↓ reports.status='paid'
  ↓ payment_id 저장
  ↓
✓ 결제 완료 메시지
  ↓
[CODEF 활성화 후 PR-R-3-B]
  자동 권리분석 → PDF → 사장님 검토 → 사용자 이메일
```

### 보안

- TOSS_SECRET_KEY 서버 only (클라이언트 노출 X)
- 금액 변조 방어 (서버 amount 재검증)
- 중복 confirm 방지 (status='pending' 만 처리)
- orderId 형식 검증 (`/^wishes-report-\d+$/`)
- 카드 / 계좌 데이터 0 처리 (Toss PCI DSS)
- DB RLS (사용자 본인 SELECT + admin)

### 헌법 준수

- "안전한 결제" → Toss + 금액 검증 이중 가드
- "사장님 직접 검수 X" → 자동 결제 처리
- "비용 정책" → 사용자 ₩3K (Toss 수수료 3% = ₩90)
- "사용자 UI 부정적 표시 X" → 결제 페이지 마케팅 친화

### 회귀 안전망

- isTossEnabled() 체크 (env 미설정 시 503 + 안내)
- Toss API 타임아웃 15초
- 결제 실패 시 reports.status='failed' (아직 환불 미발생)
- 환불 자동화는 PR-R-3-B 활성화 후

### UI 영향

- 신규 페이지 3개: `/report/buy/[id]`, `/report/success`, `/report/fail`
- 매물 카드 변경 0 (별도 PR-R-3-B-FE 에서 "₩3,000 권리분석" 버튼 추가)
- /map / /admin / /search 영향 0
- robots: noindex (개인정보 보호)

---

## 사장님 액션 (5분)

[Toss 키 등록 가이드](../setup/toss-payments-key.md):
1. dashboard.tosspayments.com → 개발자센터 → API 키 복사
2. Vercel env 등록:
   - NEXT_PUBLIC_TOSS_CLIENT_KEY (ck_*)
   - TOSS_CLIENT_KEY (동일)
   - TOSS_SECRET_KEY (sk_*)
3. **테스트 키 먼저** → 1회 검증 → 라이브 키 교체

---

## 활성화 단계

### 즉시 가능 (이번 PR)
- ✅ 결제 페이지 (/report/buy/123456)
- ✅ Toss 결제창 호출
- ✅ 결제 승인 + reports.status='paid'
- ✅ 영수증 / 거래 트래킹 (Toss 대시보드)
- ✅ 환불 함수 (refundPayment)

### 별도 PR 필요
- 🟡 PR-R-3-B: CODEF 자동 호출 (사장님 CODEF 가입 후)
- 🟡 PR-R-3-C: PDF 생성 + 사장님 검토 큐
- 🟡 PR-R-3-D: 사용자 보고서 페이지 (`/report/[id]`)
- 🟠 PR-R-3-FE: 매물 카드 "₩3,000 권리분석" 버튼
- 🟠 PR-O: 법무 자문 (홈페이지 완성 직전 — 사장님 명령)

---

## 사장님 명령 일관

> "변호사 자문 비용드는 부분은 우선은 제외 — 정말 최종 제일 마지막 작업"

본 PR-R-3-A 는:
- 결제 인프라 완성 (Toss 자체 약관 활용)
- 권리분석 발송은 PR-R-3-B/C 에서 (CODEF + 법무 후)
- 사장님이 결제만 먼저 받고 PDF 수동 작성도 가능 (수동 모드)

---

작성: 2026-05-01 (PR-R-1-V2 직후, 사장님 Toss 활용)
