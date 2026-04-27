// ──────────────────────────────────────────────────────────────────────
// BoB Phase 0-C 3단계: 건축물대장 자동 보강 cron
// 작성: 2026-04-27 (인계 v2 → v3 세션, 사용자 명시 — 차근차근 자동 진행)
//
// 동작:
//   1. building_info IS NULL 매물 N건 (default 25, ?limit= 으로 조정)
//   2. 각 매물 주소 → 카카오로 시군구/법정동 코드 변환
//   3. data.go.kr 건축물대장 API 호출 (8s timeout per request)
//   4. listings.building_info(jsonb) / building_purpose / building_name UPDATE
//      ※ NULL 인 칸만 채움 (cascade 도입 전이라 안전 보수적)
//
// 비용 0 정책:
//   - 카카오 무료 (일 100,000건)
//   - data.go.kr 무료 (일 10,000건)
//   - Vercel cron Hobby 무료
//
// Cron 등록 (vercel.json):
//   { "path": "/api/cron/backfill-building-info", "schedule": "*/30 * * * *" }
//   매 30분마다 25건 → 일 1,200건 → 약 10일에 11,500건 backfill 완료
//
// 인증:
//   - Vercel cron: Authorization: Bearer ${CRON_SECRET}
//   - 수동 호출: GET /api/cron/backfill-building-info?secret=...&limit=5
// ──────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { timingSafeEqualStr } from '@/lib/timingSafe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const SERVICE_KEY =
  process.env.DATA_GO_KR_API_KEY || process.env.BUILDING_LEDGER_API_KEY || '';
const API_BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

// ── 1. 카카오 주소 → 시군구/법정동 코드 ──────────────────────
type Resolved = {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
  fullAddress: string;
};

async function resolveViaKakao(address: string): Promise<Resolved | null> {
  if (!KAKAO_REST_API_KEY || !address) return null;
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}&analyze_type=exact`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    let doc = json.documents?.[0];
    if (!doc) {
      // similar 모드 재시도
      const url2 = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}&analyze_type=similar`;
      const res2 = await fetch(url2, {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res2.ok) return null;
      const json2 = await res2.json();
      doc = json2.documents?.[0];
      if (!doc) return null;
    }
    const addr = doc.address;
    if (!addr?.b_code) return null;
    const bCode: string = addr.b_code;
    return {
      sigunguCd: bCode.substring(0, 5),
      bjdongCd: bCode.substring(5, 10),
      bun: (addr.main_address_no || '0').padStart(4, '0'),
      ji: (addr.sub_address_no || '0').padStart(4, '0'),
      fullAddress: addr.address_name || '',
    };
  } catch {
    return null;
  }
}

// ── 2. data.go.kr 건축물대장 호출 ─────────────────────────────
type AnyObj = Record<string, unknown>;

