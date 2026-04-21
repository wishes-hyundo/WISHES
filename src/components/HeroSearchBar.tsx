'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Building2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 히어로 통합 검색바
// 거래유형 탭 + 매물유형 + 지역 입력 → /listings 로 이동
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEAL_TABS = [
  { id: '', label: '전체' },
  { id: '전세', label: '전세' },
  { id: '월세', label: '월세' },
  { id: '매매', label: '매매' },
];

const TYPE_OPTIONS = [
  { id: '', label: '전체' },
  { id: '원룸', label: '원룸' },
  { id: '투룸', label: '투룸' },
  { id: '쓰리룸', label: '쓰리룸' },
  { id: '오피스텔', label: '오피스텔' },
  { id: '아파트', label: '아파트' },
  { id: '사무실/상가', label: '사무실/상가' },
];

interface HeroSearchBarProps {
  availableDongs?: string[]; // 등록된 동 목록 (자동완성)
}

export default function HeroSearchBar({ availableDongs = [] }: HeroSearchBarProps) {
  const router = useRouter();
  const [deal, setDeal] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    if (!q || !focused) return [];
    const lower = q.toLowerCase();
    return availableDongs
      .filter(d => d && d.toLowerCase().includes(lower))
      .slice(0, 6);
  }, [q, focused, availableDongs]);

  const handleSearch = (dongOverride?: string) => {
    const params = new URLSearchParams();
    if (deal) params.set('deal', deal);
    if (type) params.set('type', type);
    const finalQ = dongOverride ?? q.trim();
    if (finalQ) params.set('dong', finalQ);
    router.push(`/listings${params.toString() ? '?' + params.toString() : ''}`);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* 거래유형 탭 */}
      <div className="flex justify-center gap-2 mb-3">
        {DEAL_TABS.map(tab => (
          <button
            key={tab.id || 'all'}
            onClick={() => setDeal(tab.id)}
            className={cn(
              'px-5 py-2 rounded-full text-sm font-semibold transition-all backdrop-blur-sm border',
              deal === tab.id
                ? 'bg-wishes-accent text-wishes-primary border-wishes-accent shadow-lg scale-105'
                : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 검색 입력 영역 */}
      <div className="bg-white rounded-2xl shadow-2xl p-2 flex flex-col sm:flex-row items-stretch gap-2">
        {/* 매물유형 selector */}
        <div className="relative sm:w-40">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wishes-muted pointer-events-none" />
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="w-full h-12 pl-9 pr-3 text-sm font-medium text-wishes-text bg-wishes-bg rounded-xl border-0 focus:ring-2 focus:ring-wishes-secondary appearance-none cursor-pointer"
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.id || 'all'} value={o.id}>{o.label === '전체' ? '매물유형' : o.label}</option>
            ))}
          </select>
        </div>

        {/* 지역 검색 */}
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wishes-muted pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="동/구 이름을 입력하세요 (예: 역삼동, 강남구)"
            className="w-full h-12 pl-9 pr-3 text-sm bg-wishes-bg rounded-xl border-0 focus:ring-2 focus:ring-wishes-secondary placeholder:text-wishes-muted/70"
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-30 max-h-60 overflow-y-auto">
              {suggestions.map(d => (
                <button
                  key={d}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setQ(d); handleSearch(d); }}
                  className="w-full text-left px-4 py-2 text-sm text-wishes-text hover:bg-wishes-bg flex items-center gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-wishes-secondary/60" />
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 검색 버튼 */}
        <button
          onClick={() => handleSearch()}
          className="h-12 px-6 bg-wishes-secondary hover:bg-wishes-primary text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <Search className="w-4 h-4" />
          매물 검색
        </button>
      </div>

      {/* 빠른 태그 */}
      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        <span className="text-xs text-white/60 flex items-center gap-1">
          <Tag className="w-3 h-3" /> 인기 검색
        </span>
        {['역삼동', '논현동', '신사동', '삼성동'].map(tag => (
          <button
            key={tag}
            onClick={() => { setQ(tag); handleSearch(tag); }}
            className="px-3 py-1 text-xs text-white/80 bg-white/10 rounded-full hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-colors"
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
