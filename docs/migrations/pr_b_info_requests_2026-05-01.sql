-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PR-B (RFC 0016) — 정보 문의 시스템
-- 적용일: 2026-05-01
-- 목적: 면적/가격 NULL 매물에 대한 사용자 문의 → Resend 이메일 + DB log
-- 사장님 명령: "면적 정보 부족 = 비공개 X" + "사용자 UI 부정적 표시 X"
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS info_requests (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('area', 'price', 'address', 'other')),
  user_contact TEXT NOT NULL CHECK (length(user_contact) BETWEEN 8 AND 64),
  user_message TEXT CHECK (user_message IS NULL OR length(user_message) <= 500),
  user_ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  notified_in_digest_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_info_requests_listing
  ON info_requests(listing_id);

CREATE INDEX IF NOT EXISTS idx_info_requests_pending
  ON info_requests(created_at DESC)
  WHERE responded_at IS NULL;

-- 다이제스트 cron 용 (사장님 매일 1통, RFC 0016 추천)
CREATE INDEX IF NOT EXISTS idx_info_requests_undigested
  ON info_requests(created_at)
  WHERE notified_in_digest_at IS NULL;

-- RLS
ALTER TABLE info_requests ENABLE ROW LEVEL SECURITY;

-- INSERT: anonymous 허용 (사용자 문의)
CREATE POLICY info_requests_insert_anon
  ON info_requests FOR INSERT
  WITH CHECK (true);

-- SELECT: admin 전용 (사장님)
CREATE POLICY info_requests_select_admin
  ON info_requests FOR SELECT
  USING (auth.jwt() ->> 'email' = 'wishes@wishes.co.kr');

-- UPDATE: admin 전용 (responded_at / notified_in_digest_at)
CREATE POLICY info_requests_update_admin
  ON info_requests FOR UPDATE
  USING (auth.jwt() ->> 'email' = 'wishes@wishes.co.kr');

COMMENT ON TABLE info_requests IS 'PR-B (RFC 0016): 사용자 정보 문의 — 면적/가격 NULL 매물';
COMMENT ON COLUMN info_requests.notified_in_digest_at IS 'cron 다이제스트 발송 시각 (NULL = 미발송)';
