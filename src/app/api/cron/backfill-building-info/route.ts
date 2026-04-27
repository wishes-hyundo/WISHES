// Phase 0: Building Registry API Area Automation (Area Automation v1)
// Created: 2026-04-28 (based on AREA_AUTOMATION_RESEARCH)
//
// Goal: Automate area mapping for 3,862 missing listings (32%)
//   Phase 0 (1 week): Fill via building registry API (2,700 listings, 85% confidence)
//
// Flow:
//   1. Select: building_info IS NULL + area_m2 IS NULL + area_locked_at IS NULL
//   2. Resolve: Address -> Kakao API -> legal codes (sigunguCd, bjdongCd, bun, ji)
//   3. Fetch: data.go.kr building registry (3 endpoints parallel)
//   4. Extract: Area fields per property type:
//      - Apartments/Officetel: supply area > exclusive area > total area
//      - Detached houses: total area > building footprint
//      - Commercial: total area (highest confidence)
//   5. Update: area_m2, area_source='building_registry', area_confidence (85-90)
//      Keep area_locked_at null (indicates auto-processed)
//
// Zero-cost policy:
//   - Kakao API: free (100k/day quota)
//   - data.go.kr: free (10k/day quota)
//   - Vercel cron: free hobby plan
//
// Deployment:
//   vercel.json: { "path": "/api/cron/backfill-building-info?limit=50", "schedule": "0 */2 * * *" }
//   60 requests/day * 50 listings = 3,000 listings/day = ~1 week to complete

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { timingSafeEqualStr } from '@/lib/timingSafe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const SERVICE_KEY =
  process.env.DATA_GO_KR_API_KEY || process.env.BUILDING_LEDGER_API_KEY || '';
const API_BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

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
        merged[ep] = list[0];
      }
    } catch {
      /* skip this endpoint, continue others */
    }
  }

  return Object.keys(merged).length > 1 ? merged : null;
}

interface ExtractedFields {
  building_purpose?: string;
  building_name?: string;
  built_year?: string;
  area_m2?: number;
  area_supply_m2?: number;
  area_source?: 'building_registry';
  area_confidence?: number;
}

function extractFields(buildingInfo: AnyObj): ExtractedFields {
  const b = (buildingInfo['getBrBasisOulnInfo'] as AnyObj) || {};
  const t = (buildingInfo['getBrTitleInfo'] as AnyObj) || {};
  const r = (buildingInfo['getBrRecapTitleInfo'] as AnyObj) || {};

  const out: ExtractedFields = {};

  const purpose = String(t['mainPurpsCdNm'] || r['mainPurpsCdNm'] || b['mainPurpsCdNm'] || '').trim();
  if (purpose) out.building_purpose = purpose;

  const name = String(b['bldNm'] || t['bldNm'] || r['bldNm'] || '').trim();
  if (name) out.building_name = name;

  const aprDay = String(t['useAprDay'] || r['useAprDay'] || b['useAprDay'] || '').trim();
  if (aprDay && /^\d{8}/.test(aprDay)) out.built_year = aprDay.substring(0, 4);

  // Phase 0: Area field extraction per Korean building registry spec
  // Reference: Section A.1 of AREA_AUTOMATION_RESEARCH_2026-04-28.md
  const mainPurpose = out.building_purpose || purpose || '';
  const isApartment = /^(아파트|오피스텔|다세대|복합)/.test(mainPurpose);
  const isDetached = /^(단독주택|주택)/.test(mainPurpose);

  const parseArea = (v: unknown): number | null => {
    const n = parseFloat(String(v || '0'));
    return n > 0 ? n : null;
  };

  const supplyArea = parseArea(t['supplyArea'] || r['supplyArea']);
  const privArea = parseArea(t['privArea'] || r['privArea']);
  const totArea = parseArea(t['totArea'] || b['totArea']);
  const archArea = parseArea(t['archArea'] || b['archArea']);

  let selectedArea: number | null = null;
  let selectedConfidence = 85;

  if (isApartment) {
    // 사장님 명령 (2026-04-28): 전유부가 있는 경우 = 전용면적이 가장 중요
    //   Korean real estate: 전용(privArea) > 공급(supplyArea) > 연면적(totArea)
    //   KISO 14항 + 부동산 거래 신고법: 전용면적 표시 의무
    if (privArea) {
      selectedArea = privArea;
      selectedConfidence = 95;
    } else if (supplyArea) {
      selectedArea = supplyArea;
      selectedConfidence = 80;  // 공급면적은 공용 분담 포함 → 정확도 낮음
    } else if (totArea) {
      selectedArea = totArea;
      selectedConfidence = 65;  // 연면적은 건물 전체 → 단지 1동 한 호 매핑 어려움
    }
    // 추가: area_supply_m2 컬럼에도 supplyArea 동시 채움 (있으면)
    if (supplyArea && supplyArea !== selectedArea) {
      out.area_supply_m2 = supplyArea;
    }
  } else if (isDetached) {
    if (totArea) {
      selectedArea = totArea;
      selectedConfidence = 85;
    } else if (archArea) {
      selectedArea = archArea;
      selectedConfidence = 75;
    }
  } else {
    if (totArea) {
      selectedArea = totArea;
      selectedConfidence = 85;
    } else if (supplyArea) {
      selectedArea = supplyArea;
      selectedConfidence = 80;
    } else if (archArea) {
      selectedArea = archArea;
      selectedConfidence = 75;
    }
  }

  const maxArea = isApartment && !isDetached ? 500 : 3000;
  if (selectedArea && selectedArea >= 10 && selectedArea <= maxArea) {
    out.area_m2 = selectedArea;
    out.area_source = 'building_registry';
    out.area_confidence = selectedConfidence;
  }

  return out;
}

