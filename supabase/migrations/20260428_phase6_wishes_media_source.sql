-- ════════════════════════════════════════════════════════════════
-- Phase 6 Wishes Media Source — 저작권 안전 + 위시스 사진/영상 마킹
-- 사장님 명령 2026-04-28: 크롤링 사진 vs 위시스 직접 촬영/편집 사진 분리
-- 적용일: 2026-04-28 (Supabase apply_migration 으로 라이브 적용 완료)
-- ════════════════════════════════════════════════════════════════

-- 1) source 컬럼 (text + check)
ALTER TABLE listing_images
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crawled'
    CHECK (source IN ('crawled', 'wishes_original', 'wishes_edited')),
  ADD COLUMN IF NOT EXISTS source_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS film_look_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS watermark_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS face_mosaic_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exif_stripped BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE listing_videos
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crawled'
    CHECK (source IN ('crawled', 'wishes_original', 'wishes_edited')),
  ADD COLUMN IF NOT EXISTS source_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS film_look_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS watermark_applied BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS has_wishes_media BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wishes_photo_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wishes_video_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wishes_media_at TIMESTAMPTZ;

-- 2) 인덱스
CREATE INDEX IF NOT EXISTS idx_listings_has_wishes_media
  ON listings (has_wishes_media) WHERE has_wishes_media = TRUE;
CREATE INDEX IF NOT EXISTS idx_listing_images_source
  ON listing_images (listing_id, source) WHERE source != 'crawled';
CREATE INDEX IF NOT EXISTS idx_listing_videos_source
  ON listing_videos (listing_id, source) WHERE source != 'crawled';

-- 3) 트리거 함수 + 트리거 (apply_migration 실제 함수는 라이브 DB에 적용됨)
-- (이 파일은 기록용 — 실제 DDL은 supabase apply_migration 으로 적용)

COMMENT ON COLUMN listing_images.source IS
  '사진 출처. crawled=외부(저작권 위험), wishes_original=위시스 촬영, wishes_edited=위시스 편집(필름룩). 고객 노출은 wishes_*만.';
COMMENT ON COLUMN listings.has_wishes_media IS
  '위시스 직접 촬영/편집 사진/영상 있는 매물 = 우리만의 매물 (트리거 자동 갱신).';
