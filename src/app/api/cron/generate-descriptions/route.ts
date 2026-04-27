// ──────────────────────────────────────────────────────────────────────
// BoB Phase 0-E: ai_description 템플릿 기반 자동 생성 cron
// 작성: 2026-04-27 v3 세션 (사용자 명시 — 비용 0)
//
// 동작:
//   1. ai_description IS NULL OR length < 30 매물 N건 (default 100)
//   2. raw_fields + 기본 칸 조합으로 자연스러운 한국어 설명 자동 생성 (외부 API 0)
//   3. listings.ai_description / seo_meta_description UPDATE
//      ※ field_sources cascade 보호 (broker 잠금 칸 절대 안 덮어씀)
//
// 비용 0 정책:
//   - 외부 API 호출 X (Anthropic 등 유료 모델 사용 X)
//   - 순수 템플릿 + 자연스러운 문장 조합
//   - Vercel cron Hobby 무료
//
// SEO 효과:
//   - 색인 가능 매물 24% (2,876건) → 100% (12,115건) 까지 점진 증가
//   - 사용자 명시 — "구글/네이버 무조건 노출"
// ──────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { timingSafeEqualStr } from '@/lib/timingSafe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type AnyObj = Record<string, unknown>;
type FieldSources = Record<string, string> | null | undefined;

// ── 템플릿 빌더 ───────────────────────────────────────────────────
function buildDescription(l: AnyObj, features: string[], fs: FieldSources): {
  ai_description: string;
  seo_meta_description: string;
} {
  const parts: string[] = [];

  // 1. 위치 + 건물
  const loc = [l.gu, l.dong].filter(Boolean).join(' ');
  const bldg = (l.building_name as string) || '';
  const floorPart = l.floor_current && l.floor_total
    ? `${l.floor_current}층/${l.floor_total}층`
    : '';
  const locSentence = [loc, bldg, floorPart].filter(Boolean).join(' ').trim();
  if (locSentence) parts.push(`${locSentence} 위치한 ${l.type || '매물'}.`);

  // 2. 면적 + 룸 구성
  const areaParts: string[] = [];
  if (l.area_m2 && (l.area_m2 as number) > 0) {
    const py = Math.round((l.area_m2 as number) / 3.3058);
    areaParts.push(`전용 ${l.area_m2}㎡(약 ${py}평)`);
  }
  if (l.area_supply_m2 && (l.area_supply_m2 as number) > 0 && l.area_supply_m2 !== l.area_m2) {
    areaParts.push(`공급 ${l.area_supply_m2}㎡`);
  }
  const roomParts: string[] = [];
  if (l.rooms && (l.rooms as number) > 0) roomParts.push(`방 ${l.rooms}개`);
  if (l.bathrooms && (l.bathrooms as number) > 0) roomParts.push(`욕실 ${l.bathrooms}개`);
  if (areaParts.length || roomParts.length) {
    parts.push([...areaParts, ...roomParts].join(', ') + '.');
  }

  // 3. 거래 / 가격
  const dealText: string[] = [];
  if (l.deal === '월세') {
    if (l.deposit) dealText.push(`보증금 ${l.deposit}만원`);
    if (l.monthly) dealText.push(`월세 ${l.monthly}만원`);
  } else if (l.deal === '전세' || l.deal === '매매') {
    const p = (l.price as number) || (l.deposit as number) || 0;
    if (p > 0) dealText.push(`${l.deal} ${p.toLocaleString()}만원`);
  }
  if (l.maintenance_fee && (l.maintenance_fee as number) > 0) {
    dealText.push(`관리비 ${l.maintenance_fee}만원`);
  }
  if (dealText.length) parts.push(dealText.join(', ') + '.');

  // 4. 옵션 (대표 5개)
  if (features.length > 0) {
    const top = features.slice(0, 5).join(', ');
    const more = features.length > 5 ? ` 외 ${features.length - 5}개` : '';
    parts.push(`옵션: ${top}${more}.`);
  }

  // 5. 부대 정보
  const extras: string[] = [];
  if (l.parking_spaces && (l.parking_spaces as number) > 0) extras.push(`주차 ${l.parking_spaces}대`);
  if (l.built_year) {
    const y = String(l.built_year).match(/\d{4}/);
    if (y) extras.push(`${y[0]}년 준공`);
  }
  if (l.heating_type) extras.push(`${l.heating_type} 난방`);
  if (l.direction) extras.push(`${l.direction}향`);
  if (extras.length) parts.push(extras.join(', ') + '.');

  // 6. 입주 가능
  if (l.available_date) {
    parts.push(`입주: ${l.available_date}.`);
  }

  // 7. 역세권 (있으면)
  if (l.station_name && l.station_distance) {
    parts.push(`${l.station_name} 도보 ${l.station_distance}분.`);
  }

  const aiDesc = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  // SEO meta description (160자 제한)
  const seoBase = parts.slice(0, 4).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const seoDesc = seoBase.length > 160 ? seoBase.slice(0, 157) + '...' : seoBase;

  return {
    ai_description: aiDesc,
    seo_meta_description: seoDesc,
  };
}

