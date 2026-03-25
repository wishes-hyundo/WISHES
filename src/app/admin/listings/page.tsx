'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Listing {
  id: number;
  title: string;
  type: string;
  deal: string;
  deposit: number;
  monthly: number;
  price: number | null;
  address: string;
  dong: string;
  status: string;
  created_at: string;
  views: number;
  area_m2: number;
  floor_current: string;
  rooms: number;
  bathrooms: number;
}

export default function AdminListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/listings');
      const data = await res.json();
      if (data.success) {
        setListings(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch listings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setListings(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
      }
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (typeof window !== 'undefined' && !window.confirm('\uc815\ub9d0 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?')) return;
    try {
      const res = await fetch(`/api/admin/listings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setListings(prev => prev.filter(l => l.id !== id));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filteredListings = listings.filter(l => {
    const matchesFilter = filter === 'all' || l.status === filter;
    const matchesSearch = !searchTerm || 
      l.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.dong?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(l.id).includes(searchTerm);
    return matchesFilter && matchesSearch;
  });

  const statusColors: Record<string, string> = {
    '\uac00\uc6a9': 'bg-green-100 text-green-800',
    '\uacc4\uc57d\uc911': 'bg-yellow-100 text-yellow-800',
    '\uacc4\uc57d\uc644\ub8cc': 'bg-gray-100 text-gray-600',
  };

  const formatPrice = (listing: Listing) => {
    if (listing.deal === '\ub9e4\ub9e4' && listing.price) {
      return `${(listing.price / 10000).toFixed(0)}\uc5b5`;
    }
    if (listing.deal === '\uc804\uc138') {
      return `\uc804\uc138 ${listing.deposit >= 10000 ? (listing.deposit / 10000).toFixed(1) + '\uc5b5' : listing.deposit + '\ub9cc'}`;
    }
    return `${listing.deposit}/${listing.monthly}\ub9cc`;
  };

  const statusCounts = {
    all: listings.length,
    '\uac00\uc6a9': listings.filter(l => l.status === '\uac00\uc6a9').length,
    '\uacc4\uc57d\uc911': listings.filter(l => l.status === '\uacc4\uc57d\uc911').length,
    '\uacc4\uc57d\uc644\ub8cc': listings.filter(l => l.status === '\uacc4\uc57d\uc644\ub8cc').length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">\ub9e4\ubb3c \uad00\ub9ac</h1>
          <p className="text-gray-500 mt-1">\uc804\uccb4 {listings.length}\uac1c\uc758 \ub9e4\ubb3c</p>
        </div>
        <button
          onClick={() => router.push('/admin/listings/new')}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
        >
          <span>+</span> \uc0c8 \ub9e4\ubb3c \ub4f1\ub85d
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4">
        {Object.entries(statusCounts).map(([key, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {key === 'all' ? '\uc804\uccb4' : key} ({count})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="\ub9e4\ubb3c\ubc88\ud638, \uc81c\ubaa9, \uc8fc\uc18c, \ub3d9\uba85\uc73c\ub85c \uac80\uc0c9..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Listings table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">\ub85c\ub529 \uc911...</div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-12 text-gray-500">\ub9e4\ubb3c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">\ub9e4\ubb3c\uc815\ubcf4</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">\uc720\ud615</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">\uac00\uaca9</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">\uc0c1\ud0dc</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">\ub4f1\ub85d\uc77c</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">\uad00\ub9ac</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredListings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500">{listing.id}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{listing.title || '(\uc81c\ubaa9 \uc5c6\uc74c)'}</div>
                    <div className="text-xs text-gray-500">{listing.address} {listing.dong}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{listing.type}</span>
                    <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded ml-1">{listing.deal}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatPrice(listing)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={listing.status}
                      onChange={(e) => handleStatusChange(listing.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${statusColors[listing.status] || 'bg-gray-100'}`}
                    >
                      <option value="\uac00\uc6a9">\uac00\uc6a9</option>
                      <option value="\uacc4\uc57d\uc911">\uacc4\uc57d\uc911</option>
                      <option value="\uacc4\uc57d\uc644\ub8cc">\uacc4\uc57d\uc644\ub8cc</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {listing.created_at ? new Date(listing.created_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(listing.id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                    >
                      \uc0ad\uc81c
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}