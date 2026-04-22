/**
 * POST /api/admin/apply-map-migration
 *
 * /map 10만 건 대응 성능 파운데이션 마이그레이션 적용.
 *   - PostGIS GIST/BRIN/pg_trgm 인덱스
 *   - Materialized View mv_map_listings (+ pg_cron 3분 리프레시)
 *   - pgvector 확장 + embedding vector(384) + HNSW 인덱스
 *   - rpc_map_clusters RPC (줌 레벨별 그리드 클러스터링)
 *   - match_listings RPC (pgvector 자연어 검색)
 *   - listings_map_diff mirror + trigger (Realtime Broadcast 패턴)
 *
 * Authorization: Bearer <WISHES_ADMIN_MASTER_PASSWORD env> (또는 Supabase JWT)
 *
 * 배포 후 한 번만 호출하면 된다. IF NOT EXISTS 로 멱등성 확보.
 *
 * ※ 마이그레이션 파일은 동일 내용을
 *   supabase/migrations/20260420_map_performance_foundation.sql 에 박제.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';
import { readFile } from 'fs/promises';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 마이그레이션 파일을 런타임에 읽어 실행 (번들에 포함시키지 않음)
async function loadMigrationSql(): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260420_map_performance_foundation.sql',
  );
  return readFile(filePath, 'utf-8');
}

/**
 * Supabase Management API 로 raw SQL 실행.
 * 전체 트랜잭션 1회 실행이 실패하면 statement 단위로 분할 재시도.
 */
async function runQuery(query: string): Promise<{ ok: boolean; status: number; body: string }> {
  const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
  const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const resp = await fetch(mgmtUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query }),
  });
  const body = await resp.text().catch(() => '');
  return { ok: resp.ok, status: resp.status, body };
}

/**
 * dollar-quoted ($$ ... $$) 블록을 보존하면서 세미콜론 단위 분할.
 *   - 함수 본문·cron.schedule 인자·기타 multiline string 대응
 */
function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inDollar = false;
  let dollarTag = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // dollar 태그 진입/이탈
    if (ch === '$') {
      // $tag$ 형태 스캔
      const rest = sql.slice(i);
      const m = rest.match(/^(\$[a-zA-Z_0-9]*\$)/);
      if (m) {
        const tag = m[1];
        if (!inDollar) {
          inDollar = true;
          dollarTag = tag;
        } else if (tag === dollarTag) {
          inDollar = false;
          dollarTag = '';
        }
        buf += tag;
        i += tag.length;
        continue;
      }
    }

    if (!inDollar && ch === ';') {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed + ';');
      buf = '';
      i++;
      continue;
    }

    // 라인 코멘트 스킵 ( -- ... \n )
    if (!inDollar && ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      if (nl === -1) break;
      buf += sql.slice(i, nl + 1);
      i = nl + 1;
      continue;
    }

    buf += ch;
    i++;
  }

  const tail = buf.trim();
  if (tail) out.push(tail + (tail.endsWith(';') ? '' : ';'));
  return out;
}

export async function POST(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Supabase env vars missing' }, { status: 500 });
  }

  try {
    const fullSql = await loadMigrationSql();

    // 1차 시도: 전체 한 방에
    const bulk = await runQuery(fullSql);
    if (bulk.ok) {
      return NextResponse.json({
        success: true,
        method: 'management_api_bulk',
        sql_bytes: fullSql.length,
        applied: [
          'extensions: postgis, pg_trgm, pg_cron, vector',
          'indexes: GIST geom, BRIN created/updated, GIN trigram (title/address/building), bounds_filter, dong_status',
          'materialized_view: mv_map_listings (pre-joined thumb_url + has_video + price_unified)',
          'cron: refresh_mv_map_listings */3 min CONCURRENTLY',
          'listings.embedding vector(384) + HNSW (m=16, ef=64)',
          'rpc_map_clusters (zoom-aware grid, LIMIT 1500)',
          'match_listings (pgvector HNSW, threshold 0.70)',
          'listings_map_diff mirror table + trigger (Broadcast pattern)',
          'cron: cleanup_map_diff daily 04:00',
          'GRANTs + RLS',
          'REFRESH MV + ANALYZE',
        ],
      });
    }

    // 2차 시도: 개별 statement 로 분할 (cron.schedule 등 일부 ok 실패 허용)
    const statements = splitSqlStatements(fullSql);
    const results: { i: number; preview: string; ok: boolean; status: number; error?: string }[] = [];
    let okCount = 0;
    let failCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const r = await runQuery(stmt);
      const preview = stmt.slice(0, 120).replace(/\s+/g, ' ');
      if (r.ok) {
        okCount++;
        results.push({ i, preview, ok: true, status: r.status });
      } else {
        // IF NOT EXISTS / DROP IF EXISTS 보호 문은 이미 존재 → 통과
        const b = r.body.toLowerCase();
        const tolerable =
          b.includes('already exists') ||
          b.includes('does not exist') ||
          b.includes('duplicate') ||
          stmt.trim().toLowerCase().startsWith('select cron.unschedule');
        if (tolerable) {
          okCount++;
          results.push({ i, preview, ok: true, status: r.status, error: 'tolerable: ' + r.body.slice(0, 200) });
        } else {
          failCount++;
          results.push({ i, preview, ok: false, status: r.status, error: r.body.slice(0, 500) });
        }
      }
    }

    return NextResponse.json(
      {
        success: failCount === 0,
        method: 'management_api_statement_split',
        total: statements.length,
        ok: okCount,
        fail: failCount,
        bulk_first_error: bulk.body.slice(0, 500),
        results: results.filter((r) => !r.ok || r.error),
      },
      { status: failCount === 0 ? 200 : 500 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    message: 'POST here to apply /map performance foundation migration (idempotent).',
    file: 'supabase/migrations/20260420_map_performance_foundation.sql',
    phases: [
      'Phase 1-A: PostGIS GIST + BRIN + pg_trgm GIN indexes',
      'Phase 1-B: Materialized View mv_map_listings + pg_cron 3min refresh',
      'Phase 1-C: pgvector extension + embedding vector(384) + HNSW',
      'Phase 1-D: rpc_map_clusters RPC',
      'Phase 1-E: match_listings RPC',
      'Phase 4-E precursor: listings_map_diff mirror + trigger',
    ],
  });
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // pgvector HNSW 빌드 여유시간
