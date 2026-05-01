-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PR-R-3 (RFC 0018 Phase 2.B+C) — 등기부 권리분석 + 결제 골격
-- 적용일: 2026-05-01
--
-- 사장님 명령 'data.go.kr 끝까지' 일관 — 자동화 인프라 토대.
-- 외부 등록 (CODEF + Toss) + 법무 자문 (PR-O) 후 활성화.
--
-- 골격만 (스키마 + RLS + 인덱스). 실제 결제/CODEF 호출은
-- env 키 등록 후 PR-R-3-A/B/C/D 분할 PR 에서 활성화.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 결제 + 보고서 트래킹
CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,                                    -- auth.users(id) — 비회원 NULL
  user_email TEXT,                                 -- 비회원 결제용
  listing_id BIGINT REFERENCES listings(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending',                                     -- 결제 대기
    'paid',                                        -- 결제 완료, 등기부 발급 대기
    'fetching',                                    -- CODEF 호출 중
    'analyzed',                                    -- 권리분석 완료, 사장님 검토 대기
    'reviewed',                                    -- 사장님 검토 OK, 발송 대기
    'delivered',                                   -- 사용자에게 발송 완료
    'refunded',                                    -- 환불 처리
    'failed'                                       -- 실패 (등기부 발급 / 분석 오류)
  )),
  payment_provider TEXT DEFAULT 'toss' CHECK (payment_provider IN ('toss', 'manual')),
  payment_id TEXT,                                 -- Toss tid
  payment_method TEXT,                             -- 카드 / 계좌이체 등
  amount_krw INTEGER NOT NULL CHECK (amount_krw >= 0),
  registry_pdf_path TEXT,                          -- Supabase Storage 경로
  analysis_pdf_path TEXT,
  risk_level TEXT CHECK (risk_level IS NULL OR risk_level IN (
    'safe',                                        -- 위험 0
    'caution',                                     -- 주의 (가등기 등)
    'warning',                                     -- 경고 (근저당 > 80%)
    'danger'                                       -- 위험 (가압류, 경매)
  )),
  risk_reasons JSONB,                              -- 위험 사유 배열
  delivered_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  failed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user
  ON reports(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_listing
  ON reports(listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_pending_review
  ON reports(created_at)
  WHERE status = 'analyzed';
CREATE INDEX IF NOT EXISTS idx_reports_payment
  ON reports(payment_id) WHERE payment_id IS NOT NULL;

-- 등기부 raw 데이터 (PII 격리)
CREATE TABLE IF NOT EXISTS registry_raw (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 표제부
  property_address TEXT,
  property_area_m2 NUMERIC,
  property_purpose TEXT,                           -- 주용도
  property_structure TEXT,                         -- 구조

  -- 갑구 (소유권, 시간순 JSONB array)
  ownership_history JSONB,
  current_owner TEXT,

  -- 을구 (저당권 / 가압류 / 임차권 등)
  liens JSONB,                                     -- 배열, 각 lien { type, amount, holder, date }

  -- 원본 PDF
  pdf_path TEXT,                                   -- Supabase Storage

  -- 만료 (개인정보보호법, 30일 후 자동 삭제 - cron 별도)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_registry_raw_report
  ON registry_raw(report_id);
CREATE INDEX IF NOT EXISTS idx_registry_raw_expires
  ON registry_raw(expires_at)
  WHERE expires_at < NOW() + INTERVAL '7 days';

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_raw ENABLE ROW LEVEL SECURITY;

-- 사용자: 본인 보고서만 SELECT
CREATE POLICY reports_user_select ON reports FOR SELECT
  USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.jwt() ->> 'email' = user_email)
  );

-- admin: 모든 보고서
CREATE POLICY reports_admin_all ON reports
  USING (auth.jwt() ->> 'email' = 'wishes@wishes.co.kr');

CREATE POLICY registry_raw_user_select ON registry_raw FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = registry_raw.report_id
        AND (auth.uid() = r.user_id OR auth.jwt() ->> 'email' = r.user_email)
    )
  );

CREATE POLICY registry_raw_admin_all ON registry_raw
  USING (auth.jwt() ->> 'email' = 'wishes@wishes.co.kr');

-- 자동 updated_at
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reports_updated_at ON reports;
CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_reports_updated_at();

COMMENT ON TABLE reports IS
  'PR-R-3 (RFC 0018): 권리분석 보고서 + 결제 트래킹. CODEF + Toss 후 활성화.';
COMMENT ON TABLE registry_raw IS
  'PR-R-3: 등기부 raw 데이터 (PII). 30일 만료 자동 삭제 (개인정보보호법).';
COMMENT ON COLUMN reports.amount_krw IS
  '단위 ₩. 가격 정책 RFC 0018 §4.3 사장님 결정 (추천 ₩3,000).';
