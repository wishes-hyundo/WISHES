'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';

interface Listing {
  id: number; title: string; type: string; deal: string;
  deposit: number; monthly: number; price: number;
  address: string; address_detail: string; dong: string;
  area_m2: number; floor_current: string; floor_total: string;
  rooms: number; bathrooms: number; direction: string;
  maintenance_fee: number; parking: boolean; elevator: boolean;
  description: string; status: string; created_at: string;
  images?: {url:string}[]; listing_images?: {url:string}[];
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
              if ((!item.images||!item.images.length) && item.listing_images?.length) item.images = item.listing_images;
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
      f = f.filter(l => (l.title||'').toLowerCase().includes(kw) || (l.address||'').toLowerCase().includes(kw) || (l.dong||'').toLowerCase().includes(kw));
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
          <input value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
            placeholder="주소, 동, 매물명 검색..." className="flex-1 px-3 py-2 rounded-lg text-sm text-gray-800 bg-white/90 placeholder-gray-400 outline-none" />
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
                      {imgUrl ? <img src={imgUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">🏠</div>}
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
        {filtered.length === 0 && <div className="text-center py-16 text-gray-400">검색 결과가 없습니다.</div>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 py-4">
          <button onClick={() => setPage(Math.max(1,page-1))} disabled={page<=1} className="px-3 py-1 rounded bg-gray-200 text-sm disabled:opacity-40">◀</button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="px-3 py-1 rounded bg-gray-200 text-sm disabled:opacity-40">▶</button>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-[999] flex items-end sm:items-center justify-center" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
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
              <div className="flex justify-between items-start">
                <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
                <button onClick={() => setSelected(null)} className="text-gray-400 text-xl">✕</button>
              </div>
              <p className="text-sm text-gray-500 mt-1">{selected.address} {selected.address_detail||''}</p>
              <div className="mt-3 bg-green-50 rounded-xl p-3">
                <div className="text-xs text-green-700 font-semibold">{selected.deal}</div>
                <div className="text-2xl font-extrabold text-green-800">{formatPrice(selected.deposit, selected.monthly, selected.price, selected.deal)}</div>
                {selected.maintenance_fee > 0 && <div className="text-xs text-gray-500">관리비 {selected.maintenance_fee}만원</div>}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                {[
                  ['면적', selected.area_m2 ? selected.area_m2+'m²' : '-'],
                  ['층수', selected.floor_current ? selected.floor_current+'/'+(selected.floor_total||'?')+'층' : '-'],
                  ['유형', selected.type || '-'],
                  ['방', selected.rooms ? selected.rooms+'개' : '-'],
                  ['욕실', selected.bathrooms ? selected.bathrooms+'개' : '-'],
                  ['방향', selected.direction || '-']
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-400">{label}</div>
                    <div className="text-sm font-semibold text-gray-700">{val}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                {selected.parking && <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">🅿️ 주차</span>}
                {selected.elevator && <span className="bg-purple-50 text-purple-700 text-xs px-2 py-1 rounded">�� EV</span>}
              </div>
              {selected.description && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs font-semibold text-gray-500 mb-1">상세설명</div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
