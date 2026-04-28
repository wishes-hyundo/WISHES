/**
 * /api/admin/briefing-pdf/[id] — 2026 SOTA: @react-pdf/renderer 4.1
 * React 컴포넌트 → PDF 직접 변환. 의존성 1개, 빌드 위험 작음.
 * 한국어: Noto Sans KR (Google Fonts)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';
import { createServerClient } from '@/lib/supabase';
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import React from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// 한국어 폰트 등록 (Noto Sans KR — Google Fonts)
Font.register({
  family: 'NotoSansKR',
  src: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf',
});
Font.register({
  family: 'NotoSansKR-Bold',
  src: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/Korean/NotoSansCJKkr-Bold.otf',
});

interface ListingRow {
  id: number;
  type: string | null; deal: string | null;
  address: string | null; dong: string | null; gu: string | null;
  area_m2: number | null; area_supply_m2: number | null;
  floor_current: string | null; floor_total: number | null;
  rooms: number | null; bathrooms: number | null;
  deposit: number | null; monthly: number | null; price: number | null;
  direction: string | null; heating_type: string | null;
  built_year: number | null; parking: boolean | null; elevator: boolean | null;
  description: string | null; trust_score: number | null;
}

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: 'NotoSansKR', color: '#222' },
  header: { backgroundColor: '#2D5A27', color: '#fff', padding: 16, marginBottom: 16 },
  h1: { fontSize: 24, fontFamily: 'NotoSansKR-Bold' },
  meta: { fontSize: 12, opacity: 0.9, marginTop: 4 },
  price: { fontSize: 28, fontFamily: 'NotoSansKR-Bold', color: '#2D5A27', marginVertical: 12 },
  addr: { fontSize: 16, fontFamily: 'NotoSansKR-Bold', marginBottom: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee', paddingVertical: 4 },
  label: { color: '#666', width: 100, fontSize: 11 },
  val: { fontSize: 12, fontFamily: 'NotoSansKR-Bold' },
  descLabel: { fontSize: 14, fontFamily: 'NotoSansKR-Bold', color: '#2D5A27', marginTop: 16, marginBottom: 6 },
  desc: { backgroundColor: '#f5f7f5', padding: 10, fontSize: 11, lineHeight: 1.5 },
  footer: { backgroundColor: '#f8f8f8', padding: 10, fontSize: 9, color: '#666', borderTopWidth: 1, borderTopColor: '#2D5A27', marginTop: 'auto' },
});

function fmt(n: number | null): string {
  if (n == null) return '-';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`;
  return `${n.toLocaleString()}만원`;
}

function BriefingPDF({ l }: { l: ListingRow }) {
  const pyeong = l.area_m2 ? Math.round((l.area_m2 / 3.305) * 10) / 10 : null;
  const priceLabel = l.deal === '월세'
    ? `보증금 ${fmt(l.deposit)} / 월세 ${fmt(l.monthly)}`
    : fmt(l.price ?? l.deposit);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.h1}>{l.type} · {l.deal}</Text>
          {l.trust_score != null && <Text style={styles.meta}>신뢰도 {l.trust_score}/100</Text>}
        </View>
        <Text style={styles.price}>{priceLabel}</Text>
        <Text style={styles.addr}>{[l.gu, l.dong, l.address].filter(Boolean).join(' ')}</Text>
        {[
          ['전용면적', l.area_m2 ? `${l.area_m2}㎡ (${pyeong}평)` : '-'],
          ['공급면적', l.area_supply_m2 ? `${l.area_supply_m2}㎡` : '-'],
          ['층', l.floor_current ? `${l.floor_current}/${l.floor_total ?? '-'}` : '-'],
          ['방/욕실', `${l.rooms ?? '-'}/${l.bathrooms ?? '-'}`],
          ['건축년도', String(l.built_year ?? '-')],
          ['방향', l.direction ?? '-'],
          ['난방', l.heating_type ?? '-'],
          ['주차', l.parking ? '주차 가능' : '-'],
          ['엘리베이터', l.elevator ? '엘리베이터' : '-'],
        ].map(([label, val], i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.val}>{val}</Text>
          </View>
        ))}
        {l.description && (
          <>
            <Text style={styles.descLabel}>매물 설명</Text>
            <Text style={styles.desc}>{l.description}</Text>
          </>
        )}
        <Text style={styles.footer}>
          WISHES · wishes.co.kr/listings/{l.id} · 매물 ID #{l.id} · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  );
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const supabase = createServerClient();
  const { data } = await supabase.from('listings').select('*').eq('id', Number(id)).maybeSingle();
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    const buf = await renderToBuffer(<BriefingPDF l={data as ListingRow} />);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="wishes-briefing-${id}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'PDF 생성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
