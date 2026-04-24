-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- L-agent-profile (2026-04-24)
--
-- profiles 테이블에 중개사(agent/broker) 전용 필드 추가:
--   office_name      — 소속 공인중개사사무소명
--   office_phone     — 사무실 대표전화
--   office_address   — 사무소 주소 (길찾기용)
--   registration_no  — 공인중개사 등록번호 (지자체 발급)
--   career_years     — 중개업 경력 연차
--
-- AgentContactModal 에서 담당자 모달의 사무소/등록번호/경력 라인을 실제 데이터로 채움.
-- 이번까지는 하드코드 폴백 (위시스부동산 02-6953-7001) 이었음.
--
-- 모든 컬럼 NULLABLE. 기존 프로필 영향 X.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS office_name TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS office_phone TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS office_address TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS registration_no TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS career_years INTEGER
    CHECK (career_years IS NULL OR (career_years >= 0 AND career_years <= 60));

COMMIT;
