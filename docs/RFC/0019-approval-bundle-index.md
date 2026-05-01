# RFC 0019 — 승인 대기 항목 INDEX (사장님 검토용)

> **상태**: 사장님 검토 대기
> **작성**: 2026-05-01
> **목적**: 승인 필요 RFC 4건 + 마스터 RFC 1건 + 외부 의존 가이드 2건 한눈에

---

## 검토 항목 (총 7건)

| # | 문서 | 종류 | 비용 | 사장님 결정 |
|---|---|---|---|---|
| 1 | [RFC 0014 시니어 토글](./0014-pr-m2-senior-toggle.md) | RFC | 0원 | floating 위치 / 폰트 배율 / hint |
| 2 | [RFC 0015 푸시 동의 UI](./0015-pr-n4-push-consent-ui.md) | RFC | 0원 | 트리거 / 카피 / 디자인 |
| 3 | [RFC 0016 NULL 정책](./0016-pr-b-null-policy.md) | RFC | 0원 | 다이제스트 빈도 / Turnstile |
| 4 | [RFC 0017 PR-C 잔여 폐기](./0017-pr-c-residual-deprecation.md) | RFC | 0원 (절감) | 4개 폐기 OK? |
| 5 | [RFC 0018 권리분석 + Freemium 마스터](./0018-master-rights-analysis-freemium.md) | STRATEGIC | ₩1,100/건 원가 | CODEF + Toss / 가격 정책 / PR-O |
| 6 | [VAPID 가이드 (PR-N-2)](../setup/web-push-vapid.md) | 가이드 | 0원 | 등록 진행 (5분) |
| 7 | [법무 자문 brief (PR-O)](../legal/legal-counsel-brief.md) | 의뢰 | ₩30~50만 | 옵션 A/B/C/D |

---

## 우선순위 추천

### 즉시 진행 (UI 영향 0, 결정 간단)
1. **RFC 0017 PR-C 폐기** — 사장님 피드백 반영, 4개 cron 비활성화 (Vercel 사용량 절감)
2. **VAPID 가이드** — 5분 등록, 무료, PR-N-2 unblock

### 1주 내 결정
3. **RFC 0014 시니어 토글** — 헌법 §3 명시 요구, opt-in
4. **RFC 0015 푸시 동의** — VAPID 등록 후 PR-N-4 진행 가능
5. **RFC 0016 NULL 정책** — 사장님 영업 손실 방지 명령 일관

### 2-3주 결정
6. **RFC 0018 마스터플랜** — 전략적, 외부 등록 (CODEF/Toss) 1-2주
7. **PR-O 법무 자문** — RFC 0018 진행 결정 후 의뢰 (병행 가능)

---

## 사장님 한 줄 답변 권장 형식

```
1. RFC 0017: 4개 폐기 OK
2. VAPID: 등록 완료 (저녁에)
3. RFC 0014: floating 우측 하단, 1.25배 OK, hint 자동
4. RFC 0015: 저장검색 직후, "이메일만 OK" 라벨로
5. RFC 0016: 매일 다이제스트, Turnstile OK
6. RFC 0018: CODEF+Toss 등록 진행, 가격 B(₩3K), PR-O 옵션 A
7. PR-O: 옵션 A ₩30만, 사장님 직접 매칭
```

각 RFC 의 "사장님 결정 필요" 섹션에 상세 옵션 명시.

---

## 검토 후 다음 단계

사장님 승인 → Claude 가 즉시:
- RFC 0017 → 1 PR (cron 4개 비활성화, 30분 작업)
- RFC 0014 → 1 PR (시니어 토글 구현, 4시간)
- RFC 0015 → 1 PR (푸시 동의 UI, 4시간) — VAPID 등록 후
- RFC 0016 → 1 PR (NULL 정책 + 모달 + API + DB, 6시간)
- RFC 0018 → 7 PR 분할 (Phase 2 마스터, 10주)

---

작성: 2026-05-01