export async function GET(request: NextRequest) {
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
      { error: 'KAKAO_REST_API_KEY or DATA_GO_KR_API_KEY not configured' },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  const supabase = createServerClient();

  const { data: targets, error: selErr } = await supabase
    .from('listings')
    .select('id, address, building_name, area_m2, area_locked_at, field_sources')
    .is('building_info', null)
    .is('area_m2', null)
    .is('area_locked_at', null)
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
    skipped_broker_locked: 0,
    error: 0,
    dry_run: dryRun,
    samples: [] as unknown[],
  };

  type FieldSources = Record<string, string> | null | undefined;

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
          locked_fields: listing.field_sources,
        });
      } else {
        if (listing.area_locked_at) {
          results.skipped_broker_locked++;
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        const fs: Record<string, string> = (listing.field_sources as FieldSources) || {};
        const isBrokerLocked = (k: string) => fs[k] === 'broker';

        const updateData: Record<string, unknown> = {};
        const newSources: Record<string, string> = {};

        if (!isBrokerLocked('building_info')) {
          updateData.building_info = buildingInfo;
          newSources.building_info = 'auto';
        }
        if (fields.building_purpose && !listing.building_name && !isBrokerLocked('building_purpose')) {
          updateData.building_purpose = fields.building_purpose;
          newSources.building_purpose = 'auto';
        }
        if (fields.building_name && !listing.building_name && !isBrokerLocked('building_name')) {
          updateData.building_name = fields.building_name;
          newSources.building_name = 'auto';
        }
        if (fields.built_year && !isBrokerLocked('built_year')) {
          updateData.built_year = fields.built_year;
          newSources.built_year = 'auto';
        }

        if (fields.area_m2 && !isBrokerLocked('area_m2')) {
          updateData.area_m2 = fields.area_m2;
          newSources.area_m2 = 'building_registry';
          updateData.area_source = fields.area_source;
          updateData.area_confidence = fields.area_confidence;
        }

        if (Object.keys(updateData).length === 0) {
          results.skipped_broker_locked++;
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        updateData.field_sources = { ...fs, ...newSources };

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

      await new Promise((r) => setTimeout(r, 200));
    } catch {
      results.error++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
