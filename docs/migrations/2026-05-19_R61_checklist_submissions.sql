-- R61 (2026-05-19) — checklist 제출 raw payload 영구 저장
-- 사장님 명령: 조가영 손님 데이터 손실 사고 재발 차단
-- 모든 /api/naver-works-post 호출의 input 을 Supabase 에 영구 보존
-- 7일 후 자동 삭제 (privacy)

CREATE TABLE IF NOT EXISTS public.checklist_submissions (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  raw_payload     JSONB NOT NULL,
  c_name          TEXT,
  c_phone         TEXT,
  deal            TEXT,
  prop            TEXT,
  sections_count  INTEGER DEFAULT 0,
  client_ip       TEXT,
  user_agent      TEXT,
  forwarded_status TEXT DEFAULT 'pending',  -- pending / success / failed
  forwarded_at    TIMESTAMPTZ,
  forwarded_http_code INTEGER,
  post_id         TEXT
);

CREATE INDEX IF NOT EXISTS idx_chk_subs_created ON public.checklist_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chk_subs_phone   ON public.checklist_submissions(c_phone);
CREATE INDEX IF NOT EXISTS idx_chk_subs_status  ON public.checklist_submissions(forwarded_status);

-- RLS — 사장님 admin token + service_role 만 select
ALTER TABLE public.checklist_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.checklist_submissions
  FOR ALL USING (auth.role() = 'service_role');

-- 7일 자동 삭제 cron (Supabase pg_cron 확장 사용 시)
-- ⚠ 사장님이 Supabase SQL Editor 에서 직접 실행해주세요:
-- SELECT cron.schedule('chk_subs_cleanup', '0 3 * * *', $$
--   DELETE FROM public.checklist_submissions WHERE created_at < NOW() - INTERVAL '7 days'
-- $$);

COMMENT ON TABLE public.checklist_submissions IS 'R61 (2026-05-19) — /api/naver-works-post raw payload 영구 저장 (silent fail 시 복구용). 7일 retention.';
