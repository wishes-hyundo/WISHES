'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ImageGallery from '@/components/ImageGallery';

interface ListingData {
  id: string;
  title: string;
  transaction_type: string;
  property_type: string;
  address: string;
  address_detail?: string;
  area: number;
  floor: number;
  total_floors: number;
  price: number;
  deposit: number;
  monthly_rent: number;
  rooms: number;
  bathrooms: number;
  direction: string;
  move_in_date: string;
  features: string[];
  description: string;
  images: string[];
  status: string;
  building_name?: string;
  building_structure?: string;
  building_purpose?: string;
  approval_date?: string;
  elevator_count?: number;
  parking_count?: number;
  created_at: string;
  updated_at: string;
}

export default function ListingDetailClient({ listing }: { listing: ListingData }) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  const images = listing.images?.length > 0 ? listing.images : ['/placeholder-property.jpg'];
  const pyeong = Math.round((listing.area || 0) * 0.3025);

  const priceText = listing.transaction_type === '\uC6D4\uC138'
    ? `\uBCF4\uC99D\uAE08 ${(listing.deposit || 0).toLocaleString()}\uB9CC\uC6D0 / \uC6D4\uC138 ${(listing.monthly_rent || 0).toLocaleString()}\uB9CC\uC6D0`
    : listing.transaction_type === '\uC804\uC138'
      ? `\uC804\uC138 ${(listing.price || 0).toLocaleString()}\uB9CC\uC6D0`
      : `\uB9E4\uB9E4 ${(listing.price || 0).toLocaleString()}\uB9CC\uC6D0`;

  const handleShare = async (platform: string) => {
    const url = `https://wishes.co.kr/listings/${listing.id}`;
    const text = `${listing.title} - ${priceText}`;

    switch (platform) {
      case 'kakao':
        if (typeof window !== 'undefined' && (window as any).Kakao) {
          (window as any).Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
              title: listing.title,
              description: priceText,
              imageUrl: images[0],
              link: { mobileWebUrl: url, webUrl: url },
            },
          });
        }
        break;
      case 'clipboard':
        await navigator.clipboard.writeText(url);
        alert('\uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
        break;
      case 'sms': {
        const smsBody = encodeURIComponent(text + ' ' + url);
        window.open('sms:?body=' + smsBody, '_self');
        break;
      }
      case 'email': {
        const subject = encodeURIComponent(listing.title);
        const body = encodeURIComponent(text + '\n\n' + url);
        window.open('mailto:?subject=' + subject + '&body=' + body, '_self');
        break;
      }
      case 'native':
        if (navigator.share) {
          await navigator.share({ title: text, url });
        }
        break;
    }
    setShowShareMenu(false);
  };

  const toggleFavorite = () => {
    setIsFavorite(!isFavorite);
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    if (isFavorite) {
      localStorage.setItem('favorites', JSON.stringify(favorites.filter((f: string) => f !== listing.id)));
    } else {
      localStorage.setItem('favorites', JSON.stringify([...favorites, listing.id]));
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/listings" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">{'\uBAA9\uB85D\uC73C\uB85C'}</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFavorite}
              className={`p-2 rounded-full transition-colors ${isFavorite ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}
            >
              <svg className="w-6 h-6" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="p-2 rounded-full text-gray-400 hover:text-blue-500 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              {showShareMenu && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border py-2 w-48 z-40">
                  <button onClick={() => handleShare('kakao')} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2">
                    <span className="w-5 h-5 bg-yellow-400 rounded flex items-center justify-center text-xs font-bold text-yellow-900">K</span>
                    {'\uCE74\uCE74\uC624\uD1A1 \uACF5\uC720'}
                  </button>
                  <button onClick={() => handleShare('clipboard')} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    {'\uB9C1\uD06C \uBCF5\uC0AC'}
                  </button>
                  <button
                      onClick={() => handleShare('sms')}
                      className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {'문자 전송'}
                    </button>
                    <button
                      onClick={() => handleShare('email')}
                      className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {'이메일'}
                    </button>
                    {typeof navigator !== 'undefined' && navigator.share && (
                    <button onClick={() => handleShare('native')} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      {'\uB354\uBCF4\uAE30'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

            {/* Image Gallery */}
      <ImageGallery images={images} title={listing.title} />

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info - Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title & Price */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  {listing.transaction_type}
                </span>
                <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                  {listing.property_type}
                </span>
                {listing.status === 'active' && (
                  <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    {'\uAD11\uACE0\uC911'}
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold text-gray-900 mb-2">{listing.title}</h1>
              <p className="text-gray-500 text-sm mb-4 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {listing.address} {listing.address_detail || ''}
              </p>

              <div className="text-3xl font-bold text-blue-600">{priceText}</div>
            </div>

            {/* Detail Info Grid */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{'\uB9E4\uBB3C \uC815\uBCF4'}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
                <div>
                  <span className="text-xs text-gray-500 block">{'\uBA74\uC801'}</span>
                  <span className="font-medium">{listing.area}{'\u33A1'} ({'\uC57D'} {pyeong}{'\uD3C9'})</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">{'\uCE35\uC218'}</span>
                  <span className="font-medium">{listing.floor}{'\uCE35'} / {listing.total_floors}{'\uCE35'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">{'\uBC29/\uC695\uC2E4'}</span>
                  <span className="font-medium">{listing.rooms}{'\uAC1C'} / {listing.bathrooms}{'\uAC1C'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">{'\uBC29\uD5A5'}</span>
                  <span className="font-medium">{listing.direction || '-'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">{'\uC785\uC8FC\uAC00\uB2A5\uC77C'}</span>
                  <span className="font-medium">{listing.move_in_date ? formatDate(listing.move_in_date) : '\uD611\uC758'}</span>
                </div>
                {listing.building_name && (
                  <div>
                    <span className="text-xs text-gray-500 block">{'\uAC74\uBB3C\uBA85'}</span>
                    <span className="font-medium">{listing.building_name}</span>
                  </div>
                )}
                {listing.building_structure && (
                  <div>
                    <span className="text-xs text-gray-500 block">{'\uAC74\uBB3C\uAD6C\uC870'}</span>
                    <span className="font-medium">{listing.building_structure}</span>
                  </div>
                )}
                {listing.elevator_count !== undefined && listing.elevator_count > 0 && (
                  <div>
                    <span className="text-xs text-gray-500 block">{'\uC5D8\uB9AC\uBCA0\uC774\uD130'}</span>
                    <span className="font-medium">{listing.elevator_count}{'\uB300'}</span>
                  </div>
                )}
                {listing.parking_count !== undefined && listing.parking_count > 0 && (
                  <div>
                    <span className="text-xs text-gray-500 block">{'\uC8FC\uCC28'}</span>
                    <span className="font-medium">{listing.parking_count}{'\uB300'}</span>
                  </div>
                )}
                {listing.approval_date && (
                  <div>
                    <span className="text-xs text-gray-500 block">{'\uC0AC\uC6A9\uC2B9\uC778\uC77C'}</span>
                    <span className="font-medium">{listing.approval_date}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Features */}
            {listing.features && listing.features.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">{'\uD2B9\uC9D5'}</h2>
                <div className="flex flex-wrap gap-2">
                  {listing.features.map((feature, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-full">
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {listing.description && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">{'\uC0C1\uC138 \uC124\uBA85'}</h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {listing.description}
                </div>
              </div>
            )}

            {/* Map Placeholder */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{'\uC704\uCE58'}</h2>
              <div className="aspect-[16/9] bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm">{listing.address}</p>
                  <p className="text-xs mt-1">{'\uCE74\uCE74\uC624\uB9F5 \uC5F0\uB3D9 \uC608\uC815'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar - Right Column */}
          <div className="space-y-6">
            {/* Contact Card */}
            <div className="bg-white rounded-xl shadow-sm border p-6 sticky top-16">
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900">{'\uC704\uC2DC\uC2A4\uBD80\uB3D9\uC0B0\uC911\uAC1C\uBC95\uC778'}</h3>
                <p className="text-sm text-gray-500">{'\uC11C\uC6B8\xB7\uACBD\uAE30 \uC804\uBB38 \uBD80\uB3D9\uC0B0 \uC911\uAC1C'}</p>
              </div>

              <Link
              href="/contact"
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium text-center block mb-3 hover:bg-blue-700 transition-colors"
            >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {'\uC804\uD654 \uBB38\uC758'}
                </span>
              </a>

              <button
                onClick={() => setShowContact(!showContact)}
                className="w-full bg-yellow-400 text-yellow-900 py-3 rounded-lg font-medium text-center block hover:bg-yellow-500 transition-colors"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 bg-yellow-900 rounded flex items-center justify-center text-xs font-bold text-yellow-400">K</span>
                  {'\uCE74\uCE74\uC624\uD1A1 \uBB38\uC758'}
                </span>
              </button>

              {showContact && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">{'\uCE74\uCE74\uC624\uD1A1 \uCC44\uB110\uC744 \uD1B5\uD574 \uBB38\uC758\uD574\uC8FC\uC138\uC694.'}</p>
                  <a
                    href="https://pf.kakao.com/_wishes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {'\uCE74\uCE74\uC624\uD1A1 \uCC44\uB110 \uBC14\uB85C\uAC00\uAE30'} →
                  </a>
                </div>
              )}

              <div className="mt-4 pt-4 border-t text-xs text-gray-400 text-center">
                {'\uB4F1\uB85D\uC77C'}: {formatDate(listing.created_at)}
              </div>
            </div>

            {/* Safety Tips */}
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
              <h3 className="text-sm font-medium text-yellow-800 mb-2">{'\uC548\uC804 \uAC70\uB798 \uD301'}</h3>
              <ul className="text-xs text-yellow-700 space-y-1">
                <li>{'\u2022 \uC9C1\uC811 \uBC29\uBB38\uD558\uC5EC \uB9E4\uBB3C\uC744 \uD655\uC778\uD558\uC138\uC694'}</li>
                <li>{'\u2022 \uB4F1\uAE30\uBD80\uB4F1\uBCF8\uC744 \uBC18\uB4DC\uC2DC \uD655\uC778\uD558\uC138\uC694'}</li>
                <li>{'\u2022 \uACC4\uC57D \uC804 \uC911\uAC1C\uC0AC \uC790\uACA9\uC99D\uC744 \uD655\uC778\uD558\uC138\uC694'}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3 flex gap-3 lg:hidden z-20">
        <button
          onClick={toggleFavorite}
          className={`p-3 rounded-lg border ${isFavorite ? 'border-red-300 text-red-500' : 'border-gray-300 text-gray-400'}`}
        >
          <svg className="w-6 h-6" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
        <Link
            href="/contact"
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium text-center flex items-center justify-center gap-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {'상담신청'}
          </Link>
        <button className="flex-1 bg-yellow-400 text-yellow-900 py-3 rounded-lg font-medium text-center">
          {'\uCE74\uCE74\uC624\uD1A1'}
        </button>
      </div>
    </div>
  );
}
