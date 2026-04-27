'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import TransportInfo from '@/components/admin/TransportInfo';
import LocationMap from '@/components/admin/LocationMap';
import RealPriceTrend from '@/components/admin/RealPriceTrend';
import BuildingRegistry from '@/components/admin/BuildingRegistry';
import AIAutoGenerate from '@/components/admin/AIAutoGenerate';
import SmartRecommend from '@/components/admin/SmartRecommend';
// L-v7-p2r (2026-04-22): ScopeToggle 을 /admin/search 에서 철회.
//   사용자 지시: 중개사 포털은 /search 하나만 두고 v7 기능은 거기에 통합.
//   /admin/search 는 관리자 원본 UI 로 되돌림.
import '@/styles/admin-modal-enhanced.css';

interface Listing {
  id: number;
  title: string;
  type: string;
  deal: string;
  deposit: number;
  monthly: number;
  price: number;
  address: string;
  address_detail: string;
  dong: string;
  area_m2: number;
  floor_current: string;
  floor_total: string;
  rooms: number;
  bathrooms: number;
  direction: string;
  maintenance_fee: number;
  parking: boolean;
  elevator: boolean;
  description: string;
  status: string;
  created_at: string;
  images?: {url:string}[];
  listing_images?: {url:string}[];
  lat?: number;
  lng?: number;
  seo_keywords?: string[];
  seo_tags?: string[];
  area_supply_m2?: number;
  heating_type?: string;
  pet?: boolean;
  balcony?: boolean;
  full_option?: boolean;
  loan_available?: boolean;
  built_year?: string;
  available_date?: string;
}

function normalizeAddr(addr: string) {
  return addr.replace(/^서울특별시\s/, '서울 ')
    .replace(/^경기도\s/, '경기 ')
    .replace(/^인천광역시\s/, '인천 ')
    .replace(/^부산광역시\s/, '부산 ');
}

function formatPrice(dep: number, mon: number, price: number, deal: string) {
  if (deal === '매매') return price >= 10000 ? (price/10000).toFixed(1)+'억' : price+'만';
  if (deal === '전세') return dep >= 10000 ? (dep/10000).toFixed(1)+'억' : dep+'만';
  return dep+'/' + mon + '만';
}

function timeAgo(dt: string) {
  if (!dt) return '';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff/60000);
  if (m < 60) return m+'분 전';
  const h = Math.floor(m/60);
  if (h < 24) return h+'시간 전';
  return Math.floor(h/24)+'일 전';
}

function getMaskedAddress(address: string, dong?: string): string {
  if (!address) return '주소 미등록';
  const parts = address.split(' ');
  let masked = '';
  for (const part of parts) {
    masked += (masked ? ' ' : '') + part;
    if (/[동읍면리가로]$/.test(part) || part === dong) break;
  }
  return masked || parts.slice(0, 3).join(' ');
}

