// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 매물 주소 → 좌표 변환 스크립트
// 카카오 Geocoding API를 사용하여 매물의 lat/lng를 채워줍니다
// 실행: npx tsx scripts/geocode-listings.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Database from 'better-sqlite3';
import 'dotenv/config';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

if (!KAKAO_REST_API_KEY) {
  console.error('❌ KAKAO_REST_API_KEY 환경변수를 설정해주세요 (.env.local)');
  process.exit(1);
}

const sqlite = new Database('./data/wishes.db');

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    const data = await res.json();

    if (!data.documents || data.documents.length === 0) {
      // 주소 검색 실패 시 키워드 검색 시도
      const res2 = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
      );
      const data2 = await res2.json();

      if (!data2.documents || data2.documents.length === 0) return null;
      return {
        lat: parseFloat(data2.documents[0].y),
        lng: parseFloat(data2.documents[0].x),
      };
    }

    return {
      lat: parseFloat(data.documents[0].y),
      lng: parseFloat(data.documents[0].x),
    };
  } catch (error) {
    console.error(`  ⚠️  Geocoding 실패: ${address}`, error);
    return null;
  }
}

async function main() {
  // lat/lng가 없는 매물 조회
  const rows = sqlite.prepare(
    'SELECT id, address FROM listings WHERE lat IS NULL OR lng IS NULL'
  ).all() as { id: number; address: string }[];

  console.log(`📍 좌표 변환 대상: ${rows.length}건`);

  let success = 0;
  let fail = 0;

  for (const row of rows) {
    const coords = await geocodeAddress(row.address);

    if (coords) {
      sqlite.prepare('UPDATE listings SET lat = ?, lng = ? WHERE id = ?').run(
        coords.lat, coords.lng, row.id
      );
      console.log(`  ✅ [${row.id}] ${row.address} → ${coords.lat}, ${coords.lng}`);
      success++;
    } else {
      console.log(`  ❌ [${row.id}] ${row.address} → 좌표 변환 실패`);
      fail++;
    }

    // API 호출 간격 (초당 10건 제한)
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  console.log(`\n📊 결과: 성공 ${success}건, 실패 ${fail}건`);
  sqlite.close();
}

main();
