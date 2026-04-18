import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS });
}

/**
 * 자동 파이프라인: 매물 ID → 건축물대장 조회 → AI SEO 설명 생성 → DB 업데이트
 * POST /api/admin/auto-generate
 * Body: { listingId: number, style?: 'trendy'|'premium'|'clean', aiModel?: 'best'|'latest' }
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
    }

    const body = await req.json();
    const { listingId, style, aiModel, autoMode } = body;

    if (!listingId) {
      return NextResponse.json({ success: false, error: 'listingId required' }, { status: 400, headers: CORS_HEADERS });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const steps: { step: string; status: string; data?: any; error?: string }[] = [];

    // === STEP 1: 매물 정보 조회 ===
    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (listingErr || !listing) {
      return NextResponse.json({ success: false, error: 'Listing not found: ' + (listingErr?.message || '') }, { status: 404, headers: CORS_HEADERS });
    }
    steps.push({ step: 'listing_fetch', status: 'ok', data: { id: listing.id, address: listing.address } });

    // === STEP 1-B: v2.6.6 서버단 자동호출 차단 가드 (AND 조건) ===
    //   autoMode=true (상세보기 오픈 트리거) 요청을
    //   ★ai_description AND seo_tags 둘 다★ 채워진 경우에만 차단.
    //   반만 채워진 매물(구버전 생성분)은 1회 통과시켜 SEO 필드까지 완전 박제한 뒤,
    //   다음 오픈부터 차단한다. → 토큰은 매물당 최대 1회만 추가 소모.
    //   프론트 오버레이 우회 경로(외부 스크립트, admin 직접 호출 등) 방어용 마지막 라인.
    //   수동 버튼(_runAutoGenerate)은 autoMode 플래그 없이 오므로 정상 통과.
    if (autoMode === true) {
      const hasAiDesc =
        typeof listing.ai_description === 'string' &&
        listing.ai_description.trim().length > 0;
      const hasAiTags =
        Array.isArray(listing.seo_tags) && listing.seo_tags.length > 0;
      const hasFullAiSet = hasAiDesc && hasAiTags;
      if (hasFullAiSet) {
        return NextResponse.json({
          success: true,
          listingId,
          pipeline_status: 'skipped',
          blocked_reason: 'db_has_full_ai_set',
          steps: [{ step: 'server_guard', status: 'skipped', error: 'autoMode blocked: full AI set present' }],
          result: {
            title: listing.ai_title || listing.title || '',
            description: listing.ai_description,
            keywords: Array.isArray(listing.seo_keywords) ? listing.seo_keywords : [],
            tags: Array.isArray(listing.seo_tags) ? listing.seo_tags : [],
            meta_description: listing.seo_meta_description || '',
          },
          buildingInfo: listing.building_info || null,
        }, { headers: CORS_HEADERS });
      }
    }

    // === STEP 2: 건축물대장 조회 (주소 기반) ===
    let buildingInfo: any = null;
    try {
      // address-search API로 시군구코드/법정동코드 조회
      const addressParts = (listing.address || '').split(' ');
      const searchQuery = addressParts.slice(0, 3).join(' '); // "서울특별시 XX구 XX동"

      const addrRes = await fetch(SITE_URL + '/api/address-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });

      if (addrRes.ok) {
        const addrData = await addrRes.json();
        const addr = addrData.data?.[0] || addrData.results?.[0];

        if (addr && (addr.sigunguCd || addr.admCd)) {
          const sigunguCd = addr.sigunguCd || (addr.admCd || '').substring(0, 5);
          const bjdongCd = addr.bjdongCd || (addr.admCd || '').substring(5, 10);

          // 건축물대장 API 호출
          const bldRes = await fetch(SITE_URL + '/api/building-ledger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sigunguCd,
              bjdongCd,
              platGbCd: '0',
              bun: addr.lnbrMnnm || '0000',
              ji: addr.lnbrSlno || '0000',
              operations: ['basis', 'title'],
            }),
          });

          if (bldRes.ok) {
            const bldData = await bldRes.json();
            if (bldData.success && bldData.extracted) {
              buildingInfo = bldData.extracted;
              steps.push({ step: 'building_ledger', status: 'ok', data: {
                건물명: buildingInfo.건물명,
                사용승인일: buildingInfo.사용승인일,
                건물구조: buildingInfo.건물구조,
                주용도: buildingInfo.주용도,
                총주차대수: buildingInfo.총주차대수,
              }});
            } else {
              steps.push({ step: 'building_ledger', status: 'partial', error: 'No extracted data' });
            }
          } else {
            steps.push({ step: 'building_ledger', status: 'failed', error: 'API ' + bldRes.status });
          }
        } else {
          steps.push({ step: 'building_ledger', status: 'skipped', error: 'Address code not found' });
        }
      } else {
        steps.push({ step: 'building_ledger', status: 'skipped', error: 'Address search failed' });
      }
    } catch (e: any) {
      steps.push({ step: 'building_ledger', status: 'failed', error: e?.message || String(e) });
    }

    // === STEP 3: AI SEO 설명 생성 ===
    let aiResult: any = null;
    try {
      const genRes = await fetch(SITE_URL + '/api/admin/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: listing.address || '',
          dong: listing.dong || '',
          type: listing.type || '',
          deal: listing.deal || '',
          deposit: listing.deposit || 0,
          monthly: listing.monthly || 0,
          price: listing.price || 0,
          area_m2: listing.area_m2 || listing.area || 0,
          area_supply_m2: listing.area_supply_m2 || 0,
          floor_current: listing.floor_current || listing.floor || '',
          floor_total: listing.floor_total || '',
          direction: listing.direction || '',
          rooms: listing.rooms || 0,
          bathrooms: listing.bathrooms || 0,
          features: listing.features || [],
          parking_available: listing.parking || listing.parking_available || false,
          buildingInfo: buildingInfo || {},
          style: style || 'trendy',
          aiModel: aiModel || 'latest',
        }),
      });

      if (genRes.ok) {
        aiResult = await genRes.json();
        if (aiResult.success) {
          steps.push({ step: 'ai_generate', status: 'ok', data: {
            title: (aiResult.title || '').substring(0, 50) + '...',
            keywords_count: (aiResult.keywords || []).length,
            tags_count: (aiResult.tags || []).length,
            model: aiResult.model,
          }});
        } else {
          steps.push({ step: 'ai_generate', status: 'failed', error: aiResult.error });
        }
      } else {
        steps.push({ step: 'ai_generate', status: 'failed', error: 'API ' + genRes.status });
      }
    } catch (e: any) {
      steps.push({ step: 'ai_generate', status: 'failed', error: e?.message || String(e) });
    }

    // === STEP 4: DB 업데이트 (제목 + 설명 + SEO 메타) ===
    //   v2.6.4 (2026-04-18): /map 슬라이드 패널에 seo_tags/keywords/meta_description 노출되도록
    //   수동 AI 생성 결과를 listings 테이블에 한 번에 박제한다. 한 번 저장되면 상세보기 열 때마다
    //   재생성이 발생하지 않고 토큰도 절약된다 (content-v260-perf.js 오버레이와 한 세트).
    if (aiResult?.success && (aiResult.title || aiResult.description)) {
      const updateData: Record<string, any> = {};
      if (aiResult.title) updateData.title = aiResult.title;
      if (aiResult.description) updateData.ai_description = aiResult.description;
      if (Array.isArray(aiResult.keywords) && aiResult.keywords.length > 0) {
        updateData.seo_keywords = aiResult.keywords;
      }
      if (Array.isArray(aiResult.tags) && aiResult.tags.length > 0) {
        updateData.seo_tags = aiResult.tags;
      }
      if (typeof aiResult.meta_description === 'string' && aiResult.meta_description.trim().length > 0) {
        updateData.seo_meta_description = aiResult.meta_description.trim().slice(0, 160);
      }
      updateData.ai_generated_at = new Date().toISOString();
      updateData.updated_at = new Date().toISOString();

    // building_info (건축물대장 정보) 저장
    if (buildingInfo) {
      updateData.building_info = buildingInfo;

        // === 건축물대장 근거로 필드 자동 세팅 ===
        // 주차: 총주차대수 > 0 이면 가능
        const totalParking = parseInt(buildingInfo['총주차대수'] || '0', 10);
        if (totalParking > 0) updateData.parking = true;

        // 엘리베이터: 승용엘리베이터 > 0 이면 있음
        const elevatorCount = parseInt(buildingInfo['승용엘리베이터'] || '0', 10);
        if (elevatorCount > 0) updateData.elevator = true;

        // 준공년도: 사용승인일에서 년도 추출
        if (buildingInfo['사용승인일']) {
          const ym = String(buildingInfo['사용승인일']).match(/\d{4}/);
          if (ym) updateData.built_year = ym[0];
        }
    }

      const { error: updateErr } = await supabase
        .from('listings')
        .update(updateData)
        .eq('id', listingId);

      if (updateErr) {
        steps.push({ step: 'db_update', status: 'failed', error: updateErr.message });
      } else {
        steps.push({ step: 'db_update', status: 'ok', data: { updated_fields: Object.keys(updateData) } });
      }
    } else {
      steps.push({ step: 'db_update', status: 'skipped', error: 'No AI result to save' });
    }

    // === 결과 반환 ===
    const allOk = steps.every(s => s.status === 'ok');
    return NextResponse.json({
      success: true,
      listingId,
      pipeline_status: allOk ? 'complete' : 'partial',
      steps,
      result: aiResult?.success ? {
        title: aiResult.title || '',
        description: aiResult.description || '',
        keywords: aiResult.keywords || [],
        tags: aiResult.tags || [],
        meta_description: aiResult.meta_description || '',
      } : null,
      buildingInfo: buildingInfo ? {
        건물명: buildingInfo.건물명,
        사용승인일: buildingInfo.사용승인일,
        건물구조: buildingInfo.건물구조,
        주용도: buildingInfo.주용도,
        지상층수: buildingInfo.지상층수,
        총주차대수: buildingInfo.총주차대수,
        승용엘리베이터: buildingInfo.승용엘리베이터,
      } : null,
    }, { headers: CORS_HEADERS });

  } catch (error: any) {
    console.error('[auto-generate] error:', error);
    return NextResponse.json(
      { success: false, error: 'Pipeline error: ' + (error?.message || String(error)) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
