/**
 * /api/cron/geocode-missing
 * 
 * lat/lng NULL 매물 자동 좌표 보정 (Kakao Local API).
 * 사장님 명령: 자동화. cron 매일 호출.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // G-73 (2026-05-03): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 무인증 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = (request.headers.get('authorization') || '');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
  if (!KAKAO_KEY) {
    return NextResponse.json({ success: false, error: 'KAKAO_REST_API_KEY 미설정' }, { status: 500 });
  }

  try {
    const supabase = createServerClient();

    // [Step F-4 fix 2026-05-18] status 확장 — 비공개 13,826건 도 backfill 대상
    //   기존: status='공개' 만 → 비공개 매물 영영 좌표 미보유
    //   수정: 공개 + 비공개 (거래완료/계약중 제외)
    // [Step F-5 fix 2026-05-18] road_address NEVER 60,444건도 같이 backfill
    //   기존: lat NULL 만 처리 → 좌표 있는데 road_address NULL 매물 영영 미보강
    //   수정: (lat NULL) OR (road_address NULL AND fetched_at NULL) 둘 다 처리
    //   추가: road_address + road_address_fetched_at 도 저장
    // 좌표 누락 매물 50건씩 처리 (rate limit 안전)
    const { data: targets, error } = await supabase
      .from('listings')
      .select('id, address, lat, lng, road_address')
      .or('lat.is.null,lng.is.null,and(road_address.is.null,road_address_fetched_at.is.null)')
      .in('status', ['공개', '비공개'])
      .not('address', 'is', null)
      .order('road_address_fetched_at', { ascending: true, nullsFirst: true })
      .limit(50);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!targets || targets.length === 0) {
      return NextResponse.json({ success: true, geocoded: 0, message: '좌표 누락 매물 없음' });
    }

    let geocoded = 0;
    let roadFilled = 0;
    for (const t of targets) {
      try {
        // [F-3 적용] analyze_type=exact + address_type 검증 (REGION 거부)
        const tryFetch = async (mode: 'exact' | 'similar