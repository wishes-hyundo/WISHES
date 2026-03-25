import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);

    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const dong = searchParams.get('dong');
    const search = searchParams.get('search');
    const listingNumber = searchParams.get('listingNumber');
    const minDeposit = searchParams.get('minDeposit');
    const maxDeposit = searchParams.get('maxDeposit');
    const sort = searchParams.get('sort') || 'latest';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // RLS에서 status = '가용' 자동 적용
    let query = supabase
      .from('listings')
      .select('*', { count: 'exact' });

    // 매물번호 검색 (ID 직접 검색)
    if (listingNumber) {
      query = query.eq('id', parseInt(listingNumber));
    }

    // 키워드 검색 (제목, 주소, 동, 설명)
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,address.ilike.%${search}%,dong.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    // 필터
    if (deal) query = query.eq('deal', deal);
    if (type) query = query.eq('type', type);
    if (dong) query = query.eq('dong', dong);
    if (minDeposit) query = query.gte('price', parseInt(minDeposit));
    if (maxDeposit) query = query.lte('price', parseInt(maxDeposit));

    // 정렬
    switch (sort) {
      case 'price_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'area':
        query = query.order('area_m2', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('Listings query error:', error);
      return NextResponse.json(
        { error: '매물 조회 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 동 목록 조회 (필터용)
    const { data: dongs } = await supabase
      .from('listings')
      .select('dong')
      .not('dong', 'is', null);

    const uniqueDongs = [...new Set((dongs || []).map((d: any) => d.dong).filter(Boolean))].sort();

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
      filters: { dongs: uniqueDongs },
    });
  } catch (error) {
    console.error('Listings API error:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
