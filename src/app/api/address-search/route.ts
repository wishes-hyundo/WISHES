import { NextRequest, NextResponse } from 'next/server';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS });
}

/**
 * POST /api/address-search
 * 주소 문자열 → Kakao API → 시군구코드/법정동코드/번/지 반환
 * auto-generate 파이프라인에서 건축물대장 조회 전 사용
 */
// L-sec13 (2026-04-22): 공개 + CORS * 라 attacker 가 긴 query 로
// Kakao REST API 할당량을 고갈시킬 수 있다. query 를 200자로 cap.
const MAX_QUERY_LEN = 200;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawQuery = body.query || body.address || '';
    const query = typeof rawQuery === 'string'
      ? rawQuery.trim().slice(0, MAX_QUERY_LEN)
      : '';

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'query parameter required', data: [] },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!KAKAO_REST_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Kakao API key not configured', data: [] },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const kakaoUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&analyze_type=similar`;
    const kakaoRes = await fetch(kakaoUrl, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });

    if (!kakaoRes.ok) {
      return NextResponse.json(
        { success: false, error: 'Kakao API error: ' + kakaoRes.status, data: [] },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const kakaoData = await kakaoRes.json();
    const documents = kakaoData.documents || [];

    if (documents.length === 0) {
      return NextResponse.json(
        { success: true, data: [], message: 'No results found' },
        { headers: CORS_HEADERS }
      );
    }

    const results = documents.map((doc: any) => {
      const addr = doc.address || {};
      const road = doc.road_address || {};
      const bCode = addr.b_code || '';

      return {
        sigunguCd: bCode.substring(0, 5) || '',
        bjdongCd: bCode.substring(5, 10) || '',
        admCd: bCode || '',
        lnbrMnnm: (addr.main_address_no || '0').padStart(4, '0'),
        lnbrSlno: (addr.sub_address_no || '0').padStart(4, '0'),
        addressName: addr.address_name || doc.address_name || '',
        roadAddress: road.address_name || '',
        zonecode: road.zone_no || '',
        bname: addr.region_3depth_name || '',
        buildingName: road.building_name || '',
      };
    });

    return NextResponse.json(
      { success: true, data: results },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error('[address-search] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error', data: [] },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>주소 검색</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .header {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white; padding: 16px 20px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .header h1 { font-size: 18px; font-weight: 700; }
    .close-btn {
      background: rgba(255,255,255,0.2); border: none; color: white;
      width: 32px; height: 32px; border-radius: 50%; font-size: 18px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .close-btn:hover { background: rgba(255,255,255,0.3); }
    #postcode-container { width: 100%; height: calc(100vh - 60px); }
  </style>
</head>
<body>
  <div class="header">
    <h1>주소 검색</h1>
    <button class="close-btn" onclick="window.close()">&times;</button>
  </div>
  <div id="postcode-container"></div>
  <script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"><\/script>
  <script>
    new daum.Postcode({
      oncomplete: function(data) {
        if (window.opener) {
          window.opener.postMessage({
            type: 'ADDRESS_SELECTED',
            roadAddress: data.roadAddress || '',
            jibunAddress: data.jibunAddress || '',
            bname: data.bname || '',
            buildingName: data.buildingName || '',
            zonecode: data.zonecode || '',
            autoJibunAddress: data.autoJibunAddress || '',
            sigunguCode: data.sigunguCode || '',
            bcode: data.bcode || ''
          }, '*');
        }
        window.close();
      },
      width: '100%',
      height: '100%'
    }).embed(document.getElementById('postcode-container'));
  <\/script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
