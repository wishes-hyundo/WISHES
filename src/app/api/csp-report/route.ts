import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// H2 (2026-04-21): CSP Report-Only 전용 수신 엔드포인트
// 브라우저가 `Content-Security-Policy-Report-Only` 위반을 감지하면
// 이 URL 로 application/csp-report (legacy) 또는 application/reports+json (Reporting API)
// 형식의 JSON 을 POST 한다.
//
// 정책: 운영 중에는 로그만 남기고 본문 저장은 하지 않는다.
//   - 사용자 추적 가능한 정보가 포함될 수 있으므로 프라이버시 보호 위해 IP/UA 저장 X
//   - 개발 단계에서 어떤 URI 에서 어떤 지시어가 위반되었는지만 console.warn 으로 확인
//   - Vercel Functions 로그에서 `CSP-VIOLATION` grep 으로 추적 가능
//
// 1주일 관찰 후 위반이 없으면 middleware.ts 의 차단 CSP 에서도 'unsafe-eval' 제거.
// 위반이 있으면 어떤 스크립트/외부 소스가 eval 을 쓰는지 확인 후 교체 혹은 도메인 허용.

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type LegacyCspReport = {
  'csp-report'?: {
    'document-uri'?: string;
    'violated-directive'?: string;
    'effective-directive'?: string;
    'blocked-uri'?: string;
    'source-file'?: string;
    'line-number'?: number;
    'column-number'?: number;
    disposition?: string;
  };
};

type ReportingApiReport = {
  type?: string;
  url?: string;
  body?: {
    documentURL?: string;
    effectiveDirective?: string;
    blockedURL?: string;
    sourceFile?: string;
    lineNumber?: number;
    columnNumber?: number;
    disposition?: string;
  };
};

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    const raw = (await req.json().catch(() => null)) as
      | LegacyCspReport
      | ReportingApiReport
      | ReportingApiReport[]
      | null;

    if (!raw) {
      return new NextResponse(null, { status: 204 });
    }

    const reports = Array.isArray(raw) ? raw : [raw];

    for (const r of reports) {
      // Legacy 형식 (application/csp-report)
      const legacy = (r as LegacyCspReport)['csp-report'];
      if (legacy) {
        console.warn('[CSP-VIOLATION]', {
          mode: 'legacy',
          directive: legacy['effective-directive'] || legacy['violated-directive'],
          blocked: legacy['blocked-uri'],
          documentUri: legacy['document-uri'],
          sourceFile: legacy['source-file'],
          line: legacy['line-number'],
        });
        continue;
      }

      // Reporting API 형식 (application/reports+json)
      const modern = r as ReportingApiReport;
      if (modern?.body) {
        console.warn('[CSP-VIOLATION]', {
          mode: 'reporting-api',
          directive: modern.body.effectiveDirective,
          blocked: modern.body.blockedURL,
          documentUri: modern.body.documentURL,
          sourceFile: modern.body.sourceFile,
          line: modern.body.lineNumber,
        });
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    // 리포트 파싱 실패는 무시 — 브라우저가 재시도하지 않도록 204 반환
    return new NextResponse(null, { status: 204 });
  }
}

// GET/HEAD 차단 (정보 노출 방지) — 설정 확인용은 프리뷰 환경에서만 허용할 수도 있으나
// 여기서는 단순 405 로 명시.
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
