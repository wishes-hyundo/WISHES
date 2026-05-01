-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Push Subscriptions (A3 Web Push)
-- 2026-05-02 — VAPID 기반 푸시 알림 구독 저장
--
-- 사용 흐름:
--   1. 클라이언트가 navigator.pushManager.subscribe() 로 endpoint+keys 받음
--   2. /api/push/subscribe 가 이 테이블에 upsert
--   3. notify-matches cron 이 saved_search_id 매칭 시
--      이메일 + push (이 테이블 조회) 동시 발송
--   4. 410/404 응답 시 active=false (구독 만료)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  -- 식별자: user_id (로그인) 또는 email (게스트 saved_search 구독)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  saved_search_id BIGINT REFERENCES saved_searches(id) ON DELETE CASCADE,
  -- 메타
  user_agent TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  last_failed_at TIMESTAMPTZ,
  fail_count INTEGER NOT NULL DEFAULT 0
);

-- 검색 인덱스
CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON push_subscriptions(user_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_push_subs_email
  ON push_subscriptions(email) WHERE active;
CREATE INDEX IF NOT EXISTS idx_push_subs_saved_search
  ON push_subscriptions(saved_search_id) WHERE active;

-- RLS: 본인 구독만 조회/관리 (서비스 롤은 bypass)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subs_user_select ON push_subscriptions;
CREATE POLICY push_subs_user_select ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subs_user_modify ON push_subscriptions;
CREATE POLICY push_subs_user_modify ON push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subs_user_delete ON push_subscriptions;
CREATE POLICY push_subs_user_delete ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- INSERT 는 서비스 롤만 (API 라우트 createServerClient 가 service-role 사용)

COMMENT ON TABLE push_subscriptions IS
  'Web Push 구독 정보 (A3, 2026-05-02). endpoint UNIQUE, 410/404 시 active=false.';
