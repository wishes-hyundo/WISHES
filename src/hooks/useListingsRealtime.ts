// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useListingsRealtime — Supabase Realtime 으로 신규/수정 매물 푸시 수신
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 🎯 패턴: Supabase Realtime "Broadcast from Database" (2026 공식 권장)
//   기존 postgres_changes 는 단일 스레드 → 고부하 테이블에서 메시지 손실.
//   우리는 listings 변동을 listings_map_diff mirror 테이블 + trigger 로 적재하고
//   Realtime 은 mirror 테이블에 대한 postgres_changes INSERT 만 구독.
//
// 훅은 bounds 를 받아 화면 내 변동만 콜백 호출. 지도 표시는 부모가 결정.

'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { MapBounds } from '@/types';

export interface ListingDiff {
  id: number;
  lat: number | null;
  lng: number | null;
  type: string | null;
  deal: string | null;
  price_unified: number | null;
  thumb_url: string | null;
  title: string | null;
  op: 'insert' | 'update' | 'delete';
  created_at: string;
}

interface Options {
  bounds?: MapBounds | null;
  /** bounds 교차 매물만 콜백. 전체를 원하면 false */
  scoped?: boolean;
  onDiff?: (d: ListingDiff) => void;
  enabled?: boolean;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 브라우저 클라이언트 모듈 싱글턴 (여러 훅 인스턴스가 하나의 connection 재사용)
let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (typeof window === 'undefined') return null;
  if (!_client && SUPABASE_URL && SUPABASE_ANON_KEY) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _client;
}

export function useListingsRealtime({
  bounds,
  scoped = true,
  onDiff,
  enabled = true,
}: Options) {
  const latestBounds = useRef<MapBounds | null | undefined>(bounds);
  const latestOnDiff = useRef(onDiff);
  useEffect(() => {
    latestBounds.current = bounds;
  }, [bounds]);
  useEffect(() => {
    latestOnDiff.current = onDiff;
  }, [onDiff]);

  useEffect(() => {
    if (!enabled) return;
    const client = getClient();
    if (!client) return;

    const channel = client
      .channel('listings_map_diff')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'listings_map_diff' },
        (payload) => {
          const diff = payload.new as ListingDiff;
          if (!diff) return;
          // bounds 교차 필터
          if (scoped && latestBounds.current && diff.lat != null && diff.lng != null) {
            const b = latestBounds.current;
            if (
              diff.lat < b.swLat ||
              diff.lat > b.neLat ||
              diff.lng < b.swLng ||
              diff.lng > b.neLng
            ) {
              return;
            }
          }
          latestOnDiff.current?.(diff);
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [enabled, scoped]);
}
