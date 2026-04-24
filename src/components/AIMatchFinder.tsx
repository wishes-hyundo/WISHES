'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AIMatchFinder (T5-1) — 자연어로 매물 추천
//   "강남구 원룸 보증금 5000 이하" → 결과 카드 노출
//   - /api/ai/match 호출 (결정적 파서 기반, 비용 0)
//   - 인식된 필터 pill 로 시각화
//   - "전체 보기 →" 버튼: /listings 로 동일 조건 이월
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, Send, Loader2, ArrowRight, X } from 'lucide-react';
import { ListingCard } from '@/components/ListingCard';
import type { ParsedMatchFilter } from '@/lib/ai-match-parser';

const EXAMPLES = [
  '관악구 원룸 월세 50만원 이하',
  '강남구 투룸 보증금 1억 이하',
  '분당 오피스텔 주차 가능',
  '홍대 근처 상가 카페',
];

type ApiResponse = {
  success: boolean;
  query?: string;
  filters?: ParsedMatchFilter;
  listings?: any[];
  count?: number;
  goToListings?: string;
  error?: string;
};

export default function AIMatchFinder({
  variant = 'full',
}: {
  variant?: 'full' | 'compact';
}) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const submit = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || isLoading) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      setResult({ success: false, error: e?.message || '네트워크 오류' });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(query);
    }
  };

  const onExample = (ex: string) => {
    setQuery(ex);
    submit(ex);
  };

  const reset = () => {
    setQuery('');
    setResult(null);
  };

  const pills = result?.filters ? buildFilterPills(result.filters) : [];

  return (
    <section className="bg-gradient-to-br from-wishes-primary/[0.06] via-white to-wishes-secondary/[0.05] rounded-2xl border border-wishes-primary/15 p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-wishes-primary to-wishes-secondary text-white text-[11px] font-bold shadow-sm">
          <Sparkles className="w-3.5 h-3.5" /> AI 매칭
        </span>
        <h3 className="text-sm sm:text-base font-bold text-gray-800">
          원하시는 매물을 한 줄로 알려주세요
        </h3>
      </div>
      <p className="text-xs sm:text-[13px] text-gray-500 mb-4 leading-relaxed">
        지역 · 매물 유형 · 가격 · 면적 · 편의시설을 자연스럽게 입력하시면 조건에 맞는 매물을 바로 보여드려요.
      </p>

      {/* 입력 */}
      <div className="flex items-center gap-2 bg-white border-2 border-gray-200 focus-within:border-wishes-primary rounded-xl px-3 py-2 transition-colors shadow-sm">
        <Sparkles className="w-4 h-4 text-wishes-primary/70 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="예: 강남구 원룸 보증금 5000 이하 주차 가능"
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
          disabled={isLoading}
        />
        {query && !isLoading && (
          <button
            onClick={reset}
            className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="입력 지우기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => submit(query)}
          disabled={!query.trim() || isLoading}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-wishes-primary text-white text-xs font-bold disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-wishes-primary/90 transition-colors"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {isLoading ? '분석 중' : '검색'}
        </button>
      </div>

      {/* 예시 질의 */}
      {!result && !isLoading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => onExample(ex)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-wishes-primary/50 hover:text-wishes-primary transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* 결과 */}
      {result && result.success && (
        <div className="mt-4 space-y-4">
          {/* 인식된 필터 */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-[11px] text-gray-500 font-semibold pt-1">인식된 조건:</span>
            {pills.length > 0 ? (
              pills.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-wishes-primary/10 text-wishes-primary text-[11px] font-semibold"
                >
                  {p}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-400 italic">조건을 명확히 인식하지 못했어요</span>
            )}
          </div>

          {/* 매물 카드 */}
          {result.listings && result.listings.length > 0 ? (
            <>
              <div className={`grid gap-3 ${variant === 'compact' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                {result.listings.slice(0, variant === 'compact' ? 3 : 6).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} compact />
                ))}
              </div>

              {result.goToListings && (
                <Link
                  href={result.goToListings}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-wishes-primary hover:underline"
                >
                  이 조건으로 {result.count ?? 0}건 전체 보기
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-600 mb-1">조건에 맞는 매물을 찾지 못했어요</p>
              <p className="text-xs text-gray-400">
                조건을 조금 넓혀 보시거나{' '}
                <Link href="/contact" className="text-wishes-primary font-semibold hover:underline">
                  상담 문의
                </Link>
                로 직접 문의 남겨주세요
              </p>
            </div>
          )}
        </div>
      )}

      {result && !result.success && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          {result.error || '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.'}
        </div>
      )}
    </section>
  );
}

// 필터 → 한눈에 보이는 pill 배열
function buildFilterPills(f: ParsedMatchFilter): string[] {
  const pills: string[] = [];
  if (f.dong) pills.push(f.dong);
  if (f.type) pills.push(f.type);
  if (f.deal) pills.push(f.deal);
  if (f.maxDeposit) pills.push(`보증금 ${f.maxDeposit.toLocaleString()}만원 이하`);
  if (f.minDeposit) pills.push(`보증금 ${f.minDeposit.toLocaleString()}만원 이상`);
  if (f.maxMonthly) pills.push(`월세 ${f.maxMonthly}만원 이하`);
  if (f.minArea) pills.push(`${f.minArea}m² 이상`);
  if (f.maxArea) pills.push(`${f.maxArea}m² 이하`);
  if (f.rooms) pills.push(`${f.rooms}룸+`);
  if (f.parking) pills.push('주차');
  if (f.elevator) pills.push('엘리베이터');
  if (f.pet) pills.push('반려동물');
  if (f.businessType) pills.push(f.businessType);
  return pills;
}
