-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 마이그레이션: 중복정리 Soft-Delete 컬럼 추가
-- 날짜: 2026-04-20
-- 목적: 관리자가 "100% 중복" 매물을 리뷰 후 안전하게 숨김 처리
--       → 30일 후 cron이 하드 삭제, 그 사이는 복구 가능
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 숨김 처리 타임스탬프 (30일 하드삭제 카운트다운 기점)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dedup_requested_at TIMESTAMPTZ;

-- 숨김 사유 (관리자용 설명 — "동일 소재지/동호수/거래/가격 + 면적일치")
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dedup_reason TEXT;

-- 같이 묶인 그룹 식별자 (복구 시 같은 그룹 복구용)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dedup_group_id TEXT;

-- 그룹 대표(남긴 매물) ID (자기자신이면 NULL, 숨김 처리된 매물은 대표의 id)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dedup_kept_id BIGINT;

-- 인덱스: 복구 큐 + cron 쿼리용
CREATE INDEX IF NOT EXISTS idx_listings_dedup_requested_at
  ON listings(dedup_requested_at)
  WHERE dedup_requested_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_dedup_group
  ON listings(dedup_group_id)
  WHERE dedup_group_id IS NOT NULL;

-- 참고: status 컬럼은 기존 CHECK 제약이 없으므로 '중복정리' 값 바로 사용 가능.
-- 기존 RLS: listings_public_select (status = '가용') → '중복정리' 자동 차단.