export default function SearchPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [dealFilter, setDealFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [selected, setSelected] = useState<Listing|null>(null);
  const [page, setPage] = useState(1);
  const perPage = 20;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const all: Listing[] = [];
        for (let off = 0; off < 20000; off += 1000) {
          const r = await fetch('/api/listings?limit=1000&offset='+off);
          const d = await r.json();
          if (d.success && d.data?.length) {
            d.data.forEach((item: Listing) => {
              if (item.address) item.address = normalizeAddr(item.address);
              if ((!item.images||!item.images.length) && item.listing_images?.length)
                item.images = item.listing_images;
            });
            all.push(...d.data);
            if (d.data.length < 1000) break;
          } else break;
        }
        setListings(all);
      } catch(e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    let f = [...listings];
    if (dealFilter !== '전체') f = f.filter(l => l.deal === dealFilter);
    if (typeFilter !== '전체') f = f.filter(l => l.type === typeFilter);
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      f = f.filter(l =>
        (l.title||'').toLowerCase().includes(kw) ||
        (l.address||'').toLowerCase().includes(kw) ||
        (l.dong||'').toLowerCase().includes(kw)
      );
    }
    return f;
  }, [listings, dealFilter, typeFilter, keyword]);

  const pageItems = useMemo(() => filtered.slice((page-1)*perPage, page*perPage), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / perPage);

  const grouped = useMemo(() => {
    const g: Record<string, Listing[]> = {};
    const order: string[] = [];
    pageItems.forEach(l => {
      const key = (l.address||'').trim() || '주소 미상';
      if (!g[key]) { g[key] = []; order.push(key); }
      g[key].push(l);
    });
    return { g, order };
  }, [pageItems]);

  const handleListingUpdate = (updated: Partial<Listing>) => {
    if (!selected) return;
    setSelected({ ...selected, ...updated } as Listing);
    setListings(prev => prev.map(l => l.id === selected.id ? { ...l, ...updated } : l));
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700 mx-auto mb-4"></div>
        <p className="text-gray-600">매물 데이터를 불러오는 중...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-green-800 to-green-900 text-white px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold whitespace-nowrap">🔍 WISHES</h1>
          <input
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
            placeholder="주소, 동, 매물명 검색..."
            className="flex-1 px-3 py-2 rounded-lg text-sm text-gray-800 bg-white/90 placeholder-gray-400 outline-none"
          />
          <span className="text-xs bg-white/20 px-2 py-1 rounded">{filtered.length}건</span>
        </div>
        {/* Filter chips */}
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
          {['전체','월세','전세','매매'].map(d => (
            <button key={d} onClick={() => { setDealFilter(d); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${dealFilter===d ? 'bg-white text-green-800' : 'bg-white/20 text-white'}`}>{d}</button>
          ))}
          <span className="mx-1 border-l border-white/30"></span>
          {['전체','원룸','투룸','오피스텔','빌라','상가'].map(t => (
            <button key={t} onClick={() => { setTypeFilter(t); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${typeFilter===t ? 'bg-yellow-400 text-gray-800' : 'bg-white/20 text-white'}`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Listings */}
      <div className="px-3 py-2">
        {grouped.order.map(addr => {
          const items = grouped.g[addr];
          return (
            <div key={addr} className={items.length > 1 ? "border border-green-200 rounded-xl mb-3 overflow-hidden" : "mb-3"}>
              {items.length > 1 && (
                <div className="bg-green-50 px-3 py-2 flex items-center gap-2">
                  <span className="text-green-800 font-semibold text-xs">📍 {addr}</span>
                  <span className="bg-green-700 text-white text-xs px-2 py-0.5 rounded-full">{items.length}건</span>
                </div>
              )}
              {items.map(l => {
                const imgs = l.images || l.listing_images || [];
                const imgUrl = imgs.length > 0 ? (imgs[0].url || '') : '';
                return (
                  <div key={l.id} onClick={() => setSelected(l)}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex gap-3 cursor-pointer hover:shadow-md transition active:bg-gray-50 mb-2">
                    <div className="w-20 h-20 rounded-lg bg-gray-200 flex-shrink-0 overflow-hidden relative">
                      {imgUrl ? <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">🏠</div>}
                      {imgs.length > 0 && <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded">{imgs.length}장</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="text-sm font-bold text-gray-800 truncate">{l.title}</h3>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(l.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{l.address} {l.address_detail||''}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="bg-green-100 text-green-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">{l.deal}</span>
                        <span className="bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded">{l.type}</span>
                        {l.area_m2 > 0 && <span className="text-[10px] text-gray-400">{l.area_m2}m²</span>}
                        {l.floor_current && <span className="text-[10px] text-gray-400">{l.floor_current}층</span>}
                      </div>
                      <div className="mt-1">
                        <span className="text-base font-extrabold text-green-800">{formatPrice(l.deposit, l.monthly, l.price, l.deal)}</span>
                        {l.maintenance_fee > 0 && <span className="text-[10px] text-gray-400 ml-1">관리 {l.maintenance_fee}만</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-16 text-gray-400">가색 결과가 없습니다.</div>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 py-4">
          <button onClick={() => setPage(Math.max(1,page-1))} disabled={page<=1}
            className="px-3 py-1 rounded bg-gray-200 text-sm disabled:opacity-40">◀</button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages,page+1))} disabled={page>=totalPages}
            className="px-3 py-1 rounded bg-gray-200 text-sm disabled:opacity-40">▶</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Detail Modal — 개선된 상세 모달
          ══════════════════════════════════════════════════════════════ */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-[999] flex items-end sm:items-center justify-center"
          onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Gallery */}
            {(() => {
              const imgs = selected.images || selected.listing_images || [];
              return imgs.length > 0 ? (
                <div className="relative h-56 bg-gray-200 overflow-x-auto flex snap-x snap-mandatory">
                  {imgs.map((img, i) => <img key={i} src={img.url} alt="" className="w-full h-56 object-cover flex-shrink-0 snap-center" />)}
                </div>
              ) : <div className="h-32 bg-gray-100 flex items-center justify-center text-4xl">🏠</div>;
            })()}

            <div className="p-4">
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">{getMaskedAddress(selected.address, selected.dong)}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 text-xl hover:text-gray-600">✕</button>
              </div>

              {/* ── 가격정보 ── */}
              <div className="mt-3 bg-green-50 rounded-xl p-3">
                <div className="text-xs text-green-700 font-semibold">{selected.deal}</div>
                <div className="text-2xl font-extrabold text-green-800">
                  {formatPrice(selected.deposit, selected.monthly, selected.price, selected.deal)}
                </div>
                {selected.maintenance_fee > 0 && (
                  <div className="text-xs text-gray-500">관리비 {selected.maintenance_fee}만원</div>
                )}
              </div>

              {/* ── 기본정보 ── */}
              <div className="ws-detail-section">
                <h3>기본정보</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ['면적', selected.area_m2 ? selected.area_m2+'m²' : '-'],
                    ['층수', selected.floor_current ? selected.floor_current+'/'+(selected.floor_total||'?')+'층' : '-'],
                    ['유형', selected.type || '-'],
                    ['방', selected.rooms ? selected.rooms+'개' : '-'],
                    ['욕실', selected.bathrooms ? selected.bathrooms+'개' : '-'],
                    ['방향', selected.direction || '-'],
                  ].map(([label, val]) => (
                    <div key={label as string} className="bg-gray-50 rounded-lg p-2">
                      <div className="text-[10px] text-gray-400">{label}</div>
                      <div className="text-sm font-semibold text-gray-700">{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── 추가정보 ── */}
              <div className="ws-detail-section">
                <h3>추가정보</h3>
                <div className="flex gap-2 flex-wrap">
                  {selected.parking && <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">🅿️ 주차</span>}
                  {selected.elevator && <span className="bg-purple-50 text-purple-700 text-xs px-2 py-1 rounded">🛗 엘리베이터</span>}
                  {selected.pet && <span className="bg-orange-50 text-orange-700 text-xs px-2 py-1 rounded">🐾 반려동물</span>}
                  {selected.balcony && <span className="bg-teal-50 text-teal-700 text-xs px-2 py-1 rounded">🪟 발랄다</span>}
                  {selected.full_option && <span className="bg-pink-50 text-pink-700 text-xs px-2 py-1 rounded">✨ 풀옵션</span>}
                  {selected.loan_available && <span className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded">🏦 전세대출</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  {selected.built_year && <div><span className="text-gray-400 text-xs">준공년도</span> <span className="text-gray-700">{selected.built_year}</span></div>}
                  {selected.available_date && <div><span className="text-gray-400 text-xs">입주가능</span> <span className="text-gray-700">{selected.available_date}</span></div>}
                  {selected.heating_type && <div><span className="text-gray-400 text-xs">난방</span> <span className="text-gray-700">{selected.heating_type}</span></div>}
                </div>
              </div>

              {/* ══════ 교통정보 ★ 신규 ══════ */}
              <TransportInfo
                listingId={String(selected.id)}
                address={selected.address}
              />

              {/* ══════ 위치/지도 ★ 신규 ══════ */}
              <LocationMap
                address={selected.address}
                dong={selected.dong}
                lat={selected.lat}
                lng={selected.lng}
              />

              {/* ══════ 실거래가 동향 ★ 신규 ══════ */}
              <RealPriceTrend
                listingId={String(selected.id)}
                dealType={selected.deal}
                dong={selected.dong}
              />

              {/* ══════ 건축물대장 ★ 신규 + 검증 ══════ */}
              <BuildingRegistry listing={selected as any} />

              {/* ══════ 상세설명 ★ 레이아웃 개선 ══════ */}
              <div className="ws-detail-section">
                <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>상세설명</span>
                  <AIAutoGenerate
                    listing={selected as any}
                    onUpdate={(field: string, value: any) => handleListingUpdate({ [field]: value })}
                  />
                </h3>

                {/* SEO 태그 */}
                {selected.seo_tags && selected.seo_tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {selected.seo_tags.map((tag, i) => (
                      <span key={i} style={{
                        fontSize: '11px', padding: '2px 8px',
                        background: '#e8f4fd', color: '#0f3460',
                        borderRadius: '12px'
                      }}>#{tag}</span>
                    ))}
                  </div>
                )}

                {/* ★ 핵심 수정: pre-line + 폰트/줄간격 개선 */}
                <p style={{
                  whiteSpace: 'pre-line',
                  fontSize: '14px',
                  lineHeight: '1.85',
                  color: '#333',
                  padding: '16px 20px',
                  background: '#f8f9fb',
                  borderRadius: '10px',
                  wordBreak: 'keep-all' as any,
                  border: '1px solid #eef0f3',
                  margin: 0,
                }}>
                  {selected.description || '상세설명이 없습니다. AI SEO 설명 생성 버튼으로 자동 생성할 수 있습니다.'}
                </p>

                {/* SEO 키워드 */}
                {selected.seo_keywords && selected.seo_keywords.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#888' }}>SEO 키워드: </span>
                    <span style={{ fontSize: '11px', color: '#0f3460' }}>
                      {selected.seo_keywords.join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* ══════ 스마트 추천 ★ 신규 ══════ */}
              <SmartRecommend
                currentListing={selected as any}
                onSelect={(rec) => {
                  const found = listings.find(l => String(l.id) === String(rec.id));
                  if (found) setSelected(found);
                }}
              />

              {/* ── 메모 ── */}
              <div className="ws-detail-section">
                <h3>메모</h3>
                <textarea
                  placeholder="매물에 대한 메모를 입력하세요..."
                  style={{
                    width: '100%', minHeight: '60px', padding: '10px',
                    border: '1px solid #e0e0e0', borderRadius: '8px',
                    fontSize: '13px', resize: 'vertical', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {/* L-v7-p2: ./. tag row ending here (cleanup) */}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
