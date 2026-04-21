import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Listing {
  id: number;
  type: string;
  deal: string;
  deposit: number;
  monthly: number;
  price: number;
  area_m2: number;
  rooms: number;
  floor_current: number;
  floor_total: number;
  address: string;
  dong: string;
  gu: string;
  lat: number;
  lng: number;
  title: string;
  status: string;
  elevator: boolean;
  parking: boolean;
  pet: boolean;
  balcony: boolean;
  full_option: boolean;
  building_name: string;
  created_at: string;
  [key: string]: unknown;
}

interface ScoredListing {
  listing: Listing;
  score: number;
  maxScore: number;
  matchPercent: number;
  reasons: string[];
}

function scoreListing(target: Listing, candidate: Listing): ScoredListing {
  let score = 0;
  const maxScore = 100;
  const reasons: string[] = [];

  // 1. Property type match (25 points)
  if (candidate.type === target.type && target.type) {
    score += 25;
    reasons.push(`${target.type} 동일 유형`);
  }

  // 2. Location proximity (25 points)
  if (candidate.dong === target.dong && target.dong) {
    score += 25;
    reasons.push(`${target.dong} 동일 지역`);
  } else if (candidate.gu === target.gu && target.gu) {
    score += 15;
    reasons.push(`${target.gu} 동일 구`);
  }

  // 3. Price similarity (20 points)
  const tPrice = target.deal === '매매' ? (target.price || 0) : (target.deposit || 0);
  const cPrice = candidate.deal === '매매' ? (candidate.price || 0) : (candidate.deposit || 0);
  if (tPrice > 0 && cPrice > 0) {
    const pDiff = Math.abs(cPrice - tPrice) / tPrice;
    if (pDiff <= 0.1) { score += 20; reasons.push('가격대 유사 (10% 이내)'); }
    else if (pDiff <= 0.2) { score += 15; reasons.push('가격대 유사 (20% 이내)'); }
    else if (pDiff <= 0.3) { score += 10; reasons.push('가격대 비슷 (30% 이내)'); }
  }

  // 4. Monthly rent similarity for wolse (10 points)
  if (target.deal === '월세' && candidate.deal === '월세') {
    const tMonthly = target.monthly || 0;
    const cMonthly = candidate.monthly || 0;
    if (tMonthly > 0 && cMonthly > 0) {
      const mDiff = Math.abs(cMonthly - tMonthly) / tMonthly;
      if (mDiff <= 0.15) { score += 10; reasons.push('월세 유사'); }
      else if (mDiff <= 0.3) { score += 5; }
    }
  }

  // 5. Area similarity (10 points)
  const tArea = target.area_m2 || 0;
  const cArea = candidate.area_m2 || 0;
  if (tArea > 0 && cArea > 0) {
    const aDiff = Math.abs(cArea - tArea) / tArea;
    if (aDiff <= 0.15) { score += 10; reasons.push('면적 유사'); }
    else if (aDiff <= 0.3) { score += 5; }
  }

  // 6. Deal type match (5 points)
  if (candidate.deal === target.deal && target.deal) {
    score += 5;
  }

  // 7. Amenity bonus (5 points)
  let amenityMatch = 0;
  const amenities = ['elevator', 'parking', 'pet', 'balcony', 'full_option'] as const;
  amenities.forEach(a => {
    if (target[a] && candidate[a]) amenityMatch++;
  });
  if (amenityMatch >= 3) { score += 5; reasons.push('주요 옵션 일치'); }
  else if (amenityMatch >= 2) { score += 3; }

  const matchPercent = Math.min(Math.round((score / maxScore) * 100), 100);

  return { listing: candidate, score, maxScore, matchPercent, reasons };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id, 10);
    if (isNaN(listingId)) {
      return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
    }

    // Fetch target listing
    const { data: target, error: targetError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // Fetch candidates: same gu, status active, not self
    const { data: candidates, error: candError } = await supabase
      .from('listings')
      .select('*')
      .eq('status', '공개')
      .neq('id', listingId)
      .limit(200);

    if (candError) {
      return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 });
    }

    // Score and rank
    const scored: ScoredListing[] = (candidates || [])
      .map((c: Listing) => scoreListing(target as Listing, c))
      .filter((s: ScoredListing) => s.score >= 20)
      .sort((a: ScoredListing, b: ScoredListing) => b.score - a.score)
      .slice(0, 6);

    // Return slim response
    const results = scored.map(s => ({
      id: s.listing.id,
      title: s.listing.title,
      type: s.listing.type,
      deal: s.listing.deal,
      deposit: s.listing.deposit,
      monthly: s.listing.monthly,
      price: s.listing.price,
      area_m2: s.listing.area_m2,
      rooms: s.listing.rooms,
      floor_current: s.listing.floor_current,
      floor_total: s.listing.floor_total,
      dong: s.listing.dong,
      address: s.listing.address,
      building_name: s.listing.building_name,
      elevator: s.listing.elevator,
      parking: s.listing.parking,
      created_at: s.listing.created_at,
      matchPercent: s.matchPercent,
      reasons: s.reasons.slice(0, 3),
    }));

    return NextResponse.json({ recommendations: results, targetId: listingId });
  } catch (error) {
    console.error('[recommend] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