// ── GET 핸들러 ─────────────────────────────────────────────────────
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

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  const supabase = createServerClient();

  // ai_description 짧거나 NULL 인 매물 N건
  const { data: targets, error: selErr } = await supabase
    .from('listings')
    .select(`
      id, type, deal, dong, gu, address, building_name,
      deposit, monthly, price, area_m2, area_supply_m2,
      floor_current, floor_total, rooms, bathrooms,
      direction, heating_type, available_date, built_year,
      maintenance_fee, parking_spaces,
      station_name, station_distance,
      ai_description, seo_meta_description, field_sources,
      listing_features(feature)
    `)
    .eq('status', '공개')
    .or('ai_description.is.null,ai_description.eq.')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (selErr) {
    return NextResponse.json({ error: 'select failed', detail: selErr.message }, { status: 500 });
  }

  const results = {
    total_targets: targets?.length || 0,
    success: 0,
    skipped_broker_locked: 0,
    skipped_too_short: 0,
    error: 0,
    dry_run: dryRun,
    samples: [] as unknown[],
  };

  for (const listing of targets || []) {
    try {
      const features = Array.isArray((listing as AnyObj).listing_features)
        ? ((listing as AnyObj).listing_features as { feature: string }[]).map((f) => f.feature).filter(Boolean)
        : [];

      const fs: Record<string, string> = ((listing as AnyObj).field_sources as FieldSources) || {};
      const isBrokerLocked = (k: string) => fs[k] === 'broker';

      // cascade 보호
      if (isBrokerLocked('ai_description') && isBrokerLocked('seo_meta_description')) {
        results.skipped_broker_locked++;
        continue;
      }

      const built = buildDescription(listing as AnyObj, features, fs);

      if (built.ai_description.length < 30) {
        results.skipped_too_short++;
        continue;
      }

      if (dryRun) {
        results.samples.push({
          id: (listing as AnyObj).id,
          ai_description: built.ai_description,
          seo_meta_description: built.seo_meta_description,
        });
        continue;
      }

      const updateData: Record<string, unknown> = {};
      const newSources: Record<string, string> = {};

      if (!isBrokerLocked('ai_description')) {
        updateData.ai_description = built.ai_description;
        newSources.ai_description = 'auto';
      }
      if (!isBrokerLocked('seo_meta_description')) {
        updateData.seo_meta_description = built.seo_meta_description;
        newSources.seo_meta_description = 'auto';
      }

      if (Object.keys(updateData).length === 0) {
        results.skipped_broker_locked++;
        continue;
      }

      updateData.field_sources = { ...fs, ...newSources };

      const { error: upErr } = await supabase
        .from('listings')
        .update(updateData)
        .eq('id', (listing as AnyObj).id);
      if (upErr) {
        results.error++;
      } else {
        results.success++;
      }
    } catch {
      results.error++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
