-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T6-1: 매물 동영상 (listing_videos) 테이블 생성
-- listing_images 구조 대칭 + 포맷/용량/재생시간 메타
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 사용:
--   - /admin/listings/new, /admin/listings/[id]/edit → 동영상 업로드
--   - /mobile-photo.html → 모바일 촬영 동영상 업로드
--   - R2 경로: listings/video-{timestamp}-{random}.{ext}
--   - 표출: 상세 모달 갤러리 첫 슬라이드 + 카드 썸네일 ▶ 배지
-- 포맷:
--   MP4 (H.264/HEVC), WebM, MOV (QuickTime) — 핸드폰 촬영 주력
-- 용량 가드:
--   단일 파일 최대 50MB (서버·클라이언트 양쪽 체크)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS listing_videos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  poster_url TEXT,              -- 포스터/썸네일 이미지 URL (선택)
  mime_type TEXT,               -- video/mp4, video/webm, video/quicktime
  file_size BIGINT,             -- 바이트
  duration_sec INTEGER,         -- 재생시간 (초, 선택)
  width INTEGER,
  height INTEGER,
  sort_order INTEGER DEFAULT 0,
  alt TEXT,                     -- 파일명 백업 or 설명
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_videos_listing_id
  ON listing_videos(listing_id);

COMMENT ON TABLE listing_videos IS
  '매물 동영상 갤러리. listing_images 와 독립적으로 0..N 개 저장 가능.';

-- RLS: 가용 매물 공개 SELECT, service_role 전체 권한
ALTER TABLE listing_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listing_videos_public_select ON listing_videos;
CREATE POLICY listing_videos_public_select ON listing_videos
  FOR SELECT
  USING (
    listing_id IN (
      SELECT id FROM listings WHERE status = '가용'
    )
  );

DROP POLICY IF EXISTS listing_videos_service_role_all ON listing_videos;
CREATE POLICY listing_videos_service_role_all ON listing_videos
  FOR ALL
  USING (auth.role() = 'service_role');
