# Toss Payments 키 등록 가이드 (PR-R-3-A)

> **대상**: 사장님 (이미 Toss 사업자 가입 + MID `KIO_wishesvlsk` 보유)
> **소요 시간**: 5분

---

## 1. 사장님 보유

대시보드: https://dashboard.tosspayments.com/sales-reports/tm/1319160?mid=KIO_wishesvlsk
- ✅ 사업자 인증 완료
- ✅ 정산 계좌 등록 완료
- ✅ MID `KIO_wishesvlsk`

남은 단계: **API 키만 Vercel 환경변수 등록**.

---

## 2. Toss 대시보드에서 키 복사

1. https://dashboard.tosspayments.com 로그인
2. 우측 상단 메뉴 → "개발자센터" → "API 키"
3. **테스트 키** vs **라이브 키** 선택:
   - 테스트: `ck_test_*` / `sk_test_*` (실제 결제 X, 가짜 결제로 테스트)
   - 라이브: `ck_live_*` / `sk_live_*` (실제 결제, 정산 동작)
4. 두 키 복사

> 권장: 처음엔 **테스트 키** 로 사장님이 직접 1번 결제 흐름 검증 → 정상 확인 후 라이브 키 교체.

---

## 3. Vercel 환경변수 등록

1. https://vercel.com/wishes-hyundo/wishes-v2 → Settings → Environment Variables
2. 추가 (3개):
   ```
   NEXT_PUBLIC_TOSS_CLIENT_KEY = ck_test_... (또는 ck_live_...)
   TOSS_CLIENT_KEY              = ck_test_... (서버용 동일)
   TOSS_SECRET_KEY              = sk_test_... (또는 sk_live_...)
   ```
3. 추가 (선택):
   ```
   NEXT_PUBLIC_REPORT_PRICE_KRW = 3000  (사장님 가격 정책)
   ```
4. Apply to: Production / Preview / Development 모두 체크
5. Save → 자동 재배포

---

## 4. 검증 (등록 후)

### 4.1 결제 페이지 접속
```
https://wishes.co.kr/report/buy/123456
```
(123456 = 실제 매물 ID)

### 4.2 테스트 결제 흐름
1. 이메일 입력 + 약관 체크
2. "₩3,000 결제하기" 클릭
3. Toss 결제창 → 카드 입력 (테스트 카드 `4330123412341234` 등)
4. 결제 완료 → `/report/success` 자동 redirect
5. "결제 완료" 메시지 확인
6. Toss 대시보드에서 거래 기록 확인

### 4.3 DB 확인
```sql
SELECT id, status, payment_id, amount_krw, user_email
FROM reports
ORDER BY created_at DESC
LIMIT 5;
```

---

## 5. 보안

- ✅ TOSS_SECRET_KEY 절대 클라이언트 노출 X (서버 only)
- ✅ NEXT_PUBLIC_TOSS_CLIENT_KEY 만 클라이언트 (Toss SDK 가 사용)
- ✅ DB 결제 정보 RLS (사용자 본인 + admin)
- ✅ 금액 변조 방어 (서버에서 amount 재검증)
- ❌ 카드/계좌 데이터 0 처리 (Toss 가 PCI DSS 처리)

---

## 6. 권리분석 활성화 (별도)

Toss 결제 = 활성화 (이번 PR).
**권리분석 발송**:
- CODEF API 등록 후 PR-R-3-B 활성화
- PR-O 법무 자문 후 면책 조항 + 약관 v2 확정 후 production

현재 (이번 PR 상태):
- ✅ 결제 완료 → reports.status='paid' 저장
- 🟡 권리분석 발송은 PR-R-3-B 활성화 후 (CODEF + 법무 후)

사장님이 결제만 먼저 받고, 권리분석 발송은 사장님이 직접 PDF 작성해서 보내실 수도 있음 (수동 모드).

---

## 7. 환불 정책 (RFC 0018 §4)

자동 환불 트리거:
- 등기부 발급 실패 (5분 초과)
- 분석 오류
- 사장님 admin 페이지에서 수동 환불

코드 활성화 (PR-R-3-B 에서):
```ts
import { refundPayment } from '@/lib/toss-client';
await refundPayment(paymentKey, '등기부 발급 실패');
```

---

작성: 2026-05-01 (PR-R-3-A)
