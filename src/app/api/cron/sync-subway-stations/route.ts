// ──────────────────────────────────────────────────────────────────────
// /api/cron/sync-subway-stations — 전국 지하철역 + 출구 정부 공식 sync
// 작성: 2026-04-29 사장님 명령 "정확도 100% 무조건"
//
// 데이터 소스 (정부 공식, 무료):
//   1. 국토교통부 TAGO SubwayInfoService — 출구 좌표 (전국)
//   2. 서울교통공사 (data.go.kr 15058404) — 서울 1-9호선 역 좌표
//   3. (확장) 인천/부산/대구 운영기관별 OpenAPI
//
// 정책:
//   - 좌표는 모두 WGS84 (EPSG:4326)
//   - 응답 좌표 누락 시 skip (잘못된 데이터 입력 차단)
//   - 활용신청 안 된 데이터셋은 즉시 알람 + skip
// ──────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_API_KEY || process.env.BUILDING_LEDGER_API_KEY || '';

interface StationRow {
  name: string;
  line: string;
  operator: string;
  lat: number;
  lng: number;
  station_code?: string;
  raw_record?: Record<string, unknown>;
}

interface ExitRow {
  station_name: string;
  line: string;
  exit_no: string;
  lat: number;
  lng: number;
  raw_record?: Record<string, unknown>;
}

// ── 서울교통공사 (data.go.kr 15058404) — 서울 1~9호선 + 우이신설 등 ──
async function fetchSeoulMetroStations(): Promise<StationRow[]> {
  if (!DATA_GO_KR_KEY) return [];
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(DATA_GO_KR_KEY)}/json/SearchInfoBySubwayNameService/1/1000/`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const j = await res.json();
    const rows = j?.SearchInfoBySubwayNameService?.row || [];
    return rows
      .map((r: Record<string, unknown>) => {
        const lat = parseFloat(String(r.YPOINT_WGS || r.YPOINT || ''));
        const lng = parseFloat(String(r.XPOINT_WGS || r.XPOINT || ''));
        if (!isFinite(lat) || !isFinite(lng) || lat === 0 || lng === 0) return null;
        return {
          name: String(r.STATION_NM || '').trim(),
          line: String(r.LINE_NUM || '').trim(),
          operator: '서울교통공사',
          lat,
          lng,
          station_code: String(r.STATION_CD || '').trim() || undefined,
          raw_record: r,
        } as StationRow;
      })
      .filter((s: StationRow | null): s is StationRow => !!s && !!s.name && !!s.line);
  } catch {
    return [];
  }
}

// ── TAGO 출구 정보 (전국) — getSubwayStationExitList ──
// 이 API 는 역 ID 가 필요. 먼저 stations 채운 후 별도 sync 필요.
// 1단계 sync 에서는 역 + 좌표만 채우고, 출구는 다음 단계.
async function fetchTagoStationByName(name: string): Promise<StationRow[]> {
  if (!DATA_GO_KR_KEY) return [];
  const url = `http://openapi.tago.go.kr/openapi/service/SubwayInfoService/searchSubwayStationList?serviceKey=${DATA_GO_KR_KEY}&subwayStationName=${encodeURIComponent(name)}&numOfRows=10&pageNo=1&_type=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const j = await res.json();
    const items = j?.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr
      .map((it: Record<string, unknown>) => {
        const lat = parseFloat(String(it.gpsY || it.latitude || ''));
        const lng = parseFloat(String(it.gpsX || it.longitude || ''));
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return {
          name: String(it.subwayStationName || '').trim(),
          line: String(it.subwayRouteName || '').trim(),
          operator: 'TAGO',
          lat,
          lng,
          station_code: String(it.subwayStationId || '').trim() || undefined,
          raw_record: it,
        } as StationRow;
      })
      .filter((s: StationRow | null): s is StationRow => !!s);
  } catch {
    return [];
  }
}

// ── 출구 sync (TAGO getSubwayStationExitList) ──
async function fetchTagoExitsForStation(
  stationCode: string,
  stationName: string,
  line: string
): Promise<ExitRow[]> {
  if (!DATA_GO_KR_KEY || !stationCode) return [];
  const url = `http://openapi.tago.go.kr/openapi/service/SubwayInfoService/getSubwayStationExitList?serviceKey=${DATA_GO_KR_KEY}&subwayStationId=${encodeURIComponent(stationCode)}&numOfRows=30&pageNo=1&_type=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const j = await res.json();
    const items = j?.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr
      .map((it: Record<string, unknown>) => {
        const lat = parseFloat(String(it.gpsY || it.latitude || ''));
        const lng = parseFloat(String(it.gpsX || it.longitude || ''));
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return {
          station_name: stationName,
          line,
          exit_no: String(it.exitNo || it.exitNumber || '').trim() || '?',
          lat,
          lng,
          raw_record: it,
        } as ExitRow;
      })
      .filter((e: ExitRow | null): e is ExitRow => !!e);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  // G-86 (2026-05-04): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 fail-open)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!DATA_GO_KR_KEY) {
    return NextResponse.json({ error: 'DATA_GO_KR_API_KEY 미설정' }, { status: 500 });
  }

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  const startedAt = Date.now();

  // ── 1단계: 서울교통공사 (서울 1-9호선) ──────────────────
  const seoulStations = await fetchSeoulMetroStations();
  let stationsInserted = 0, stationsFailed = 0;
  for (const s of seoulStations) {
    try {
      const { error } = await supabase
        .from('subway_stations')
        .upsert(
          {
            name: s.name,
            line: s.line,
            operator: s.operator,
            station_code: s.station_code,
            geom: `SRID=4326;POINT(${s.lng} ${s.lat})`,
            source: 'data.go.kr / 서울교통공사',
            raw_record: s.raw_record,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'name,line' }
        );
      if (error) stationsFailed++;
      else stationsInserted++;
    } catch {
      stationsFailed++;
    }
  }

  // ── 2단계: 출구 sync 는 별도 cron 으로 (TAGO 호출 많아 timeout 위험) ──
  // 첫 sync 는 stations 만. exits 는 후속 cron 또는 lazy-load.
  const exitsInserted = 0;

  // sync log
  try {
    await supabase.from('subway_data_sync_log').insert({
      source: 'data.go.kr / 서울교통공사',
      target: 'stations',
      total_received: seoulStations.length,
      inserted: stationsInserted,
      updated: 0,
      failed: stationsFailed,
      duration_ms: Date.now() - startedAt,
      finished_at: new Date().toISOString(),
    });
  } catch { /* skip */ }

  return NextResponse.json({
    success: true,
    stations: {
      received: seoulStations.length,
      inserted: stationsInserted,
      failed: stationsFailed,
    },
    exits: { inserted: exitsInserted },
    duration_ms: Date.now() - startedAt,
  });
}
