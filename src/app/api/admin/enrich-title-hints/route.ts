// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/enrich-title-hints
// title + description 텍스트 기반 키워드 파싱으로
// direction / pet / full_option / elevator / parking / bathrooms / loan_available
// 불리언/숫자 필드를 백필한다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const maxDuration = 300;

interface ListingRow {
  id: number;
  title: string | null;
  description: string | null;
  type: string | null;
  direction: string | null;
  pet: boolean | null;
  full_option: boolean | null;
  elevator: boolean | null;
  parking: boolean | null;
  bathrooms: number | null;
  loan_available: boolean | null;
  balcony: boolean | null;
}

type Patch = Partial<
  Pick<
    ListingRow,
    | 'direction'
    | 'pet'
    | 'full_option'
    | 'elevator'
    | 'parking'
    | 'bathrooms'
    | 'loan_available'
    | 'balcony'
  >
>;

function extractPatch(row: ListingRow): Patch {
  const text = `${row.title || ''} ${row.description || ''}`;
  const patch: Patch = {};

  // direction
  if (!row.direction) {
    const m = text.match(/(남동|남서|북동|북서|정남|정북|정동|정서|남|북|동|서)향/);
    if (m) patch.direction = `${m[1]}향`;
  }

  // pet
  if (row.pet == null || row.pet === false) {
    if (/애견|반려동물|펫|강아지|고양이/i.test(text) && !/불가|금지|제한|노\s*펫|NO\s*PET/i.test(text)) {
      patch.pet = true;
    }
  }

  // full_option
  if (row.full_option == null || row.full_option === false) {
    if (/풀\s*옵션|풀옵션|올\s*옵션|full\s*option/i.test(text)) {
      patch.full_option = true;
    }
  }

  // elevator
  if (row.elevator == null || row.elevator === false) {
    if (/엘리베이터|E\/V|EV\b|엘베/i.test(text)) {
      patch.elevator = true;
    }
  }

  // parking
  if (row.parking == null || row.parking === false) {
    if (/주차\s*(가능|가|\bO\b|1대|2대|무료|유료)|주차장\s*(완비|있음)/i.test(text)) {
      patch.parking = true;
    } else if (/자주식\s*주차|기계식\s*주차/.test(text)) {
      patch.parking = true;
    }
  }

  // bathrooms
  if (!row.bathrooms) {
    const m = text.match(/화장실\s*(\d)\s*개?/) || text.match(/욕실\s*(\d)\s*개?/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 5) patch.bathrooms = n;
    }
  }

  // loan_available
  if (row.loan_available == null || row.loan_available === false) {
    if (/전세자금\s*대출|전세\s*대출|대출\s*가능|LH\s*가능|HUG\s*가능|버팀목/i.test(text)) {
      patch.loan_available = true;
    }
  }

  // balcony
  if (row.balcony == null || row.balcony === false) {
    if (/발코니|베란다|테라스/i.test(text)) {
      patch.balcony = true;
    }
  }

  return patch;
}

export async function POST(request: NextRequest) {
  // L-sec3 (2026-04-22): 인증 미보호 → verifyAdminAuth 추가 (listings 대량 UPDATE 보호)
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 2000);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { data, error } = await supabase
      .from('listings')
      .select(
        'id, title, description, type, direction, pet, full_option, elevator, parking, bathrooms, loan_available, balcony'
      )
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      // L-sec115 (2026-04-22): admin-gated defense-in-depth.
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: '조회 실패', ...(isDev && { detail: error.message }) }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ success: true, updated: 0, scanned: 0 });
    }

    let updated = 0;
    let scanned = 0;
    for (const row of data as ListingRow[]) {
      scanned++;
      const patch = extractPatch(row);
      if (Object.keys(patch).length === 0) continue;
      const { error: upErr } = await supabase
        .from('listings')
        .update(patch)
        .eq('id', row.id);
      if (!upErr) updated++;
    }

    return NextResponse.json({
      success: true,
      scanned,
      updated,
      nextOffset: offset + data.length,
      done: data.length < limit,
    });
  } catch (e) {
    console.error('enrich-title-hints 오류:', e);
    return NextResponse.json(
      { success: false, error: '키워드 보강 실패' },
      { status: 500 }
    );
  }
}
