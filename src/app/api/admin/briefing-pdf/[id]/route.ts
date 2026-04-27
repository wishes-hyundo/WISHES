/**
 * /api/admin/briefing-pdf/[id]
 * Puppeteer + @sparticuz/chromium 으로 매물 브리핑 PDF 자동 생성
 * /admin/briefing/[id] 페이지를 PDF 변환 → 다운로드
 * 무료 (Vercel Pro maxDuration 60 + 함수 크기 250MB 한도 내)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    // Edge runtime 호환 안 됨 — nodejs 에서만 동적 import
    const chromium = (await import('@sparticuz/chromium')).default as any;
    const puppeteer = await import('puppeteer-core');

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr'}/admin/briefing/${id}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });

    await browser.close();

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="wishes-briefing-${id}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: any) {
    console.error('[briefing-pdf]', e);
    return NextResponse.json({ error: e?.message || 'PDF 생성 실패' }, { status: 500 });
  }
}
