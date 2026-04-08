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
  return addr.replace(/^\uc11c\uc6b8\ud2b9\ubcc4\uc2dc\s/, '\uc11c\uc6b8 ')
    .replace(/^\uacbd\uae30\ub3c4\s/, '\uacbd\uae30 ')
    .replace(/^\uc778\ucc9c\uad11\uc5ed\uc2dc\s/, '\uc778\ucc9c ')
    .replace(/^\ubd80\uc0b0\uad11\uc5ed\uc2dc\s/, '\ubd80\uc0b0 ');
}

function formatPrice(dep: number, mon: number, price: number, deal: string) {
  if (deal === '\ub9e4\ub9e4') return price >= 10000 ? (price/10000).toFixed(1)+'\uc5b5' : price+'\ub9cc';
  if (deal === '\uc804\uc138') return dep >= 10000 ? (dep/10000).toFixed(1)+'\uc5b5' : dep+'\ub9cc';
  return dep+'/' + mon + '\ub9cc';
}

function timeAgo(dt: string) {
  if (!dt) return '';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff/60000);
  if (m < 60) return m+'\ubd84 \uc804';
  const h = Math.floor(m/60);
  if (h < 24) return h+'\uc2dc\uac04 \uc804';
  return Math.floor(h/24)+'\uc77c \uc804';
}

export default function SearchPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [dealFilter, setDealFilter] = useState('\uc804\uccb4');
  const [typeFilter, setTypeFilter] = useState('\uc804\uccb4');
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
    if (dealFilter !== '\uc804\uccb4') f = f.filter(l => l.deal === dealFilter);
    if (typeFilter !== '\uc804\uccb4') f = f.filter(l => l.type === typeFilter);
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
      const key = (l.address||'').trim() || '\uc8fc\uc18c \ubbf8\uc0c1';
      if (!g[key]) { g[key] = []; order.push(key); }
      g[key].push(l);
    });
    return { g, order };
  }, [pageItems]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700 mx-auto mb-4"></div>
        <p className="text-gray-600">\ub9e4\ubb3c \ub370\uc774\ud130\ub97c \ubd88\ub7ec\uc624\ub294 \uc911...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-green-800 to-green-900 text-white px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold whitespace-nowrap">\ud83d\udd0d WISHES</h1>
          <input value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
            placeholder="\uc8fc\uc18c, \ub3d9, \ub9e4\ubb3c\uba85 \uac80\uc0c9..." className="flex-1 px-3 py-2 rounded-lg text-sm text-gray-800 bg-white/90 placeholder-gray-400 outline-none" />
          <span className="text-xs bg-white/20 px-2 py-1 rounded">{filtered.length}\uac74</span>
        </div>
        {/* Filter chips */}
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
          {['\uc804\uccb4','\uc6d4\uc138','\uc804\uc138','\ub9e4\ub9e4'].map(d => (
            <button key={d} onClick={() => { setDealFilter(d); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${dealFilter===d ? 'bg-white text-green-800' : 'bg-white/20 text-white'}`}>{d}</button>
          ))}
          <span className="mx-1 border-l border-white/30"></span>
          {['\uc804\uccb4','\uc6d0\ub8f8','\ud22c\ub8f8','\uc624\ud53c\uc2a4\ud154','\ube4c\ub77c','\uc0c1\uac00'].map(t => (
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
                  <span className="text-green-800 font-semibold text-xs">\ud83d\udccd {addr}</span>
                  <span className="bg-green-700 text-white text-xs px-2 py-0.5 rounded-full">{items.length}\uac74</span>
                </div>
              )}
              {items.map(l => {
                const imgs = l.images || l.listing_images || [];
                const imgUrl = imgs.length > 0 ? (imgs[0].url || '') : '';
                return (
                  <div key={l.id} onClick={() => setSelected(l)}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex gap-3 cursor-pointer hover:shadow-md transition active:bg-gray-50 mb-2">
                    <div className="w-20 h-20 rounded-lg bg-gray-200 flex-shrink-0 overflow-hidden relative">
                      {imgUrl ? <img src={imgUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">\ud83c\udfe0</div>}
                      {imgs.length > 0 && <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded">{imgs.length}\uc7a5</span>}
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
                        {l.area_m2 > 0 && <span className="text-[10px] text-gray-400">{l.area_m2}m\u00b2</span>}
                        {l.floor_current && <span className="text-[10px] text-gray-400">{l.floor_current}\uce35</span>}
                      </div>
                      <div className="mt-1">
                        <span className="text-base font-extrabold text-green-800">{formatPrice(l.deposit, l.monthly, l.price, l.deal)}</span>
                        {l.maintenance_fee > 0 && <span className="text-[10px] text-gray-400 ml-1">\uad00\ub9ac {l.maintenance_fee}\ub9cc</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-16 text-gray-400">\uac80\uc0c9 \uacb0\uacfc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</div>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 py-4">
          <button onClick={() => setPage(Math.max(1,page-1))} disabled={page<=1} className="px-3 py-1 rounded bg-gray-200 text-sm disabled:opacity-40">\u25c0</button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="px-3 py-1 rounded bg-gray-200 text-sm disabled:opacity-40">\u25b6</button>
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
              ) : <div className="h-32 bg-gray-100 flex items-center justify-center text-4xl">\ud83c\udfe0</div>;
            })()}
            <div className="p-4">
              <div className="flex justify-between items-start">
                <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
                <button onClick={() => setSelected(null)} className="text-gray-400 text-xl">\u2715</button>
              </div>
              <p className="text-sm text-gray-500 mt-1">{selected.address} {selected.address_detail||''}</p>
              <div className="mt-3 bg-green-50 rounded-xl p-3">
                <div className="text-xs text-green-700 font-semibold">{selected.deal}</div>
                <div className="text-2xl font-extrabold text-green-800">{formatPrice(selected.deposit, selected.monthly, selected.price, selected.deal)}</div>
                {selected.maintenance_fee > 0 && <div className="text-xs text-gray-500">\uad00\ub9ac\ube44 {selected.maintenance_fee}\ub9cc\uc6d0</div>}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                {[
                  ['\uba74\uc801', selected.area_m2 ? selected.area_m2+'m\u00b2' : '-'],
                  ['\uce35\uc218', selected.floor_current ? selected.floor_current+'/'+(selected.floor_total||'?')+'\uce35' : '-'],
                  ['\uc720\ud615', selected.type || '-'],
                  ['\ubc29', selected.rooms ? selected.rooms+'\uac1c' : '-'],
                  ['\uc695\uc2e4', selected.bathrooms ? selected.bathrooms+'\uac1c' : '-'],
                  ['\ubc29\ud5a5', selected.direction || '-']
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-400">{label}</div>
                    <div className="text-sm font-semibold text-gray-700">{val}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                {selected.parking && <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">\ud83c\udd7f\ufe0f \uc8fc\ucc28</span>}
                {selected.elevator && <span className="bg-purple-50 text-purple-700 text-xs px-2 py-1 rounded">\ud83d\udbd7 EV</span>}
              </div>
              {selected.description && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                  <div className="text-xs font-semibold text-gray-500 mb-1">\uc0c1\uc138\uc124\uba85</div>
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
