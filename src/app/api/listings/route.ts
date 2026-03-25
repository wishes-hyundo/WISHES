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

    let query = supabase
      .from('listings')
      .select('*, listing_images(id, image_url, display_order), listing_features(feature)', { count: 'exact' })
      .in('status', ['가용', '계약중']);

    // Listing number search (exact or partial match)
    if (listingNumber) {
      query = query.eq('id', parseInt(listingNumber));
    }

    // Keyword search (title, address, dong, description)
    if (search) {
      query = query.or(`title.ilike.%${search}%,address.ilike.%${search}%,dong.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Filters
    if (deal) query = query.eq('deal', deal);
    if (type) query = query.eq('type', type);
    if (dong) query = query.eq('dong', dong);
    if (minDeposit) query = query.gte('price', parseInt(minDeposit));
    if (maxDeposit) query = query.lte('price', parseInt(maxDeposit));

    // Sorting
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
      return NextResponse.json({ error: '매물 조회 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // Get unique dongs for filter options
    const { data: dongs } = await supabase
      .from('listings')
      .select('dong')
      .in('status', ['가용', '계약중'])
      .not('dong', 'is', null);

    const uniqueDongs = [...new Set((dongs || []).map(d => d.dong).filter(Boolean))].sort();

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
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
