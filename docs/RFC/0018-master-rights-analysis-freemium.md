# RFC 0018 — 마스터플랜: 권리분석 + Freemium 결제 시스템

> **상태**: Draft → 사장님 최종 비전 정리
> **작성**: 2026-05-01
> **라벨**: `[STRATEGIC]` `[multi-PR]` `[approval-required]`
> **참조**: 사장님 비전 — `방문 없이 매물 의사결정 / 권리분석 자동화 / 큼지막한 것만 자동, 디테일은 사장님` / `등기부등본 ₩3K 유료 발급 가능` / 비교 플랫폼 rter.kr / savehome.kr

---

## 0. 11 줄 자기검증

- [x] Discovery — 비교 플랫폼 분석 + CODEF API 비용 검토
- [x] 회귀 0 — 무료 tier 기본 (현재 사용자 영향 0)
- [x] 무료/OSS — Toss Payments / Stripe 결제 무료 tier (3.0% 수수료만)
- [x] 만든 것 보존 — /map, /admin 영향 0 (별도 라우트 /report)
- [x] UI 헌법 §54 — 새 페이지 (영향 격리)
- [x] 네이버·구글 SEO — 권리분석 보고서는 noindex (개인정보 보호)
- [x] 5 층 방어 — 결제 / 등기부 / 사용자 데이터 격리
- [x] 0 회귀 머지
- [x] 세 페르소나 — 일반/투자자/시니어 모두 의사결정 지원
- [x] Phase 2 핵심
- [ ] [STRATEGIC] — 사장님 최종 비전 승인 필수

---

## 1. 비전 (사장님 명시)

### 1.1 핵심 가치 제안
> "고객이 방을 보고 결정하는데 있어서 당연히 방 사이즈나 위치 금액이 엄청 중요...
> 권리분석에서도 끝내는 실제 현장조사가 필요한것처럼 100% 완벽한건 아니니간 정말 큼지막한 것만 자동, 디테일은 사장님"

### 1.2 3-Tier 사용자 분리
| Tier | 무료/유료 | 정보 깊이 |
|---|---|---|
| **Browse** | 무료, 회원가입 X | 매물 카드 + 기본 정보 (현재 /map) |
| **Inspect** | 무료, 회원가입 O | 자체 콘텐츠 30자+ + 학세권/지하철 + 기본 권리분석 (대장 자동 fetch) |
| **Report** | 유료 ₩3,000+ | 등기부등본 자동 발급 + 정밀 권리분석 + PDF 리포트 |

### 1.3 비교 플랫폼
- **rter.kr** (알권리), **savehome.kr** (세이브홈) — 등기부 자동 분석 시장 검증된 모델
- 우리 차별: **부동산 매물 + 권리분석 통합** (그들은 분석만)

---

## 2. 권리분석 자동화 범위 (큼지막한 것만)

### 2.1 자동 (Tier Inspect, 무료)
- ✅ **건축물대장** (V-World 무료) — 위반건축물 / 무허가 / 사용승인일
- ✅ **공시지가** (data.go.kr 무료) — 정부 평가액
- ✅ **개별주택가격** (data.go.kr 무료) — 정부 평가액
- ✅ **국토부 실거래가** (RTMS API 무료) — 동일 단지 거래 (참고만, 시세 추정 X)
- ✅ **위반건축물 표시** — 매물 카드 빨간 라벨
- ✅ **불법 사용 여부** — admin 자체 인증 매물 (사장님 검증)

### 2.2 자동 (Tier Report, 유료 ₩3,000)
- ✅ **등기부등본 표제부** — 부동산 위치 / 면적 / 구조
- ✅ **갑구 (소유권)** — 소유자 / 매매 이력 / 이중매매 위험 검토
- ✅ **을구 (저당권/근저당)** — 부채 / 가압류 / 임차권
- ✅ **권리분석 알고리즘**:
  - 근저당 + 임차보증금 합 > 매물가 80% → 위험 알림
  - 가압류 / 압류 / 경매 진행 → 위험 알림
  - 신탁 / 가등기 → 주의 알림
