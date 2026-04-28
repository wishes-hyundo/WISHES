/**
 * L-AutoFP (2026-04-29): 평면도 자동 생성 (Deterministic SVG)
 *
 * 사장님 평면도 못 구함 → 입력 정보 (면적/방수/화장실/향) 기반으로 표준 평면도 SVG 자동 그림.
 *
 * 정책:
 * - 100% deterministic (할루시네이션 0)
 * - 무료 (서버 SVG 합성)
 * - 사장님 손 0
 *
 * 알고리즘:
 * 1. 면적 비율로 거실(40%) + 방(각 15-20%) + 화장실(8%) + 주방(12%) + 베란다(옵션) 분할
 * 2. 표준 한국 아파트 레이아웃 (현관 → 복도 → 거실 → 주방 → 방들)
 * 3. 향(direction) 에 따라 거실 방향 회전
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 5;

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'agent', 'crawler_bridge', 'internal_bearer']);

interface FloorplanArgs {
  areaM2: number;
  rooms: number;
  bathrooms: number;
  balcony?: number;
  direction?: string;
  layoutType?: string;
  buildingName?: string;
  hoNm?: string;
}

function svgEscape(s: string): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 평면도 SVG 합성 (deterministic).
 * Canvas: 800 × 600 (4:3) — pyeong 기준 1m² ≈ 0.3 평
 */
