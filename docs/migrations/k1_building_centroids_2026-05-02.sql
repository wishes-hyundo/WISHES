-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- K-1: building_centroids 테이블 (사장님 명령 2026-05-02)
--
-- 목적: TIER1 매물 (아파트/오피스텔/주상복합/도시형생활주택) 단지명별 정확 좌표.
--      네이버 표준 단지 마커 시각 — 좌표 평균 X, 단지 진짜 좌표 사용.
--
-- 채움: /api/cron/resolve-building-centroids 가 카카오 Local Keyword API 호출 →
--      단지명 + 동 으로 검색 → 결과 좌표 저장. 매주 자동 갱신.
--
-- Privacy: 단지 좌표 = 공공 정보 (네이버지도/카카오지도에 누구나 검색 가능).
--          단지명 자체는 cluster_token (hash) 로 비로그인에 마스킹 유지.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.building_centroids (
  building_name  TEXT NOT NULL,
  dong           TEXT,                          -- 행정동 (동명이인 단지 분리)
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  source         TEXT NOT NULL DEFAULT 'kakao_local',  -- kakao_local / manual / averaged
  kakao_query    TEXT,                          -- 검색에 사용한 query
  match_score    INTEGER,                       -- 카카오 결과 신뢰도 (1-100)
  resolved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (building_name, dong)
);

-- 단지명 단독 조회 (dong NULL fallback)
CREATE INDEX IF NOT EXISTS idx_building_centroids_name
  ON public.building_centroids (building_name);

-- 마지막 갱신 시각 — 오래된 단지 우선 재조회용
CREATE INDEX IF NOT EXISTS idx_building_centroids_resolved_at
  ON public.building_centroids (resolved_at);

-- RLS: 공개 read (지도 표시용), 쓰기는 service_role 만
ALTER TABLE public.building_centroids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read building_centroids" ON public.building_centroids;
CREATE POLICY "public read building_centroids"
  ON public.building_centroids FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "service write building_centroids" ON public.building_centroids;
CREATE POLICY "service write building_centroids"
  ON public.building_centroids FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.building_centroids IS
  'K-1 (사장님 명령 2026-05-02): TIER1 매물 단지명 → 정확 좌표. 카카오 Local API 자동 채움. 네이버 표준 단지 마커 시각.';
