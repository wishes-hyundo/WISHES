'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, ChevronRight, MapPin, Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { displayTitle } from '@/lib/formatListingTitle';
import { displayAddressByAuth } from '@/lib/publicAddress';
import { useAuth } from '@/contexts/AuthContext';

interface RecentItem {
  id: string;
  visitedAt: number;
}

interface ListingData {
  id: string;
  title: string;
  deal: string;
  price: number;
  deposit: number;
  monthly_rent: number;
  address: string;
  dong?: string | null;
  property_type: string;
  type?: string | null;
  area_m2?: number | null;
  floor_current?: string | number | null;
  floor_total?: string | number | null;
  images: string[];
}

export default function RecentlyViewed() {
  const { user } = useAuth();
  const isAuthed = !!user;
  const [listings, setListings] = useState<ListingData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const stored = JSON.parse(localStorage.getItem('wishes_recent_viewed') || '[]') as RecentItem[];
        if (stored.length === 0) { setLoading(false); return; }

        const recentIds = stored
          .sort((a, b) => b.visitedAt - a.visitedAt)
          .slice(0, 6)
          .map(item => item.id);

        const supabase = createClient();
        const { data } = await supabase
          .from('listings')
          .select('id, title, deal, price, deposit, monthly_rent, address, dong, property_type, type, area_m2, floor_current, floor_total, images')
          .in('id', recentIds);

        if (data) {
          const ordered = recentIds
            .map(id => data.find(d => d.id === id))
            .filter(Boolean) as ListingData[];
          setListings(ordered);
        }
      } catch (e) {
        console.error('Failed to load recent listings:', e);
      } finally {
        setLoading(false);
      }
    };
    loadRecent();
  }, []);

  if (loading || listings.length === 0) return null;

  const formatPrice = (listing: ListingData) => {
    if (listing.deal === '월세') {
      return `${listing.deposit ? (listing.deposit >= 10000 ? (listing.deposit / 10000).toFixed(0) + '억' : listing.deposit) : '0'}/${listing.monthly_rent}만`;
    }
    if (listing.price >= 10000) {
      return (listing.price / 10000).toFixed(listing.price % 10000 === 0 ? 0 : 1) + '억';
    }
    return listing.price + '만';
  };

  return (
    <section className="py-12 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-wishes-green" />
            <h2 className="text-xl font-bold text-gray-900">최근 본 매물</h2>
          </div>
          <Link href="/map" className="flex items-center gap-1 text-sm text-gray-500 hover:text-wishes-green transition-colors">
            더보기 <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {listings.map((listing) => (
            <Link
              key={listing.id}
              href={`/listings/${listing.id}`}
              className="group block bg-gray-50 rounded-xl overflow-hidden hover:shadow-md transition-all"
            >
              <div className="aspect-[4/3] relative bg-gradient-to-br from-wishes-light/60 to-wishes-accent/20 flex items-center justify-center">
                {listing.images && listing.images.length > 0 ? (
                  <img src={listing.images[0]} alt={displayTitle({ ...listing, type: listing.type || listing.property_type } as any)} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-8 h-8 text-wishes-green/30" />
                )}
                <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-wishes-green text-white">
                  {listing.deal}
                </span>
              </div>
              <div className="p-2">
                <p className="text-sm font-bold text-gray-900 truncate">{formatPrice(listing)}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{displayTitle({ ...listing, type: listing.type || listing.property_type } as any)}</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                  <MapPin className="w-3 h-3" />{displayAddressByAuth(listing.address, listing.dong, isAuthed)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
