# RFC 0018 Phase 2.B+C — PR-R-3 권리분석 골격 (스켈레톤)

> **상태**: 골격 (인프라 토대) 적용 완료 (2026-05-01)
> **참조**: RFC 0018 마스터플랜
> **활성화**: PR-R-3-Activate (별도) — 사장님 외부 등록 후

---

## 적용 범위 (이번 PR)

**골격만** — 외부 의존 (CODEF + Toss + 법무) 활성화 전 토대.

| 영역 | 골격 | 활성화 |
|---|---|---|
| DB 스키마 (reports + registry_raw) | ✅ | 즉시 사용 가능 |
| RLS (사용자 본인만 SELECT) | ✅ | 즉시 |
| 만료 정책 (registry_raw 30일) | ✅ | 인덱스 준비 |
| CODEF client 라이브러리 | ✅ stub | env 등록 후 호출 |
| Toss client 라이브러리 | ✅ stub | env 등록 후 호출 |
| 권리분석 알고리즘 | ✅ | 즉시 사용 가능 (CODEF 응답 후) |
| 결제 페이지 / 보고서 페이지 | ❌ | PR-R-3-A (UI) |
| Webhook handler | ❌ | PR-R-3-B (결제 후) |

---

## 변경 (4 파일, +459 lines)

| 파일 | 라인 |
|---|---|
| `docs/migrations/pr_r3_reports_2026-05-01.sql` | 136 |
| `src/lib/codef-client.ts` | 79 (stub) |
| `src/lib/toss-client.ts` | 97 (stub) |
| `src/lib/rights-analyzer.ts` | 147 (실제 알고리즘) |

---

## 권리분석 알고리즘 (사장님 도메인 통찰 인코딩)

**큼지막한 것만** (CLAUDE.md 명시):

### Danger (위험)
- 가압류 / 압류 등기 발견
- 경매 진행 중
- 1년 내 소유권 이전 3회+ (이중매매 의심)

### Warning (경고)
- 근저당 합 > 매물가 80%

### Caution (주의)
- 근저당 합 60-80%
- 신탁 등기
- 가등기
- 임차권 등기

### Safe (안전)
- 위 항목 없음

**자동 X (사장님 영역)**:
- 시세 추정 (CLAUDE.md "AI 시세 추정 X")
- 법률 자문 (PR-O 변호사)
- 협상 / 조건 (사장님 13년 노하우)
- 현장 검증

---

## 면책 조항 (PR-O 법무 자문 후 확정)

```
본 분석은 등기부등본 자동 분석 결과 (참고용)입니다.
최종 매수 결정은 변호사 자문 + 현장 검증 후 진행하시기 바랍니다.
실측 / 도면 / 임대차 현황은 본 분석 범위 외입니다.
```

---

## 활성화 단계 (사장님 결정 후)

### Phase 2.B (결제 인프라)
1. **사장님**: Toss Payments 사업자 인증 (3-5일)
2. **사장님**: Vercel env `TOSS_CLIENT_KEY` + `TOSS_SECRET_KEY` 등록
3. **PR-R-3-A**: 결제 페이지 (`/report/buy/[listing_id]`) + Toss SDK
4. **PR-R-3-B**: Toss webhook handler + 환불 자동화

### Phase 2.C (CODEF + 권리분석)
5. **사장님**: CODEF developer 가입 (1주)
6. **사장님**: Vercel env `CODEF_CLIENT_ID` + `CODEF_CLIENT_SECRET` 등록
7. **PR-R-3-C**: CODEF 실제 호출 + raw 파싱 + analyzeRights() 호출
8. **PR-R-3-D**: PDF 생성 + 사장님 검토 큐 + 사용자 발송

### Phase 2.D (법무)
9. **사장님**: PR-O 변호사 자문 의뢰 (₩30~50만)
10. 약관 / 처리방침 / 면책 조항 v2 확정
11. 환불 정책 자동화

**합계**: 약 10주 (RFC 0018 §10)

---

## DB 스키마 요약

```sql
reports:
  status TEXT (8 단계: pending → paid → fetching → analyzed → reviewed → delivered | refunded | failed)
  amount_krw INTEGER (가격 정책 사장님 결정)
  risk_level TEXT (safe / caution / warning / danger)
  risk_reasons JSONB

registry_raw:
  property_address / property_area_m2 / property_purpose
  ownership_history JSONB (시간순)
  liens JSONB (배열)
  expires_at (30일, 개인정보보호법)
```

---

## 비용 분석 (단위 매물 1건, RFC 0018 §4)

| 항목 | 원가 |
|---|---|
| CODEF 등기부 | ₩1,000 |
| Toss 수수료 | ₩90 (3% × ₩3,000) |
| Resend / Storage / Vercel | ₩0 |
| **합계** | **~₩1,100** |

추천 가격 ₩3,000 → 마진 ₩1,900 (63%).

---

## 헌법 준수

- "AI 시세 추정 X" → 권리분석은 사실 기반 (등기 명시 정보)
- "사장님 영역 보존" → 협상/시세는 자동 X
- "비용 정책" → 사용자 ₩3,000 < 헌법 ₩500 한도
- "자동화 우선" → CODEF 자동 fetch + 알고리즘 자동
- "사장님 받은편지함 보호" → 매일 다이제스트 (PR-G3 패턴)

---

## UI 영향 = 0

이번 PR (골격) 은 라이브러리 + DB 만. 사용자 페이지 0 (별도 PR-R-3-A).

---

## 후속 PR (RFC 0018 §6 분할)

- **PR-R-3-A** 결제 페이지 + Toss 통합 (사장님 Toss 가입 후)
- **PR-R-3-B** Webhook + CODEF 자동 호출 (사장님 CODEF 가입 후)
- **PR-R-3-C** PDF 생성 + 사장님 검토 큐 (PR-O 후)
- **PR-R-3-D** 사용자 보고서 페이지 + 발송

---

작성: 2026-05-01 (PR-R-2 직후, Phase 2.A 완료, Phase 2.B+C 시작)