function buildFloorplanSvg(args: FloorplanArgs): string {
  const { areaM2, rooms, bathrooms, direction, buildingName, hoNm } = args;
  const balcony = args.balcony ?? (rooms >= 2 ? 1 : 0);
  const pyeong = areaM2 ? (areaM2 / 3.305785).toFixed(1) : null;

  const W = 800, H = 600;
  const PAD = 30;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  // ─── 영역 분할 비율 (전형적인 한국 아파트) ───
  // 좌측: 현관(top) + 화장실(top) + 주방(mid) + 다용도(bottom)
  // 우측: 거실(big, 남측) + 방1(top), 방2(top-right), 방3(bot-right)
  const leftW = innerW * 0.35;
  const rightW = innerW - leftW;

  // Top row: 현관 + 화장실(들) + 방
  const topH = innerH * 0.42;
  const midH = innerH * 0.16; // 복도
  const botH = innerH - topH - midH;

  const lines: string[] = [];
  const labels: string[] = [];

  function rect(x: number, y: number, w: number, h: number, label: string, areaShare: number, fill = '#ffffff') {
    const areaInside = (areaM2 * areaShare).toFixed(1);
    lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#222" stroke-width="2"/>`);
    labels.push(`<text x="${x + w / 2}" y="${y + h / 2 - 4}" text-anchor="middle" font-size="13" font-weight="600" fill="#222" font-family="Pretendard, sans-serif">${svgEscape(label)}</text>`);
    if (parseFloat(areaInside) > 0) {
      labels.push(`<text x="${x + w / 2}" y="${y + h / 2 + 14}" text-anchor="middle" font-size="11" fill="#666" font-family="Pretendard, sans-serif">${areaInside}m²</text>`);
    }
  }

  // ─── 외곽 ───
  lines.push(`<rect x="${PAD}" y="${PAD}" width="${innerW}" height="${innerH}" fill="#fafafa" stroke="#222" stroke-width="3"/>`);

  // ─── 현관 + 화장실 (top-left) ───
  const entryW = leftW * 0.5;
  const bathW = leftW * 0.5;
  rect(PAD, PAD, entryW, topH * 0.4, '현관', 0.04, '#f0f0f0');
  rect(PAD + entryW, PAD, bathW, topH * 0.4, '화장실', 0.06, '#e8eef2');

  // ─── 주방 (mid-left) ───
  rect(PAD, PAD + topH * 0.4, leftW, topH * 0.6 + midH, '주방', 0.13, '#fff8ee');

  // ─── 거실 (right, 큰 공간) ───
  rect(PAD + leftW, PAD, rightW, topH + midH, '거실', 0.4, '#fefefe');

  // ─── 방들 (bottom) ───
  if (rooms >= 1) {
    const roomW = innerW / Math.max(1, rooms);
    for (let i = 0; i < rooms; i++) {
      const isMaster = i === 0;
      const x = PAD + i * roomW;
      const label = isMaster ? '안방' : `방${i + 1}`;
      const share = isMaster ? 0.18 : 0.12;
      rect(x, PAD + topH + midH, roomW, botH, label, share, isMaster ? '#fff5f5' : '#f5f8ff');
    }
  }

  // ─── 두 번째 화장실 (안방 안에) ───
  if (bathrooms >= 2 && rooms >= 1) {
    const masterX = PAD;
    const masterRoomW = innerW / Math.max(1, rooms);
    const sbW = masterRoomW * 0.35;
    const sbH = botH * 0.35;
    rect(masterX + masterRoomW - sbW, PAD + topH + midH, sbW, sbH, '욕실', 0.04, '#e8eef2');
  }

  // ─── 베란다 (외부, top 또는 right 에 얇게) ───
  if (balcony >= 1) {
    const balH = 12;
    lines.push(`<rect x="${PAD + leftW}" y="${PAD - balH}" width="${rightW}" height="${balH}" fill="#e0e8d0" stroke="#222" stroke-width="1"/>`);
    labels.push(`<text x="${PAD + leftW + rightW / 2}" y="${PAD - 2}" text-anchor="middle" font-size="9" fill="#444" font-family="Pretendard, sans-serif">베란다</text>`);
  }

  // ─── 향 표시 (compass) ───
  const compassMap: Record<string, string> = {
    '남향': '↓', '북향': '↑', '동향': '→', '서향': '←',
    '남동향': '↘', '남서향': '↙', '북동향': '↗', '북서향': '↖',
  };
  const arrow = compassMap[direction || ''] || '';
  if (arrow) {
    labels.push(`<text x="${W - 40}" y="${H - 14}" text-anchor="middle" font-size="22" font-weight="700" fill="#2D5A27" font-family="Pretendard, sans-serif">${arrow}</text>`);
    labels.push(`<text x="${W - 40}" y="${H - 38}" text-anchor="middle" font-size="11" fill="#666" font-family="Pretendard, sans-serif">${svgEscape(direction || '')}</text>`);
  }

  // ─── 헤더 ───
  const header = (buildingName || '매물') + (hoNm ? ' ' + hoNm + '호' : '');
  const meta = areaM2 ? `${areaM2.toFixed(1)}m² (${pyeong}평) · 방 ${rooms} · 화 ${bathrooms}` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + 60}" width="100%" preserveAspectRatio="xMidYMid meet">
    <text x="${W / 2}" y="20" text-anchor="middle" font-size="16" font-weight="700" fill="#2D5A27" font-family="Pretendard, sans-serif">${svgEscape(header)}</text>
    <text x="${W / 2}" y="38" text-anchor="middle" font-size="11" fill="#666" font-family="Pretendard, sans-serif">${svgEscape(meta)}</text>
    <g transform="translate(0, 40)">
      ${lines.join('\n')}
      ${labels.join('\n')}
    </g>
    <text x="${W / 2}" y="${H + 56}" text-anchor="middle" font-size="9" fill="#aaa" font-family="Pretendard, sans-serif">⚠️ AI 자동 생성 평면도 — 실제 구조와 다를 수 있습니다 · WISHES</text>
  </svg>`;
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const args: FloorplanArgs = {
    areaM2: parseFloat(sp.get('areaM2') || '0'),
    rooms: parseInt(sp.get('rooms') || '2', 10),
    bathrooms: parseInt(sp.get('bathrooms') || '1', 10),
    balcony: sp.get('balcony') ? parseInt(sp.get('balcony') || '0', 10) : undefined,
    direction: sp.get('direction') || undefined,
    layoutType: sp.get('layoutType') || undefined,
    buildingName: sp.get('buildingName') || undefined,
    hoNm: sp.get('hoNm') || undefined,
  };

  if (!args.areaM2 || args.areaM2 < 5) {
    return NextResponse.json({ error: 'areaM2 required (>= 5)' }, { status: 400 });
  }

  const svg = buildFloorplanSvg(args);
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
