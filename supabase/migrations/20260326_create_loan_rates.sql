-- loan_rates 테이블 생성: 대출 금리 자동 업데이트용
CREATE TABLE IF NOT EXISTS loan_rates (
  id BIGSERIAL PRIMARY KEY,
  mortgage_rates JSONB NOT NULL DEFAULT '[]'::jsonb,
  jeonse_rates JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system'
);

-- RLS 정책: 모든 사용자 읽기 허용
ALTER TABLE loan_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_rates_read_all" ON loan_rates
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "loan_rates_insert_authenticated" ON loan_rates
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 초기 데이터 삽입 (2026년 3월 기준)
INSERT INTO loan_rates (mortgage_rates, jeonse_rates, updated_by) VALUES (
  '[
    {"label": "시중은행 주담대", "rate": 4.5},
    {"label": "특례보금자리론", "rate": 4.2},
    {"label": "디딜돌대출", "rate": 2.45},
    {"label": "신혼부부 특례", "rate": 2.2}
  ]'::jsonb,
  '[
    {"label": "버팀목 전세대출", "rate": 2.3},
    {"label": "카카오뱅크 전세", "rate": 3.9},
    {"label": "시중은행 전세", "rate": 4.5},
    {"label": "청년전용 버팀목", "rate": 1.8}
  ]'::jsonb,
  'initial_setup'
);
