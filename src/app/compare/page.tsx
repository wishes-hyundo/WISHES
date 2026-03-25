'use client';

import { useState, useEffect } from 'react';
import { Scale, X, Home, ArrowLeft, Check, Minus } from 'lucide-react';
import Link from 'next/link';

interface ListingCompare {
  id: number;
  title: string;
  type: string;
  deal: string;
  deposit: number;
  monthly: number | null;
  price: number | null;
  maintenance_fee: number;
  area_m2: number;
  area_supply_m2: number | null;
  floor_current: string;
  floor_total: string | null;
  rooms: number | null;
  bathrooms: number | null;
  direction: string | null;
  heating_type: string | null;
  address: string;
  dong: string;
  parking: boolean;
  elevator: boolean;
  pet: boolean;
  balcony: boolean;
  full_option: boolean;
  loan_available: boolean;
  built_year: string | null;
  images: string[] | null;
}

function formatPrice(deal: string, deposit: number, monthly: number | null, price: number | null): string {
  if (deal === '매매' && price) {
    return price >= 10000 ? `${Math.floor(price/10000)}억${price%10000 ? ' '+price%10000 : ''}` : `${price.toLocaleString()}`;
  }
  if (deal === '전세') {
    return deposit >= 10000 ? `${Math.floor(deposit/10000)}억${deposit%10000 ? ' '+deposit%10000 : ''}` : `${deposit.toLocaleString()}`;
  }
  return `${deposit.toLocaleString()}/${monthly?.toLocaleString() || 0}`;
}

export default function ComparePage() {
  const [items, setItems] = useState<ListingCompare[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // localStorage에서 비교 매물 ID 로드
    const ids = JSON.parse(localStorage.getItem('compare_ids') || '[]');
    if (ids.length === 0) {
      setLoading(false);
      return;
    }

    fetch(`/api/listings?ids=${ids.join(',')}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setItems(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const removeItem = (id: number) => {
    setItems(prev => prev.filter(item => item.id !== id));
    const ids = JSON.parse(localStorage.getItem('compare_ids') || '[]');
    localStorage.setItem('compare_ids', JSON.stringify(ids.filter((i: number) => i !== id)));
  };

  const clearAll = () => {
    setItems([]);
    localStorage.setItem('compare_ids', '[]');
  };

  const BoolIcon = ({ value }: { value: boolean }) => (
    value
      ? <Check className="w-5 h-5 text-green-500 mx-auto" />
      : <Minus className="w-5 h-5 text-gray-300 mx-auto" />
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white py-10">
        <div className="max-w-6xl mx-auto px-4">
          <Link href="/listings" className="inline-flex items-center gap-1 text-gray-300 hover:text-white text-sm mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 매물검색으로 돌아가기
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Scale className="w-6 h-6 text-amber-400" />
                <h1 className="text-2xl md:text-3xl font-bold">매물 비교</h1>
              </div>
              <p className="text-gray-300">선택한 매물을 한눈에 비교해보세요 (최대 4개)</p>
            </div>
            {items.length > 0 && (
              <button onClick={clearAll} className="text-sm text-gray-400 hover:text-white transition-colors">
                전체 삭제
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <Scale className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">비교할 매물이 없습니다</h2>
            <p className="text-gray-500 mb-6">매물검색에서 비교할 매물을 선택해주세요</p>
            <Link href="/listings" className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors">
              <Home className="w-4 h-4" /> 매물 검색하기
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full bg-white rounded-2xl shadow-sm overflow-hidden">
              <thead>
                <tr>
                  <th className="w-40 p-4 text-left text-sm font-medium text-gray-500 bg-gray-50">항목</th>
                  {items.map(item => (
                    <th key={item.id} className="p-4 min-w-[200px] relative">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                      {item.images?.[0] && (
                        <div className="w-full h-32 rounded-xl overflow-hidden mb-3">
                          <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <p className="font-bold text-gray-900 text-sm">{item.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.dong}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="bg-amber-50">
                  <td className="p-4 text-sm font-medium text-gray-700">가격</td>
                  {items.map(item => (
                    <td key={item.id} className="p-4 text-center">
                      <span className="text-lg font-bold text-amber-600">{item.deal} {formatPrice(item.deal, item.deposit, item.monthly, item.price)}</span>
                      {item.deal === '월세' && <p className="text-xs text-gray-500">만원</p>}
                    </td>
                  ))}
                </tr>
                {[
                  { label: '매물유형', key: 'type' },
                  { label: '전용면적', key: 'area_m2', suffix: 'm²' },
                  { label: '공급면적', key: 'area_supply_m2', suffix: 'm²' },
                  { label: '해당층/총층', key: 'floor' },
                  { label: '방/욕실', key: 'rooms_baths' },
                  { label: '방향', key: 'direction' },
                  { label: '난방', key: 'heating_type' },
                  { label: '관리비', key: 'maintenance_fee', suffix: '만원/월' },
                  { label: '준공년도', key: 'built_year' },
                  { label: '주소', key: 'address' },
                ].map(row => (
                  <tr key={row.key} className="hover:bg-gray-50">
                    <td className="p-4 text-sm font-medium text-gray-700">{row.label}</td>
                    {items.map(item => {
                      let value = '';
                      if (row.key === 'floor') value = `${item.floor_current}층${item.floor_total ? '/'+item.floor_total+'층' : ''}`;
                      else if (row.key === 'rooms_baths') value = `${item.rooms || '-'}개/${item.bathrooms || '-'}개`;
                      else if (row.key === 'area_m2') value = `${item.area_m2}${row.suffix}`;
                      else if (row.key === 'area_supply_m2') value = item.area_supply_m2 ? `${item.area_supply_m2}${row.suffix}` : '-';
                      else if (row.key === 'maintenance_fee') value = item.maintenance_fee ? `${item.maintenance_fee}${row.suffix}` : '-';
                      else value = (item as any)[row.key] || '-';
                      return <td key={item.id} className="p-4 text-center text-sm text-gray-800">{value}</td>;
                    })}
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td colSpan={items.length + 1} className="p-4 text-sm font-bold text-gray-700">시설 옵션</td>
                </tr>
                {[
                  { label: '주차', key: 'parking' },
                  { label: '엘리베이터', key: 'elevator' },
                  { label: '반려동물', key: 'pet' },
                  { label: '발코니', key: 'balcony' },
                  { label: '풀옵션', key: 'full_option' },
                  { label: '대출가능', key: 'loan_available' },
                ].map(row => (
                  <tr key={row.key} className="hover:bg-gray-50">
                    <td className="p-4 text-sm font-medium text-gray-700">{row.label}</td>
                    {items.map(item => (
                      <td key={item.id} className="p-4">
                        <BoolIcon value={(item as any)[row.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
