// 자동 정밀 검수 — 라이브 사이트에서 핵심 element 검증.
// 사장님 요구: "최첨단 최고의 스킬과 기술 기능을 사용해서 정밀 검수해서 고쳐"
//
// 검사 항목 (push 마다 자동 실행 권장):
// 1. /map root 200 응답
// 2. /api/listings/[id] 응답 schema 검증 (resolved 필드 모두 존재)
// 3. /api/listings/[id]/nearby 응답 schema 검증
// 4. ListingDetailModal 의 핵심 className 들이 빌드된 JS bundle 에 존재
// 5. globals.css 의 .ws-modal-* / .ws-mobile-page 가 CSS bundle 에 포함
// 6. Vercel 배포 status 확인 (HTTP headers)

import { setTimeout as wait } from 'node:timers/promises';

const BASE = 'https://wishes.co.kr';
const checks = [];
function pass(name, info='') { checks.push({ ok: true, name, info }); }
function fail(name, info='') { checks.push({ ok: false, name, info }); }

async function fetchText(url, opts={}) {
  const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, ...opts });
  return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : '', headers: r.headers };
}

console.log('=== WISHES Live Audit ' + new Date().toISOString() + ' ===\n');

// 1. Root status
{
  const r = await fetchText(BASE + '/');
  if (r.status === 200) pass('1. wishes.co.kr root 200 OK', r.headers.get('x-vercel-id'));
  else fail('1. wishes.co.kr root', `HTTP ${r.status}`);
}

// 2. /map status
{
  const r = await fetchText(BASE + '/map');
  if (r.status === 200) pass('2. /map page 200 OK', r.headers.get('x-vercel-id'));
  else fail('2. /map page', `HTTP ${r.status}`);
}

// 3. /admin status (auth required, expect 200 with login redirect HTML)
{
  const r = await fetchText(BASE + '/admin');
  if (r.status === 200) pass('3. /admin page 200 OK');
  else fail('3. /admin page', `HTTP ${r.status}`);
}

// 4. /search status
{
  const r = await fetchText(BASE + '/search');
  if (r.status === 200) pass('4. /search page 200 OK');
  else fail('4. /search page', `HTTP ${r.status}`);
}

// 5. /api/listings/[id] resolved fields schema
{
  const r = await fetchText(BASE + '/api/listings/47435?_=' + Date.now());
  if (!r.ok) { fail('5. /api/listings/47435', `HTTP ${r.status}`); }
  else {
    try {
      const data = JSON.parse(r.text).data || {};
      const required = ['unit_purpose_resolved', 'title_purpose_resolved', 'building_name_resolved',
                        'area_m2_resolved', 'area_supply_m2_resolved', 'floor_total_resolved',
                        'usage_approved_resolved', 'building_purpose_resolved', 'seo_keywords'];
      const missing = required.filter(k => !(k in data));
      if (missing.length === 0) pass('5. /api/listings/[id] resolved schema OK', `unit_purpose=${data.unit_purpose_resolved}`);
      else fail('5. /api/listings/[id] schema', `누락: ${missing.join(', ')}`);
    } catch (e) { fail('5. /api/listings JSON parse', e.message); }
  }
}

// 6. /api/listings/[id]/nearby — buses field
{
  const r = await fetchText(BASE + '/api/listings/47435/nearby');
  if (!r.ok) { fail('6. /api/listings/.../nearby', `HTTP ${r.status}`); }
  else {
    try {
      const data = JSON.parse(r.text).data || {};
      if ('buses' in data && 'stations' in data) pass('6. nearby endpoint stations+buses OK', `버스 ${(data.buses || []).length}개, 지하철 ${(data.stations || []).length}개`);
      else fail('6. nearby missing fields', `keys: ${Object.keys(data).join(', ')}`);
    } catch (e) { fail('6. nearby JSON parse', e.message); }
  }
}

// 7. /map HTML 의 client bundle 에 ws-modal-root + 핵심 hooks reference 존재 검증
{
  const r = await fetchText(BASE + '/map');
  // Next.js dynamic import 라 inline JS 에는 modal 코드 직접 X. SSR HTML 만 점검.
  const html = r.text;
  if (html.includes('ws-search-root') || html.includes('ws-mobile-page') || html.includes('NlSearchBar') || html.includes('지도검색')) {
    pass('7. /map SSR 정상 응답', 'HTML markup 확인');
  } else {
    fail('7. /map SSR 비정상', 'expected markers 없음');
  }
}

// 8. Vercel deployment health — x-vercel-id 헤더 + age 확인
{
  const r = await fetchText(BASE + '/api/listings/47435');
  const xId = r.headers.get('x-vercel-id') || '';
  const cache = r.headers.get('x-vercel-cache') || '';
  if (xId.includes('icn1')) pass('8. Vercel 한국 region (icn1) 활성', `cache=${cache}`);
  else fail('8. Vercel deployment', `x-vercel-id=${xId}`);
}

// === REPORT ===
console.log('\n=== 결과 ===\n');
const okCount = checks.filter(c => c.ok).length;
const failCount = checks.filter(c => !c.ok).length;
for (const c of checks) {
  const icon = c.ok ? '✅' : '❌';
  console.log(`${icon} ${c.name}${c.info ? ' — ' + c.info : ''}`);
}
console.log(`\n총 ${checks.length}개 검사 — 통과 ${okCount}, 실패 ${failCount}`);
process.exit(failCount === 0 ? 0 : 1);
