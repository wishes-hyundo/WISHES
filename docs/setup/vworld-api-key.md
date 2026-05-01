# V-World API 키 등록 가이드 (PR-R-1)

> **대상**: 사장님 (wishes@wishes.co.kr)
> **소요 시간**: 5분
> **비용**: 0원

---

## 1. 왜 필요?

PR-R-1 (#TBD) 이 V-World 건축물대장 자동 fetch 인프라 완성.
**API 키가 있어야 정부 건축물대장 데이터 자동 조회 시작**.

자동 보강 대상 (사장님 도메인 통찰):
- ✅ 아파트 / 오피스텔 / 상가 / 사무실 — 전유부/등록 명확
- ❌ 빌라 / 다가구 / 단독 — 도면/실측 필수, 자동 X

---

## 2. 등록 절차 (5분)

### 2.1 V-World 회원가입
1. https://www.vworld.kr 접속
2. 우측 상단 "회원가입"
3. 사업자 회원 (WISHES 부동산) 선택
4. 사업자등록번호 입력 + 약관 동의

### 2.2 인증키 발급
1. 로그인 후 "인증키 신청"
2. 사용 목적: "부동산 매물 검증 자동화"
3. 사용 도메인: `wishes.co.kr`
4. 즉시 발급 (관리자 승인 X, 자동)

### 2.3 발급된 키 형식
```
VWORLD_API_KEY=ABCD1234-EF56-78GH-IJ90-KLMNOPQRSTUV
```

---

## 3. Vercel 환경변수 등록

1. https://vercel.com/wishes-hyundo/wishes-v2 → Settings → Environment Variables
2. 추가:
   - `VWORLD_API_KEY` = (위에서 발급받은 키)
3. Apply to: Production / Preview / Development 모두 체크
4. Save

자동 재배포 트리거 → 다음 새벽 3:30 cron 부터 자동 시작.

---

## 4. 검증 (등록 후)

### 4.1 수동 테스트
```bash
curl https://wishes.co.kr/api/cron/enrich-building-register
```

응답 예시 (성공):
```json
{
  "success": true,
  "processed": 100,
  "succeeded": 87,
  "failed": 13,
  "violations": 4,
  "eligible_types": ["아파트", "오피스텔", "상가", "사무실"]
}
```

### 4.2 admin 패널 확인 (별도 PR-R-1-Admin)
- 위반건축물 목록 페이지
- 사용승인일 / 주용도 자동 채워짐 확인

---

## 5. 일일 한도

V-World 무료 tier:
- 일 1,000 호출 (자정 reset)
- 매일 새벽 3:30 cron 100건 = 한도 10% 사용
- 12,000 매물 / 100건 = 약 120일이면 전체 보강 완료

한도 초과 시 자동 다음 날로 미루어짐 (cron 실패 X, 로그만 기록).

---

## 6. 보안

- ✅ API 키는 Vercel 환경변수 (소스 git 노출 X)
- ✅ V-World API 는 도메인 화이트리스트 (`wishes.co.kr` 만 호출 가능)
- ❌ 키 외부 노출 시 즉시 V-World 에서 재발급

---

## 7. 후속 PR

- **PR-R-1-Admin** 위반건축물 admin 패널
- **PR-R-2** 공시지가 / 개별주택가격 자동 fetch (data.go.kr 무료, 동일 패턴)
- **PR-R-1-FE** 매물 카드 사용승인일 표시 (사용자 UI)

---

작성: 2026-05-01
