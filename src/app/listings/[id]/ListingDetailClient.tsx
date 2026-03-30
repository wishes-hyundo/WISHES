'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import { Calendar, ArrowLeft, Check, X, Eye, Hash } from 'lucide-react';
import { getFormattedPrice, getDealColor, sqmToPyeong, getStatusColor } from '@/lib/utils';
import ImageGallery from '@/components/ImageGallery';

export default function ListingDetailClient({ id }: { id: string }) {
  const [listing, setListing] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const lid = parseInt(id);
      const supabase = createClient();
      const [lr, ir, fr] = await Promise.all([
        supabase.from('listings').select('*').eq('id', lid).single(),
        supabase.from('listing_images').select('id, url, sort_order').eq('listing_id', lid).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('id, feature').eq('listing_id', lid),
      ]);
      if (!lr.data) { setNotFound(true); setLoading(false); return; }
      setListing(lr.data);
      setImages(ir.data || []);
      setFeatures(fr.data || []);
      setLoading(false);
      supabase.from('listings').update({ views: (lr.data.views || 0) + 1 }).eq('id', lid).then(() => {}).catch(() => {});
    };
    fetchData();
  }, [id]);

  if (loading) return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      <div className="bg-white border-b border-gray-200"><div className="max-w-5xl mx-auto px-4 py-3"><div className="h-4 w-24 bg-gray-200 rounded animate-pulse" /></div></div>
      <div className="max-w-5xl mx-auto px-4 py-8"><div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse"><div className="aspect-[16/10] bg-gray-200" /></div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse"><div className="h-8 w-2/3 bg-gray-200 rounded mb-2" /><div className="h-9 w-1/3 bg-gray-200 rounded mb-6" /><div className="grid grid-cols-2 gap-4">{Array.from({length:6}).map((_,i)=>(<div key={i}><div className="h-3 w-12 bg-gray-100 rounded mb-1" /><div className="h-5 w-24 bg-gray-200 rounded" /></div>))}</div></div>
        </div>
        <div><div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse"><div className="h-6 w-32 bg-gray-200 rounded mb-4" /><div className="h-12 w-full bg-gray-200 rounded-xl" /></div></div>
      </div></div>
    </div>
  );

  if (notFound) return (<div className="pt-16 min-h-screen bg-wishes-bg flex items-center justify-center"><div className="text-center"><p className="text-gray-500 text-lg">매물을 찾을 수 없습니다</p><Link href="/listings" className="text-wishes-secondary hover:underline mt-2 inline-block">매물 목록으로</Link></div></div>);

  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      <div className="bg-white border-b border-gray-200"><div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        <Link href="/listings" className="flex items-center gap-1 text-sm text-gray-500 hover:text-wishes-secondary"><ArrowLeft className="w-4 h-4" />매물 목록</Link>
        <span className="text-gray-300">/</span><span className="text-sm text-gray-700 font-medium truncate">{listing.title}</span>
      </div></div>
      <div className="max-w-5xl mx-auto px-4 py-8"><div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <ImageGallery images={images} title={listing.title} deal={listing.deal} status={listing.status} dealColor={getDealColor(listing.deal)} statusColor={getStatusColor(listing.status)} />
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-1"><span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1"><Hash className="w-3 h-3" /> W-{listing.id}</span>{listing.views > 0 && <span className="text-xs text-gray-400 flex items-center gap-1"><Eye className="w-3 h-3" /> 조회 {listing.views}</span>}</div>
            <h1 className="text-2xl font-bold text-wishes-primary">{listing.title}</h1>
            <p className="text-3xl font-bold text-wishes-accent mt-2">{price.main}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6">
              <IR label="매물유형" value={listing.type} /><IR label="거래유형" value={listing.deal} />
              <IR label="전용면적" value={listing.area_m2 ? listing.area_m2 + '㎡ (' + sqmToPyeong(listing.area_m2) + '평)' : '정보 없음'} />
              <IR label="층수" value={listing.floor_current} /><IR label="주소" value={listing.address} fw /><IR label="동" value={listing.dong} />
              {listing.built_year && <IR label="준공년도" value={listing.built_year} />}
              {listing.available_date && <IR label="입주가능일" value={listing.available_date} />}
            </div>
            <div className="mt-6 pt-6 border-t border-gray-100"><h3 className="text-sm font-semibold text-gray-700 mb-3">옵션 / 시설</h3><div className="flex flex-wrap gap-2">
              <OB label="주차" a={listing.parking ?? false} /><OB label="엘리베이터" a={listing.elevator ?? false} /><OB label="반려동물" a={listing.pet ?? false} /><OB label="발코니" a={listing.balcony ?? false} /><OB label="풀옵션" a={listing.full_option ?? false} />
              {features.map((f) => (<span key={f.id} className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-full">{f.feature}</span>))}
            </div></div>
            {listing.description && <div className="mt-6 pt-6 border-t border-gray-100"><h3 className="text-sm font-semibold text-gray-700 mb-3">상세 설명</h3><p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{listing.description}</p></div>}
          </div>
        </div>
        <div className="space-y-4"><div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-24">
          <h3 className="text-lg font-bold text-wishes-primary mb-4">이 매물 문의하기</h3>
          <Link href={'/contact?listing=' + listing.id} className="flex items-center justify-center gap-2 w-full bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors">온라인 상담 신청</Link>
          <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
            <p className="flex items-center gap-1"><Calendar className="w-3 h-3" />등록일: {new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
            <p className="flex items-center gap-1"><Calendar className="w-3 h-3" />수정일: {new Date(listing.updated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
          </div>
        </div></div>
      </div></div>
    </div>
  );
}

function IR({ label, value, fw }: { label: string; value: string; fw?: boolean }) {
  return <div className={fw ? 'col-span-2' : ''}><span className="text-xs text-gray-400">{label}</span><p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p></div>;
}

function OB({ label, a }: { label: string; a: boolean }) {
  return <span className={'flex items-center gap-1 px-3 py-1 text-sm rounded-full ' + (a ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400 line-through')}>{a ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}{label}</span>;
}