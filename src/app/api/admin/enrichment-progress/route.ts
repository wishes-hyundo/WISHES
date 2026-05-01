/**
 * GET /api/admin/enrichment-progress — PR-R-Monitor
 * 자동 보강 진행 dashboard (admin 만).
 *   - 건축물대장 (data.go.kr / V-World)
 *   - 공시지가 (V-World)
 *   - 개별주택가격 (V-World)
 *   - 학세권 (Kakao Local 4종)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ok = await verifyAdminAuth(request);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createServerClient();

  // 전체 공개 매물
  const { count: totalPublic } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .eq('status', '공개');

  // 건축물대장
  const { count: bldgFilled } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .eq('status', '공개').not('building_register_fetched_at', 'is', null);

  const { count: bldgViolations } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .eq('is_violation_building', true);

  // 공시지가
  const { count: landFilled } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .eq('status', '공개').not('land_price_per_m2', 'is', null);

  // 주택가격
  const { count: houseFilled } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .eq('status', '공개').not('house_price_total', 'is', null);

  // 학세권
  const { count: schoolFilled } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .eq('status', '공개').not('nearest_school_distance_m', 'is', null);

  const { count: subwayFilled } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .eq('status', '공개').not('nearest_subway_distance_m', 'is', null);

  const total = totalPublic ?? 0;
  const ratio = (n: number | null | undefined) =>
    total > 0 ? Math.round(((n ?? 0) / total) * 1000) / 10 : 0;

  return NextResponse.json({
    success: true,
    total_public: total,
    enrichments: {
      building_register: {
        filled: bldgFilled ?? 0,
        ratio: ratio(bldgFilled),
        violations: bldgViolations ?? 0,
        source: 'data.go.kr / V-World',
        cron: '매 2시간 50건',
      },
      land_price: {
        filled: landFilled ?? 0,
        ratio: ratio(landFilled),
        source: 'V-World',
        cron: '매일 04:00 100건',
      },
      house_price: {
        filled: houseFilled ?? 0,
        ratio: ratio(houseFilled),
        source: 'V-World',
        cron: '매일 04:30 100건',
      },
      school: {
        filled: schoolFilled ?? 0,
        ratio: ratio(schoolFilled),
        source: 'Kakao Local',
        cron: 'PR-C-school',
      },
      subway: {
        filled: subwayFilled ?? 0,
        ratio: ratio(subwayFilled),
        source: 'Kakao Local',
        cron: 'PR-C-subway',
      },
    },
  });
}
