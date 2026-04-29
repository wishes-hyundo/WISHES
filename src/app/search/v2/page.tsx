'use client';
// /search/v2 대시보드 — BoB Phase 1 placeholder
// Phase 2 에서 실제 통계/차트 추가

import Link from 'next/link';
import { Building2, Phone, Sparkles, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function SearchV2Dashboard() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-foreground">중개사 포털</h1>
          <Badge variant="success">v2 BoB</Badge>
        </div>
        <p className="text-muted-foreground">Next.js 16 + shadcn/ui + TanStack Table 기반 차세대 포털</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/search/v2/listings"
          className="group rounded-xl border bg-card p-6 hover:shadow-lg hover:border-primary/40 transition"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-foreground">매물 관리</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            12,000+ 매물 — 가상 스크롤 + 정렬/필터/일괄 작업
          </p>
          <div className="flex items-center text-sm text-primary group-hover:gap-2 transition-all">
            <span>이동</span>
            <ArrowRight className="w-4 h-4 ml-1 group-hover:ml-2 transition-all" />
          </div>
        </Link>

        <div className="rounded-xl border bg-card p-6 opacity-60">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-foreground">v2 AI 매물 설명</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            RAG + 7개 페르소나, 환각 0
          </p>
          <Badge variant="warning">매물 페이지에서 사용</Badge>
        </div>

        <Link
          href="/search/v2/contacts"
          className="group rounded-xl border bg-card p-6 hover:shadow-lg hover:border-primary/40 transition"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-foreground">상담 관리</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            손님 문의 + 예약 일정
          </p>
          <Badge variant="outline">Phase 2</Badge>
        </Link>
      </div>

      <div className="mt-10 rounded-xl border bg-amber-50 border-amber-200 p-5">
        <h3 className="font-semibold text-amber-900 mb-2">⚠️ Phase 1 진행 중</h3>
        <p className="text-sm text-amber-800 leading-relaxed">
          이 v2 포털은 옛날 /search content.js 와 병행 운영됩니다 (Strangler Fig 패턴).
          기능 100% 통합 완료 후 옛날 가게는 안전하게 제거됩니다.
        </p>
        <p className="text-xs text-amber-700 mt-2">
          현재: 매물 목록 (Phase 1) → 다음: 매물 등록 + 검수 (Phase 2~3)
        </p>
      </div>
    </div>
  );
}
