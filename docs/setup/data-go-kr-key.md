# data.go.kr API 키 등록 가이드 (PR-R-1-V2)

> **대상**: 사장님 (이미 data.go.kr 가입 + 키 보유)
> **소요 시간**: 5분 (Vercel 환경변수 등록만)
> **비용**: 0원

---

## 1. 사장님 보유 키

`data.go.kr` 마이페이지 → 활용신청한 서비스 목록 → 건축물대장 정보 서비스 (`BldRgstHubService`) 의 인증키.

이미 발급받은 키 형식:
```
DATA_GO_KR_API_KEY=ABCD1234%2BEFGH5678%2BIJKL9012%2B... (URL encoded)
```

---

## 2. Vercel 환경변수 등록

1. https://vercel.com/wishes-hyundo/wishes-v2 → Settings → Environment Variables
2. 추가 (둘 중 하나만):
   - `DATA_GO_KR_API_KEY` (권장)
   - 또는 `BUILDING_LEDGER_API_KEY` (코드 호환)
3. Apply to: Production / Preview / Development 모두 체크
4. Save → 자동 재배포 (10분 내)

---

## 3. 자동 시작 (등록 후)

`backfill-building-info` cron 이 매 2시간마다 50건 처리:
- 면적 자동 보강 (privArea > supplyArea > totArea)
- 건물명 / 주용도 / 사용승인일
- **PR-R-1-V2 추가**: 위반건축물 (vlNoticeYn) 자동 감지

데이터 출처 (admin field_sources):
- `data_go_kr` — 신규 자동 보강
- `auto` — 기존 (구버전)
- `broker` — 사장님 직접 입력 (자동 X)

---

## 4. 검증

### 4.1 수동 테스트
```bash
curl https://wishes.co.kr/api/cron/backfill-building-info?limit=5
```

응답:
```json
{
  "ok": true,
  "scanned": 5,
  "success": 4,
  "skipped_broker_locked": 1,
  "error": 0
}
```

### 4.2 admin 패널 확인
- 위반건축물 매물 검토 큐 (별도 PR-R-1-Admin)
- 사용승인일 / 주용도 자동 채워짐

---

## 5. 일일 한도

`data.go.kr` 무료 tier:
- 일 10,000 호출
- backfill-building-info: 50건/2시간 × 12회 = **600건/일** (한도 6%)
- Kakao 호출 (주소→법정동) 동시: 100K/일 무료 (여유 충분)

12,000 매물 / 600 = **약 20일** 만에 전체 보강 완료.
(V-World 한도 1K 였다면 120일 → **6배 단축**)

---

## 6. 보안

- ✅ API 키는 Vercel 환경변수 (소스 git 노출 X)
- ✅ data.go.kr 는 IP 화이트리스트 가능 (선택)
- ❌ 키 외부 노출 시 즉시 data.go.kr 마이페이지에서 재발급

---

## 7. 후속 PR

- **PR-R-1-Admin** 위반건축물 검토 패널 (사장님 큐)
- **PR-R-1-FE** 매물 카드 사용승인일 표시
- **PR-R-2-V2** 공시지가 / 개별주택가격도 data.go.kr 우선 (LdpService 등)

---

작성: 2026-05-01 (data.go.kr 우선 전환)