async function fetchBuildingInfo(r: Resolved): Promise<AnyObj | null> {
  if (!SERVICE_KEY) return null;
  let decodedKey = SERVICE_KEY;
  try {
    if (SERVICE_KEY.includes('%')) decodedKey = decodeURIComponent(SERVICE_KEY);
  } catch {
    /* keep */
  }

  const params = new URLSearchParams({
    ServiceKey: decodedKey,
    sigunguCd: r.sigunguCd,
    bjdongCd: r.bjdongCd,
    bun: r.bun !== '0000' ? r.bun : '',
    ji: r.ji !== '0000' ? r.ji : '',
    platGbCd: '0',
    numOfRows: '50',
    pageNo: '1',
    _type: 'json',
  });

  // 핵심 endpoint 3개 (총괄·표제·층별)
  const endpoints = ['getBrBasisOulnInfo', 'getBrRecapTitleInfo', 'getBrTitleInfo'];
  const merged: AnyObj = { resolved: r };

  for (const ep of endpoints) {
    try {
      const url = `${API_BASE}/${ep}?${params.toString()}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const json = (await res.json()) as AnyObj;
      const body = ((json as AnyObj)['response'] as AnyObj)?.['body'] as AnyObj;
      const items = (body?.['items'] as AnyObj)?.['item'];
      const list = Array.isArray(items) ? items : items ? [items] : [];
      if (list.length > 0) {
        merged[ep] = list[0]; // 첫 결과만 (대표 정보)
      }
    } catch {
      /* skip this endpoint, continue others */
    }
  }

  return Object.keys(merged).length > 1 ? merged : null;
}

// ── 3. 핵심 필드 추출 (jsonb → listings 칸) ───────────────────
function extractFields(buildingInfo: AnyObj): {
  building_purpose?: string;
  building_name?: string;
  built_year?: string;
} {
  const b = (buildingInfo['getBrBasisOulnInfo'] as AnyObj) || {};
  const t = (buildingInfo['getBrTitleInfo'] as AnyObj) || {};
  const r = (buildingInfo['getBrRecapTitleInfo'] as AnyObj) || {};

  const out: { building_purpose?: string; building_name?: string; built_year?: string } = {};

  const purpose = String(t['mainPurpsCdNm'] || r['mainPurpsCdNm'] || b['mainPurpsCdNm'] || '').trim();
  if (purpose) out.building_purpose = purpose;

  const name = String(b['bldNm'] || t['bldNm'] || r['bldNm'] || '').trim();
  if (name) out.building_name = name;

  // 사용승인일 yyyymmdd → yyyy
  const aprDay = String(t['useAprDay'] || r['useAprDay'] || b['useAprDay'] || '').trim();
  if (aprDay && /^\d{8}/.test(aprDay)) out.built_year = aprDay.substring(0, 4);

  return out;
}

// ── 4. GET 핸들러 ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // 인증: Vercel cron Bearer 또는 ?secret=
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
  const querySecret = new URL(request.url).searchParams.get('secret') || '';
  const ok =
    timingSafeEqualStr(bearerToken, cronSecret) ||
    timingSafeEqualStr(querySecret, cronSecret);
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!KAKAO_REST_API_KEY || !SERVICE_KEY) {
    return NextResponse.json(
      { error: 'KAKAO_REST_API_KEY 또는 DATA_GO_KR_API_KEY 미설정' },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  const supabase = createServerClient();

  // building_info NULL 인 매물 N건 — 가장 최근 등록순 (사용자 노출 우선순위)
  const { data: targets, error: selErr } = await supabase
    .from('listings')
    .select('id, address, building_name')
    .is('building_info', null)
    .not('address', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (selErr) {
    return NextResponse.json({ error: 'select failed', detail: selErr.message }, { status: 500 });
  }

  const results = {
    total_targets: targets?.length || 0,
    success: 0,
    no_kakao: 0,
    no_building: 0,
    error: 0,
    dry_run: dryRun,
    samples: [] as unknown[],
  };

  for (const listing of targets || []) {
    try {
      const resolved = await resolveViaKakao(listing.address);
      if (!resolved) {
        results.no_kakao++;
        continue;
      }
      const buildingInfo = await fetchBuildingInfo(resolved);
      if (!buildingInfo) {
        results.no_building++;
        continue;
      }

      const fields = extractFields(buildingInfo);

      if (dryRun) {
        results.samples.push({
          id: listing.id,
          address: listing.address,
          extracted: fields,
        });
      } else {
        // NULL 인 칸만 채움 (cascade 보수적)
        const updateData: Record<string, unknown> = { building_info: buildingInfo };
        if (fields.building_purpose && !listing.building_name) {
          updateData.building_purpose = fields.building_purpose;
        }
        if (fields.building_name && !listing.building_name) {
          updateData.building_name = fields.building_name;
        }
        if (fields.built_year) {
          updateData.built_year = fields.built_year;
        }
        const { error: upErr } = await supabase
          .from('listings')
          .update(updateData)
          .eq('id', listing.id);
        if (upErr) {
          results.error++;
        } else {
          results.success++;
        }
      }

      // rate limit: 카카오/data.go.kr 둘 다 — 200ms 간격
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      results.error++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
