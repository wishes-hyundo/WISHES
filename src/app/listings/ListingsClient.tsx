'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import Image from 'next/image';
import Link from 'next/link';

const supabase = createClient();

interface Listing {
  id: number;
  title: string;
  property_type: string;
  transaction_type: string;
  price: string;
  area_size: string;
  address: string;
  description: string;
  status: string;
  created_at: string;
  listing_images: { image_url: string; is_primary: boolean }[];
}

export default function ListingsClient() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ property_type: '', transaction_type: '' });

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('*, listing_images(image_url, is_primary)')
          .eq('status', 'active')
          .order('created_at', { ascending: false });
        if (!error && data) setListings(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = listings.filter(l => {
    if (filter.property_type && l.property_type !== filter.property_type) return false;
    if (filter.transaction_type && l.transaction_type !== filter.transaction_type) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-48" />
            <div className="flex gap-3">
              <div className="h-10 bg-gray-200 rounded w-24" />
              <div className="h-10 bg-gray-200 rounded w-24" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="bg-white rounded-xl overflow-hidden shadow">
                  <div className="h-48 bg-gray-200" />
                  <div className="p-4 space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          WISHES
        </h1>

        <div className="flex gap-3 mb-6 flex-wrap">
          <select
            value={filter.property_type}
            onChange={e => setFilter(f => ({ ...f, property_type: e.target.value }))}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="">\uC804\uCCB4 \uC720\uD615</option>
            <option value="\uC6D0\uB8F8">\uC6D0\uB8F8</option>
            <option value="\uD22C\uB8F8">\uD22C\uB8F8</option>
            <option value="\uC624\uD53C\uC2A4\uD154">\uC624\uD53C\uC2A4\uD154</option>
            <option value="\uC544\uD30C\uD2B8">\uC544\uD30C\uD2B8</option>
          </select>
          <select
            value={filter.transaction_type}
            onChange={e => setFilter(f => ({ ...f, transaction_type: e.target.value }))}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="">\uC804\uCCB4 \uAC70\uB798</option>
            <option value="\uC6D4\uC138">\uC6D4\uC138</option>
            <option value="\uC804\uC138">\uC804\uC138</option>
            <option value="\uB9E4\uB9E4">\uB9E4\uB9E4</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">\uB4F1\uB85D\uB41C \uB9E4\uBB3C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(listing => {
              const img = listing.listing_images?.find(i => i.is_primary) || listing.listing_images?.[0];
              return (
                <Link key={listing.id} href={'/listings/' + listing.id}
                  className="bg-white rounded-xl overflow-hidden shadow hover:shadow-lg transition-shadow">
                  <div className="relative h-48 bg-gray-100">
                    {img ? (
                      <Image src={img.image_url} alt={listing.title} fill className="object-cover" sizes="(max-width:768px) 100vw, (max-width:1200px) 50vw, 33vw" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">No Image</div>
                    )}
                    <span className="absolute top-2 left-2 px-2 py-1 bg-blue-600 text-white text-xs rounded">{listing.transaction_type}</span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-1 truncate">{listing.title}</h3>
                    <p className="text-blue-600 font-bold text-lg mb-1">{listing.price}</p>
                    <p className="text-sm text-gray-500 truncate">{listing.address}</p>
                    <div className="flex gap-2 mt-2 text-xs text-gray-400">
                      <span>{listing.property_type}</span>
                      <span>{listing.area_size}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}