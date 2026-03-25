// ââââââââââââââââââââââââââââââââââââââââ
// GET /api/listings - ë§¤ë¬¼ ëª©ë¡ ì¡°í
// ââââââââââââââââââââââââââââââââââââââââ

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

/**
 * ë§¤ë¬¼ ëª©ë¡ ì¡°í
 * @query deal - ê±°ë ì í (ì ì¸/ìì¸/ë§¤ë§¤)
 * @query type - ë§¤ë¬¼ ì í (ìë£¸/í¬ë£¸/ì°ë¦¬ë£¸/ì¤í¼ì¤í/ìíí¸/ìê°/ì¬ë¬´ì¤)
 * @query dong - ë ì´ë¦
 * @query minDeposit - ìµì ë³´ì¦ê¸ (ë§ì)
 * @query maxDeposit - ìµë ë³´ì¦ê¸ (ë§ì)
 * @query limit - íì´ì§ë¹ ê²°ê³¼ ì (ê¸°ë³¸ê°: 20)
 * @query offset - ì¤íì (ê¸°ë³¸ê°: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const dong = searchParams.get('dong');
    const minDeposit = searchParams.get('minDeposit');
    const maxDeposit = searchParams.get('maxDeposit');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    
    // 비교 매물 조회 (ids 파라미터)
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids.split(',').map(Number).filter(Boolean);
      const supabaseIds = createClient();
      const { data: compareData, error: compareError } = await supabaseIds
        .from('listings')
        .select('*')
        .in('id', idList);
      
      if (compareError) {
        return NextResponse.json({ success: false, error: '매물 조회 실패' }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: compareData || [] });
    }

    const supabase = createClient();

    // ê¸°ë³¸ ì¿¼ë¦¬ (status = 'ê°ì©'ì RLSìì ìë ì ì©)
    let query = supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false });

    // íí° ì¡°ê±´ ì ì©
    if (deal) {
      query = query.eq('deal', deal);
    }
    if (type) {
      query = query.eq('type', type);
    }
    if (dong) {
      query = query.eq('dong', dong);
    }
    if (minDeposit) {
      query = query.gte('deposit', parseInt(minDeposit));
    }
    if (maxDeposit) {
      query = query.lte('deposit', parseInt(maxDeposit));
    }

    // íì´ì§ë¤ì´ì
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase ì¿¼ë¦¬ ì¤ë¥:', error);
      return NextResponse.json(
        { success: false, error: 'ë§¤ë¬¼ ì¡°íì ì¤í¨íìµëë¤' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
    });
  } catch (error) {
    console.error('ë§¤ë¬¼ ì¡°í ì¤ë¥:', error);
    return NextResponse.json(
      { success: false, error: 'ë§¤ë¬¼ ì¡°íì ì¤í¨íìµëë¤' },
      { status: 500 }
    );
  }
}
