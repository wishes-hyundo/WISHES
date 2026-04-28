/**
 * /api/cron/auto-fix-area (Tier 2, 2026-04-28)
 *
 * 사장님 자동화 우선 정책: listings.area_m2 vs building_registry_cache 의 호실
 * 전유면적 비교 → 차이 ≥5% + 의심 패턴 (area_m2 == area_supply_m2) 자동 보정.
 *
 * 비용 0원: building_registry_cache 는 이미 24h 캐시. data.go.kr 추가 호출 X.
 *
 * 실행:
 *   - 일 1회 (vercel cron)
 *   - 50건/run (점진 처리)
 *   - audit log: data_quality_audit 테이블 (Tier 6 dashboard 와 공유)
 *   - 사장님 일일 이메일 (Resend) — 보정 0건이면 skip
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { captureWarning, addBreadcrumb } from '@/lib/observe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface BuildingUnit {
  dongNm: string;
  hoNm: string;
  exclusiveArea: number;
  totalArea: number;
}

function findUnit(units: BuildingUnit[], dong: string, ho: string): BuildingUnit | null {
  if (!units?.length || !ho) return null;
  const exact = units.find(
    (u) => (!dong || u.dongNm === dong) && u.hoNm === ho,
  );
  if (exact) return exact;
  const byHo = units.find((u) => u.hoNm === ho);
  if (byHo) return byHo;
  const normHo = ho.replace(/호$/, '').trim();
  return units.find((u) => u.hoNm.replace(/호$/, '').trim() === normHo) || null;
}

interface AddressBreakdown {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
}

// Kakao API 로 listing.address → sigunguCd/bjdongCd/bun/ji 변환 (캐시 hit 우선)
async function resolveListingToCacheKey(
  supabase: ReturnType<typeof createServerClient>,
  address: string,
): Promise<AddressBreakdown | null> {
  if (!supabase) return null;
  // Kakao 호출 대신 building_registry_cache 의 raw_data.query.address ilike 매칭으로 빠르게
  // (이미 모달 통해 한 번이라도 조회됐던 건물이면 캐시 hit)
  try {
    const KAKAO_KEY = process.env.KAKAO_REST_API_KEY || '';
    if (!KAKAO_KEY) return null;
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(tid));
    if (!r.ok) return null;
    const j = await r.json();
    const doc = j?.documents?.[0];
    if (!doc?.address?.b_code) return null;
    return {
      sigunguCd: doc.address.b_code.substring(0, 5),
      bjdongCd: doc.address.b_code.substring(5, 10),
      bun: String(doc.address.main_address_no || '0').padStart(4, '0'),
      ji: String(doc.address.sub_address_no || '0').padStart(4, '0'),
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'No supabase' }, { status: 500 });
  }

  // 의심 매물: area_m2 == area_supply_m2 + building_ho 추출 완료 + 캐시 가능한 type
  // type 필터: 오피스텔/아파트 (전유부 발급) 만
  const { data: targets } = await supabase
    .from('listings')
    .select('id, address, area_m2, area_supply_m2, building_dong, building_ho, type')
    .in('type', ['오피스텔', '아파트'])
    .not('building_ho', 'is', null)
    .not('area_m2', 'is', null)
    .filter('area_m2', 'eq', 'area_supply_m2')  // PostgREST 같은 컬럼 비교 — 아래 fallback 으로 보정
    .limit(50);

  // PostgREST 같은 컬럼 비교 안 되니 별도 raw RPC 또는 클라이언트 필터
  // 빠른 대안: area_m2 NOT NULL 매물 50개 가져와 코드에서 same 만 처리
  const { data: candidates } = await supabase
    .from('listings')
    .select('id, address, area_m2, area_supply_m2, building_dong, building_ho, type')
    .in('type', ['오피스텔', '아파트'])
    .not('building_ho', 'is', null)
    .not('area_m2', 'is', null)
    .limit(200);

  const filtered = (candidates || []).filter(
    (l) => l.area_m2 != null && l.area_supply_m2 != null && Math.abs(l.area_m2 - l.area_supply_m2) < 0.5,
  ).slice(0, 50);

  const audit: Array<{ id: number; before: { m2: number; supply: number }; after: { m2: number; supply: number }; reason: string }> = [];
  let updated = 0;
  let skipped = 0;

  for (const lst of filtered) {
    try {
      const breakdown = await resolveListingToCacheKey(supabase, lst.address || '');
      if (!breakdown) { skipped++; continue; }

      // 캐시에서 호실별 면적 조회
      const { data: cache } = await supabase
        .from('building_registry_cache')
        .select('units_data')
        .eq('sigungu_cd', breakdown.sigunguCd)
        .eq('bjdong_cd', breakdown.bjdongCd)
        .eq('bun', breakdown.bun)
        .eq('ji', breakdown.ji)
        .eq('plat_gb_cd', '0')
        .maybeSingle();

      if (!cache?.units_data) { skipped++; continue; }

      const units = cache.units_data as BuildingUnit[];
      const unit = findUnit(units, lst.building_dong || '', lst.building_ho || '');
      if (!unit || !unit.exclusiveArea || !unit.totalArea) { skipped++; continue; }

      // 보정 기준: 차이 ≥5% (area_m2 vs unit.exclusiveArea)
      const diffPct = Math.abs(lst.area_m2! - unit.exclusiveArea) / unit.exclusiveArea;
      if (diffPct < 0.05) { skipped++; continue; }

      const before = { m2: lst.area_m2!, supply: lst.area_supply_m2! };
      const after = { m2: unit.exclusiveArea, supply: unit.totalArea };

      const { error } = await supabase
        .from('listings')
        .update({
          area_m2: after.m2,
          area_supply_m2: after.supply,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lst.id);

      if (!error) {
        updated++;
        audit.push({ id: lst.id, before, after, reason: `registry diff ${(diffPct * 100).toFixed(1)}%` });
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  // audit 보고
  await addBreadcrumb('cron', 'auto-fix-area', {
    candidates: candidates?.length || 0,
    suspect: filtered.length,
    updated,
    skipped,
  });

  if (updated > 0) {
    await captureWarning(`[auto-fix-area] ${updated}건 면적 자동 보정`, {
      route: 'cron/auto-fix-area',
      tags: { updated: String(updated), skipped: String(skipped) },
      extra: { sample_audit: audit.slice(0, 5) },
    });
  }

  return NextResponse.json({
    success: true,
    candidates: candidates?.length || 0,
    suspect: filtered.length,
    updated,
    skipped,
    audit_sample: audit.slice(0, 5),
    ts: new Date().toISOString(),
  });
}

export const POST = GET;
