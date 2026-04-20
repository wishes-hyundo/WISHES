# 2026-04-21 /map 0건 장애 — 포스트모템 & 재발 방지

## 타임라인 (KST)
- 09:?? — Phase 1~4 마이그레이션 + 임베딩 백필 + pg_cron 3분 MV refresh 동시 진행
- 10:?? — `/map` · `/listings` · 대다수 `/api/*` 0건 노출 시작
- 10:?? — 사용자 제보 접수 → Chrome MCP 로 Vercel/Supabase 대시보드 병행 점검
- 10:?? — Supabase SQL Editor 직접 쿼리도 `Connection terminated due to connection timeout`
- 10:?? — Project Restart (Supabase General → Restart project)
- 10:?? — `/api/listings?limit=3` 0.19 s 에 200 OK, `total=3345` 회복

## 근본 원인
**Supavisor/pgBouncer 커넥션 풀 데드락**.
- Resource 메트릭은 정상 (Memory 408 MB/572 MB ≈ 71 %, CPU 1.79 %, IOPS 77)
- DB 자체는 살아 있었으나 커넥션 풀 계층에서 점유 해제 실패
- 유발 요인 조합
  1. `*/3 * * * *` pg_cron 이 `REFRESH MATERIALIZED VIEW CONCURRENTLY` 를 고빈도로 트리거
  2. 동시에 `/api/admin/backfill-embeddings` 이 pgvector HNSW 인덱스 동시 갱신
  3. Phase 1~4 마이그레이션 일부가 피크 시간에 진행
- Vercel `cached()` 래퍼의 6 s timeout + SWR 이 `stale:true` 응답을 반환하면서
  빈 캐시가 전 CDN 으로 전파

## 즉시 수정 (배포 완료)
- `supabase/migrations/20260421_hotfix_map_cron_interval.sql`
  - pg_cron refresh 3 min → **5 min**
  - 신선도 손실 최대 2 분, 풀 포화 위험 ≈ 40 % 감소

## 운영 규칙 (신규)
1. **off-peak 시간대 강제**
   - 마이그레이션 / 백필 / Reindex 는 **KST 02:00 ~ 06:00** 에만
   - Supabase SQL Editor 에 직접 실행하는 DDL 도 같은 창에서
2. **동시 실행 금지 쌍**
   - pg_cron refresh ↔ `backfill-embeddings`
   - HNSW 인덱스 재생성 ↔ `REFRESH MATERIALIZED VIEW CONCURRENTLY`
   - 필요 시 `cron.unschedule('refresh_mv_map_listings')` 로 일시 정지
3. **서버 방어선 유지**
   - `cached()` 래퍼는 부분 응답 감지 시 캐시 저장 금지 (이미 6114827 에 반영)
   - `/api/listings*` 는 `0 rows` + `stale:true` 조합을 서비스 에러로 승격 검토

## 모니터링 제안 (차순위)
- `/api/health/db` 엔드포인트 신설 — `SELECT 1 FROM mv_map_listings LIMIT 1` 응답 시간 측정
- Vercel Log Drain 또는 Supabase Log → 연결 풀 포화 경고 설정
- compute tier `t4g.nano → t4g.micro` 승격 검토
  - 현재 Memory 71 % 상시 → 메모리 여유 부족
  - 비용 월 6 달러 → 15 달러 수준

## 체크리스트 (다음 마이그레이션 시 필수)
- [ ] 현재 KST 시간이 02~06 창 안인가
- [ ] `cron.job` 에서 refresh 주기 확인했는가
- [ ] `backfill-embeddings` · `reindex` 가 동시에 돌지 않는가
- [ ] Supabase Memory · CPU 현재치 확인했는가 (70 % 미만)
- [ ] Vercel Deployment 가 방금 끝났는가 (부하 겹침 방지)
