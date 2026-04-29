/**
 * /api/admin/briefing-pdf/[id] — 2026 SOTA Vercel 패턴
 * @sparticuz/chromium-min (외부 chromium 다운로드, 함수 사이즈 ~3MB)
 * + puppeteer-core 23.10.4
 *
 * 첫 호출 cold start 5-10초 (chromium 다운로드), 이후 빠름.
 * Vercel Pro: maxDuration 60s + memory 1024MB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// chromium-min 외부 URL (Sparticuz GitHub releases)
const CHROMIUM_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let browser: { close: () => Promise<void> } | null = null;
  try {
    // 동적 import — Edge runtime 회피
    const chromiumMod = await import('@sparticuz/chromium-min');
    const chromium = (chromiumMod as { default?: typeof chromiumMod }).default ?? chromiumMod;
    const puppeteer = await import('puppeteer-core');

    const launched = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_URL),
      headless: true,
    });
    browser = launched as { close: () => Promise<void> };

    const page = await launched.newPage();
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';
    const url = `${baseUrl}/admin/briefing/${id}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });

    await launched.close();
    browser = null;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="wishes-briefing-${id}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    if (browser) {
      try { await browser.close(); } catch { /* noop */ }
    }
    const msg = e instanceof Error ? e.message : 'PDF 생성 실패';
    console.error('[briefing-pdf]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
