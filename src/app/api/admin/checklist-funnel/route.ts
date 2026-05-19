import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthWithContext } from '@/lib/adminAuth';

/**
 * R103 (2026-05-19) — admin: checklist 이탈률 통계
 * 사장님이 admin token 으로 funnel 통계 조회.
 * GET /api/admin/checklist-funnel?days=7
 *
 * 응답: {success:true, days, funnel:{visit, step1_done, step2_done, step3_done, sent}, dropoff_pct}
 */

export async function GET(request: NextRequest) {
  try {
    const _auth = await verifyAdminAuthWithContext(request);
    if (!_auth.ok) {
      return NextResponse.json({ success: false, message: _auth.message || 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1), 30);

    const sb = createServerClient();
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await sb
      .from('checklist_funnel_events')
      .select('event, session_id, deal, created_at')
      .gte('created_at', sinceIso);
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const rows = data || [];

    // Unique session 별 가장 progressed 이벤트 계산
    const sessionStage = new Map<string, number>();
    const stageOrder: Record<string, number> = {
      visit: 1, step1_done: 2, step2_done: 3, step3_done: 4, sent: 5
    };
    for (const r of rows) {
      const stage = stageOrder[r.event as string] ?? 0;
      if (!stage) continue;
      const cur = sessionStage.get(r.session_id) ?? 0;
      if (stage > cur) sessionStage.set(r.session_id, stage);
    }

    // Count sessions at each stage
    const counts = { visit: 0, step1_done: 0, step2_done: 0, step3_done: 0, sent: 0 };
    for (const stage of sessionStage.values()) {
      if (stage >= 1) counts.visit++;
      if (stage >= 2) counts.step1_done++;
      if (stage >= 3) counts.step2_done++;
      if (stage >= 4) counts.step3_done++;
      if (stage >= 5) counts.sent++;
    }

    const dropoff = {
      visit_to_step1: counts.visit ? Math.round((1 - counts.step1_done / counts.visit) * 1000) / 10 : 0,
      step1_to_step2: counts.step1_done ? Math.round((1 - counts.step2_done / counts.step1_done) * 1000) / 10 : 0,
      step2_to_step3: counts.step2_done ? Math.round((1 - counts.step3_done / counts.step2_done) * 1000) / 10 : 0,
      step3_to_sent:  counts.step3_done ? Math.round((1 - counts.sent / counts.step3_done) * 1000) / 10 : 0,
      total: counts.visit ? Math.round((1 - counts.sent / counts.visit) * 1000) / 10 : 0,
    };

    const conversion = counts.visit ? Math.round((counts.sent / counts.visit) * 1000) / 10 : 0;

    return NextResponse.json({
      success: true,
      days,
      total_sessions: counts.visit,
      funnel: counts,
      dropoff_pct: dropoff,
      conversion_pct: conversion,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
