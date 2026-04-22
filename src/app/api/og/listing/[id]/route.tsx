// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/og/listing/[id]
//   매물 상세 페이지 공유 시 카카오톡/페이스북/트위터 카드 이미지 (1200×630)
//   - Next.js ImageResponse (Edge Runtime, 무료)
//   - 외부 이미지 의존 없음 · 순수 텍스트 + 브랜드 컬러 카드
//   - 크롤링 매물(source_site)도 텍스트 정보만 표시 (사진은 제외)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatPrice(man: number | null | undefined): string {
  if (!man) return '—';
  if (man >= 10000) {
    const uk = Math.floor(man / 10000);
    const rest = man % 10000;
    return rest > 0 ? `${uk}억 ${rest.toLocaleString()}` : `${uk}억`;
  }
  return `${man.toLocaleString()}만원`;
}

function buildPriceText(listing: any): string {
  if (listing.deal === '월세') {
    return `보증금 ${formatPrice(listing.deposit)} / 월세 ${listing.monthly ? listing.monthly.toLocaleString() : '—'}만원`;
  }
  if (listing.deal === '전세') {
    return `전세 ${formatPrice(listing.deposit)}`;
  }
  if (listing.deal === '매매') {
    return `매매 ${formatPrice(listing.price || listing.deposit)}`;
  }
  return formatPrice(listing.price || listing.deposit);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // L-sec46 (2026-04-22): validate id is an integer in range. Raw string to .eq()
    //   can cause 500 on non-numeric input; also caps flood-abuse.
    const nId = Number(id);
    if (!Number.isFinite(nId) || !Number.isInteger(nId) || nId < 0 || nId > 2_000_000_000) {
      return new Response('invalid id', { status: 400 });
    }
    const supabase = createServerClient();

    const { data: listing } = await supabase
      .from('listings')
      .select('title, type, deal, dong, gu, deposit, monthly, price, area_m2, floor_current, floor_total, rooms, source_site')
      .eq('id', nId)
      .single();

    // 기본 카드 (매물 미발견 또는 에러 시)
    if (!listing) {
      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#1b5e20',
              color: 'white',
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            <div style={{ fontSize: 36, opacity: 0.8, marginBottom: 12 }}>WISHES 부동산</div>
            <div>매물 정보</div>
          </div>
        ),
        { width: 1200, height: 630 }
      );
    }

    const priceText = buildPriceText(listing);
    const location = [listing.gu, listing.dong].filter(Boolean).join(' ');
    const titleText = listing.title || `${listing.dong || ''} ${listing.type || ''}`.trim();

    // 보조 스펙
    const specs: string[] = [];
    if (listing.area_m2) specs.push(`${Number(listing.area_m2).toFixed(1)}m²`);
    if (listing.rooms) specs.push(`${listing.rooms}룸`);
    if (listing.floor_current && listing.floor_total) {
      specs.push(`${listing.floor_current}/${listing.floor_total}층`);
    }

    const dealColor =
      listing.deal === '전세' ? '#1565c0'
      : listing.deal === '매매' ? '#e65100'
      : '#2e7d32';

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '60px 80px',
            background: 'linear-gradient(135deg, #f4f9f4 0%, #e8f5e9 50%, #c8e6c9 100%)',
            color: '#1b3a24',
            fontFamily: 'sans-serif',
          }}
        >
          {/* 헤더: 브랜드 + 거래유형 뱃지 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 40,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #2e7d32, #1b5e20)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: 28,
                  letterSpacing: '-0.02em',
                }}
              >
                W
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#1b5e20', letterSpacing: '-0.02em' }}>
                  WISHES
                </div>
                <div style={{ fontSize: 16, color: '#5f7d68', marginTop: 2 }}>
                  서울·경기 부동산 전문
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                padding: '10px 24px',
                borderRadius: 999,
                background: dealColor,
                color: 'white',
                fontWeight: 800,
                fontSize: 26,
                letterSpacing: '-0.02em',
              }}
            >
              {listing.deal || '매물'}
            </div>
          </div>

          {/* 본문: 가격 · 제목 · 위치 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: 'center',
              gap: 20,
            }}
          >
            {/* 가격 */}
            <div
              style={{
                fontSize: 68,
                fontWeight: 800,
                color: '#1b5e20',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                display: 'flex',
              }}
            >
              {priceText}
            </div>

            {/* 매물 제목 */}
            <div
              style={{
                fontSize: 36,
                fontWeight: 600,
                color: '#1b3a24',
                letterSpacing: '-0.02em',
                lineHeight: 1.3,
                display: 'flex',
                overflow: 'hidden',
                maxHeight: 96,
              }}
            >
              {titleText.length > 50 ? titleText.slice(0, 48) + '…' : titleText}
            </div>

            {/* 위치 + 스펙 */}
            <div
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {location && (
                <div
                  style={{
                    display: 'flex',
                    padding: '10px 20px',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.7)',
                    border: '1px solid rgba(102, 187, 106, 0.3)',
                    fontSize: 24,
                    fontWeight: 600,
                    color: '#1b5e20',
                  }}
                >
                  📍 {location}
                </div>
              )}
              {listing.type && (
                <div
                  style={{
                    display: 'flex',
                    padding: '10px 20px',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.7)',
                    border: '1px solid rgba(102, 187, 106, 0.3)',
                    fontSize: 24,
                    fontWeight: 600,
                    color: '#2e7d32',
                  }}
                >
                  {listing.type}
                </div>
              )}
              {specs.map((s) => (
                <div
                  key={s}
                  style={{
                    display: 'flex',
                    padding: '10px 20px',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.5)',
                    fontSize: 22,
                    color: '#5f7d68',
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* 푸터 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 24,
              borderTop: '2px solid rgba(102, 187, 106, 0.3)',
              color: '#5f7d68',
              fontSize: 20,
              fontWeight: 500,
            }}
          >
            <div style={{ display: 'flex' }}>wishes.co.kr</div>
            <div style={{ display: 'flex' }}>공인중개사 전담 상담</div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    console.error('OG image 생성 실패:', e);
    return new Response('OG image generation failed', { status: 500 });
  }
}