- ✅ **PDF 리포트 자동 생성** (사장님 검토 후 사용자 발송)

### 2.3 디테일 (사장님 영역, 자동 X)
- ❌ **시세 추정** (CLAUDE.md AI 시세 추정 X)
- ❌ **법률 자문** (PR-O 법무 자문 별도)
- ❌ **현장 검증** (사장님 직접 방문 시 보강)
- ❌ **개별 협상** (사장님 노하우 13년)

---

## 3. 결제 인프라

### 3.1 결제 게이트웨이 (선택)
| 옵션 | 수수료 | 등록 비용 | 비고 |
|---|---|---|---|
| **Toss Payments** | 3.0% | 0원 | 한국 1순위, KCP 호환 |
| **포트원 (구 아임포트)** | 3.0% | 0원 | 다중 PG 통합 (선택) |
| **Stripe** | 2.9% + ₩300 | 0원 | 글로벌 (해외 사용자 대비) |

**추천**: Toss Payments — 한국 사용자 100%, UX 최적, KISO 인증 업체.

### 3.2 결제 흐름
```
사용자: 매물 카드 "정밀 분석 ₩3,000" 클릭
  ↓
/report/buy?listing=ID
  ↓
Toss Payments 결제창 (모바일 webview / PC 이동)
  ↓
결제 완료 webhook → /api/payments/webhook
  ↓
DB 'reports' 테이블 status='paid'
  ↓
CODEF API → 등기부등본 fetch (5초)
  ↓
권리분석 알고리즘 실행
  ↓
PDF 생성 (사장님 검토 알림)
  ↓
사장님 검토 OK → 사용자 이메일 발송
  ↓
/report/[id] (사용자 마이페이지 영구 저장)
```

---

## 4. 비용 분석 (단위 매물 1건)

### 4.1 원가
| 항목 | 비용 (₩) | 비고 |
|---|---|---|
| CODEF 등기부 | 1,000 | 인터넷등기소 통합 |
| Toss 수수료 | 90 | ₩3,000 × 3% |
| Resend 이메일 | 0 | 무료 100K |
| Vercel cron | 0 | 무료 tier |
| Supabase storage | 0.01 | PDF ~200KB |
| AI Vision (선택) | 5 | Gemini Flash 무료 한도 |
| **합계** | **~1,100** | |

### 4.2 마진
- 판매: ₩3,000
- 원가: ₩1,100
- 마진: ₩1,900 (63%)

### 4.3 가격 정책 (사장님 결정 필요)
| 시나리오 | 가격 | 마진 | 비고 |
|---|---|---|---|
| **A** ₩2,000 | ₩900 | 30% | 가격 경쟁력 |
| **B** ₩3,000 | ₩1,900 | 63% | 추천 (rter.kr 가격대) |
| **C** ₩5,000 | ₩3,900 | 78% | 프리미엄 |
| **D** 월 구독 ₩9,900 | (월 5건+) | 변동 | 투자자 타겟 |

---

## 5. 데이터베이스 스키마

### 5.1 신규 테이블
```sql
-- 결제 + 보고서 트래킹
CREATE TABLE reports (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  listing_id BIGINT REFERENCES listings(id),
  status TEXT CHECK (status IN ('pending', 'paid', 'fetching', 'analyzed', 'reviewed', 'delivered', 'refunded')),
  payment_provider TEXT DEFAULT 'toss',
  payment_id TEXT,           -- Toss tid
  amount_krw INT,
  registry_pdf_path TEXT,    -- Supabase storage
  analysis_pdf_path TEXT,
  risk_level TEXT CHECK (risk_level IN ('safe', 'caution', 'warning', 'danger')),
  risk_reasons JSONB,
  delivered_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_user ON reports(user_id);
CREATE INDEX idx_reports_listing ON reports(listing_id);
CREATE INDEX idx_reports_pending_review ON reports(created_at) WHERE status = 'analyzed';

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_user_select ON reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY reports_admin_all ON reports USING (auth.email() = 'wishes@wishes.co.kr');
```

