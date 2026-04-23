// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 일회성 정리: raw_fields 의 노이즈 라벨 일괄 제거
// 사용법: GET /api/admin/clean-raw-fields (Authorization: Bearer <WISHES_ADMIN_MASTER_PASSWORD env> 또는 Supabase JWT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { invalidateCache } from '@/lib/cache';
// L-sec155 (2026-04-23): listings.raw_fields 전수 UPDATE 엔드포인트.
//   verifyAdminAuth 는 role=agent JWT 통과 → 중개사 계정도 전체 매물 raw_fields
//   덮어쓰기 가능했음. superadmin/master/crawler_bridge 만 허용.
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'crawler_bridge', 'internal_bearer']);

const JUNK_RE: RegExp[] = [
  /^인쇄$/, /^확대보기$/, /^연락처보기$/, /^네이버전송/, /^정보요청$/,
  /^공유$/, /^다운로드$/, /^이전$/, /^다음$/, /^더보기$/, /^닫기$/,
  /^보유:?\s*\d+/, /^즐겨찾기$/, /^찜하기$/, /^신고$/, /^목록$/,
  /보기$/, /전송$/, /요청$/, /^\(즉시입주\)/,
];
const VALUE_RE: RegExp[] = [
  /^(가능|불가|있음|없음|예|아니오|무|유|모름)$/,
  /^[가-힣]{2,4}\s*(불가|가능|미정|미입력|미확인)$/,
  /^(일반|단기|장기)?(임대|매매|전세|월세)$/,
  /^(전층|일부|단독|공용)\s*(사용|점유)?$/,
];
function isJunk(k: string, v: any): boolean {
  if (JUNK_RE.some(r => r.test(k))) return true;
  if (VALUE_RE.some(r => r.test(k))) return true;
  if (typeof v === 'string' && v.trim() === k) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('listings')
    .select('id, raw_fields')
    .not('raw_fields', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updates: { id: number; before: number; after: number; removed: string[] }[] = [];

  for (const r of rows || []) {
    const raw = r.raw_fields as Record<string, any>;
    if (!raw || typeof raw !== 'object') continue;
    const beforeCount = Object.keys(raw).length;
    const removed: string[] = [];
    const cleaned: Record<string, any> = {};
    for (const k of Object.keys(raw)) {
      if (k.startsWith('__')) { cleaned[k] = raw[k]; continue; }
      if (isJunk(k, raw[k])) { removed.push(k); continue; }
      cleaned[k] = raw[k];
    }
    if (removed.length > 0) {
      const { error: upErr } = await supabase
        .from('listings')
        .update({ raw_fields: cleaned })
        .eq('id', r.id);
      if