### 5.2 등기부 raw 데이터
```sql
CREATE TABLE registry_raw (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES reports(id),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  -- 표제부
  property_address TEXT,
  property_area_m2 NUMERIC,
  -- 갑구 (배열, 시간순)
  ownership_history JSONB,
  -- 을구 (저당권 / 가압류 등)
  liens JSONB,
  -- 원본 PDF
  pdf_path TEXT
);
```

---

## 6. PR 분할 (마스터 → 7 PR)

### Phase 2.A — 무료 tier 강화 (PR 3건)
- **PR-R-1** 건축물대장 자동 fetch + 매물 카드 표시 (V-World)
- **PR-R-2** 위반건축물 빨간 라벨 + 정확도 confidence
- **PR-R-3** 공시지가 / 실거래가 admin 패널 (UI 표시 X, admin 만)

### Phase 2.B — 결제 인프라 (PR 2건)
- **PR-P-1** Toss Payments 통합 + reports 테이블 + webhook
- **PR-P-2** 사용자 마이페이지 + 환불 처리 + 영수증

### Phase 2.C — 권리분석 (PR 2건)
- **PR-R-4** CODEF API 통합 + registry_raw 파싱 + PDF 생성
- **PR-R-5** 권리분석 알고리즘 + 사장님 검토 흐름 + 이메일 발송

---

## 7. 외부 의존 (사장님 승인 필요)

### 7.1 CODEF API 등록
- 공식 문서: https://developer.codef.io
- 비용: 등기부등본 발급 건당 ₩1,000 (선결제 / 후정산)
- 등록 절차: 사업자등록증 + 약관 동의 + API key 발급 (1주)
- **사장님 결정 필요** — 등록 진행?

### 7.2 Toss Payments 등록
- 공식 문서: https://docs.tosspayments.com
- 비용: 가입 0원 / 거래 3.0%
- 등록 절차: 사업자 인증 + 정산 계좌 + KCP 심사 (3-5일)
- **사장님 결정 필요** — 등록 진행?

### 7.3 PR-O 법무 자문 (외부 ₩30~50만)
- 권리분석 알고리즘 법적 자문
- 약관 / 개인정보처리방침 / 환불정책 작성
- KISA / 정통망법 컴플라이언스 검토
- **사장님 결정 필요** — 의뢰 진행?

---

## 8. 위험 + 완화

| 위험 | 완화 |
|---|---|
| CODEF API 장애 → 사용자 결제 후 발급 실패 | 자동 환불 (5분 내 미발급 시) + 재시도 큐 |
| 권리분석 오판 → 사용자 분쟁 | 사장님 검토 단계 필수 + 면책 조항 (PR-O) |
| 결제 사기 (chargeback) | Toss 자체 부정거래 탐지 + 고액 결제 OTP |
| 등기부 PII 유출 | Supabase RLS + 결제자 본인만 + 만료 30일 |
| /report 공개 SEO 인덱싱 | robots.txt + noindex meta 강제 |

---

## 9. 사장님 결정 사항 (Top 3)

1. **CODEF + Toss 등록 진행 OK?** (1-2주 절차, 비용 0원 가입)
2. **가격 정책** — A(₩2K) / B(₩3K, 추천) / C(₩5K) / D(월구독)?
3. **PR-O 법무 자문 의뢰?** (₩30~50만, 권리분석 면책 조항 필수)

---

## 10. 일정 (예상)

| Phase | 기간 | 내용 |
|---|---|---|
| **승인 + 등록** | 2주 | CODEF + Toss + PR-O 의뢰 |
| **Phase 2.A** | 2주 | 무료 tier 강화 (PR-R-1~3) |
| **Phase 2.B** | 2주 | 결제 인프라 (PR-P-1~2) |
| **Phase 2.C** | 3주 | 권리분석 + 검토 (PR-R-4~5) |
| **Beta 테스트** | 1주 | 사장님 + 가족 + 지인 5명 |
| **Public Launch** | — | 마케팅 (PR-D 시리즈 SEO 활용) |

**합계: 10주 (2.5개월)**

---

작성: 2026-05-01 (사장님 비전 명시 반영)
