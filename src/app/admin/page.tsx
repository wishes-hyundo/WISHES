'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Stats {
  totalListings: number;
  activeListings: number;
  contractingListings: number;
  completedListings: number;
  pendingContacts: number;
}

interface Listing {
  id: number;
  title: string;
  type: string;
  deal: string;
  deposit: number;
  monthly?: number | null;
  price?: number | null;
  maintenance_fee?: number;
  area_m2: number;
  area_supply_m2?: number | null;
  floor_current: string;
  floor_total?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  direction?: string | null;
  heating_type?: string | null;
  address: string;
  address_detail?: string | null;
  dong: string;
  description?: string | null;
  available_date?: string | null;
  built_year?: string | null;
  parking?: boolean;
  elevator?: boolean;
  pet?: boolean;
  balcony?: boolean;
  full_option?: boolean;
  loan_available?: boolean;
  status: 'ê°ì©' | 'ê³ì½ì¤' | 'ê³ì½ìë£';
  created_at: string;
  updated_at?: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  listingTitle?: string;
  status: 'ì ì' | 'ì²ë¦¬ì¤' | 'ìë£';
  createdAt?: string;
  created_at?: string;
}

const INITIAL_LISTING = {
  title: '',
  type: 'ìë£¸' as const,
  deal: 'ìì¸' as const,
  deposit: 0,
  monthly: 0,
  price: undefined as number | undefined,
  maintenance_fee: 0,
  area_m2: 0,
  area_supply_m2: undefined as number | undefined,
  floor_current: '',
  floor_total: '',
  rooms: 1,
  bathrooms: 1,
  direction: '',
  heating_type: 'ê°ë³ëë°©',
  address: '',
  address_detail: '',
  dong: '',
  description: '',
  available_date: '',
  built_year: '',
  parking: false,
  elevator: false,
  pet: false,
  balcony: false,
  full_option: false,
  loan_available: true,
  status: 'ê°ì©' as const,
};

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'dashboard';

  // ì¸ì¦
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  // ë°ì´í°
  const [stats, setStats] = useState<Stats | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  // í¼ ìí
  const [showAddForm, setShowAddForm] = useState(false);
  const [newListing, setNewListing] = useState({ ...INITIAL_LISTING });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // ì´ë¯¸ì§ ìë¡ë
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{ url: string; path: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeader = () => `Bearer ${password}`;

  // ì¸ì¦ ì²´í¬
  useEffect(() => {
    const savedPassword = localStorage.getItem('admin_password');
    if (savedPassword) {
      setPassword(savedPassword);
      setIsAuthenticated(true);
      fetchData(savedPassword);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { authorization: getAuthHeader() },
      });
      if (response.ok) {
        localStorage.setItem('admin_password', password);
        setIsAuthenticated(true);
        setAuthError('');
        fetchData(password);
      } else {
        setAuthError('ìí¸ê° ì¬ë°ë¥´ì§ ììµëë¤');
      }
    } catch (error) {
      setAuthError('ì¸ì¦ì ì¤í¨íìµëë¤');
    }
  };

  const fetchData = async (pwd: string) => {
    setLoading(true);
    try {
      const headers = { authorization: `Bearer ${pwd}` };

      const [statsRes, listingsRes, contactsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/listings', { headers }),
        fetch('/api/admin/contacts', { headers }),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.data);
      }
      if (listingsRes.ok) {
        const data = await listingsRes.json();
        setListings(data.data);
      }
      if (contactsRes.ok) {
        const data = await contactsRes.json();
        setContacts(data.data);
      }
    } catch (error) {
      console.error('ë°ì´í° ì¡°í ì¤ë¥:', error);
    } finally {
      setLoading(false);
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(f.type)) { alert(f.name + ' - JPG, PNG, WebP만 가능합니다.'); return false; }
      if (f.size > 5 * 1024 * 1024) { alert(f.name + ' - 5MB를 초과합니다.'); return false; }
      return true;
    });
    if (validFiles.length === 0) return;
    setUploadingImages(true);
    setUploadProgress(0);
    const newImages: { url: string; path: string }[] = [];
    for (let i = 0; i < validFiles.length; i++) {
      const formData = new FormData();
      formData.append('file', validFiles[i]);
      try {
        const response = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { authorization: getAuthHeader() },
          body: formData,
        });
        if (response.ok) {
          const data = await response.json();
          newImages.push({ url: data.data.url, path: data.data.path });
        }
      } catch (error) { console.error('Upload error:', error); }
      setUploadProgress(Math.round(((i + 1) / validFiles.length) * 100));
    }
    setUploadedImages(prev => [...prev, ...newImages]);
    setUploadingImages(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) { await processFiles(files); }
  };

  const handleAddListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      // APIì ë§ê² ë°ì´í° ì ë¦¬
      const payload: Record<string, any> = {
        title: newListing.title,
        type: newListing.type,
        deal: newListing.deal,
        deposit: newListing.deposit || 0,
        area_m2: newListing.area_m2,
        floor_current: newListing.floor_current,
        address: newListing.address,
        dong: newListing.dong,
        status: newListing.status,
      };

      // ì í íë (ê°ì´ ìì ëë§ ì ì¡)
      if (newListing.monthly) payload.monthly = newListing.monthly;
      if (newListing.price) payload.price = newListing.price;
      if (newListing.maintenance_fee) payload.maintenance_fee = newListing.maintenance_fee;
      if (newListing.area_supply_m2) payload.area_supply_m2 = newListing.area_supply_m2;
      if (newListing.floor_total) payload.floor_total = newListing.floor_total;
      if (newListing.rooms) payload.rooms = newListing.rooms;
      if (newListing.bathrooms) payload.bathrooms = newListing.bathrooms;
      if (newListing.direction) payload.direction = newListing.direction;
      if (newListing.heating_type) payload.heating_type = newListing.heating_type;
      if (newListing.address_detail) payload.address_detail = newListing.address_detail;
      if (newListing.description) payload.description = newListing.description;
      if (newListing.available_date) payload.available_date = newListing.available_date;
      if (newListing.built_year) payload.built_year = newListing.built_year;

      // ë¶ë¦° íë
      payload.parking = newListing.parking;
      payload.elevator = newListing.elevator;
      payload.pet = newListing.pet;
      payload.balcony = newListing.balcony;
      payload.full_option = newListing.full_option;
      payload.loan_available = newListing.loan_available;

      const response = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();

        // ì´ë¯¸ì§ê° ìë¡ëëìì¼ë©´ ë§¤ë¬¼ì ì°ê²°
        if (uploadedImages.length > 0 && data.data?.id) {
          for (let i = 0; i < uploadedImages.length; i++) {
            await fetch('/api/admin/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                authorization: getAuthHeader(),
              },
              body: JSON.stringify({
                listingId: data.data.id,
                url: uploadedImages[i].url,
                sort_order: i,
                is_thumbnail: i === 0,
              }),
            });
          }
        }

        setListings([data.data, ...listings]);
        setNewListing({ ...INITIAL_LISTING });
        setUploadedImages([]);
        setShowAddForm(false);
        setSubmitSuccess('ë§¤ë§¤ì´ ì±ê³µì ì¼ë¡ ë±ë¡ëììµëë¤!');
        setTimeout(() => setSubmitSuccess(''), 3000);
      } else {
        const errData = await response.json();
        setSubmitError(errData.error || 'ë§¤ë¬¼ ë±ë¡ì ì¤í¨íìµëë¤');
      }
    } catch (error) {
      console.error('ë§¤ë¬¼ ì¶ê° ì¤ë¥:', error);
      setSubmitError('ë§¤ë¬¼ ë±ë¡ ì¤ ì¤ë¥ê° ë°ìíìµëë¤');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteListing = async (id: number) => {
    if (!confirm('ì ë§ ì­ì íìê² ìµëê¹?')) return;

    try {
      const response = await fetch(`/api/admin/listings/${id}`, {
        method: 'DELETE',
        headers: { authorization: getAuthHeader() },
      });

      if (response.ok) {
        setListings(listings.filter((l) => l.id !== id));
      }
    } catch (error) {
      console.error('ì­ì  ì¤ë¥:', error);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/listings/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: getAuthHeader(),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        setListings(listings.map((l) => (l.id === id ? data.data : l)));
      }
    } catch (error) {
      console.error('ìí ë³ê²½ ì¤ë¥:', error);
    }
  };

  const handleContactStatusChange = async (id: number, newStatus: string) => {
    try {
      const response = await fetch('/api/admin/contacts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: getAuthHeader(),
        },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        setContacts(contacts.map((c) => (c.id === id ? data.data : c)));
      }
    } catch (error) {
      console.error('ìí ë³ê²½ ì¤ë¥:', error);
    }
  };

  // ê°ê²© íì í¬í¼
  const formatPrice = (listing: Listing) => {
    if (listing.deal === 'ë§¤ë§¤') return `ë§¤ë§¤ ${(listing.price || 0).toLocaleString()}ë§ì`;
    if (listing.deal === 'ì ì¸') return `ì ì¸ ${listing.deposit.toLocaleString()}ë§ì`;
    return `${listing.deposit.toLocaleString()}/${listing.monthly || 0}ë§ì`;
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-sm';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

  // âââ ë¡ê·¸ì¸ íë©´ âââ
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wishes-primary to-wishes-secondary p-4">
        <div className="bg-white rounded-2xl shadow-premium p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-wishes-primary mb-2">WISHES</h1>
          <p className="text-gray-600 mb-6">ê´ë¦¬ì ë¡ê·¸ì¸</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="ìí¸ë¥¼ ìë ¥íì¸ì"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
            />
            {authError && <p className="text-red-600 text-sm">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-wishes-secondary text-white py-3 rounded-lg font-semibold hover:bg-wishes-primary transition"
            >
              ë¡ê·¸ì¸
            </button>
          </form>
        </div>
      </div>
    );
  }

  // âââ ëìë³´ë í­ âââ
  if (tab === 'dashboard') {
    return (
      <div>
        <h2 className="text-3xl font-bold text-wishes-primary mb-8">ëìë³´ë</h2>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">ì ì²´ ë§¤ë¬¼</p>
              <p className="text-3xl font-bold text-wishes-primary">{stats.totalListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">ê°ì©</p>
              <p className="text-3xl font-bold text-green-600">{stats.activeListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">ê³ì½ì¤</p>
              <p className="text-3xl font-bold text-wishes-accent">{stats.contractingListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">ê³ì½ìë£</p>
              <p className="text-3xl font-bold text-blue-600">{stats.completedListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">ë¯¸ì²ë¦¬ ìë´</p>
              <p className="text-3xl font-bold text-red-600">{stats.pendingContacts}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a href="/admin?tab=listings" className="card-premium p-6 cursor-pointer hover:shadow-lg transition">
            <p className="text-2xl mb-2">ð </p>
            <h3 className="font-bold text-wishes-primary mb-2">ë§¤ë¬¼ ê´ë¦¬</h3>
            <p className="text-sm text-gray-600">{listings.length}ê°ì ë§¤ë¬¼ ê´ë¦¬</p>
          </a>
          <a href="/admin?tab=contacts" className="card-premium p-6 cursor-pointer hover:shadow-lg transition">
            <p className="text-2xl mb-2">ð</p>
            <h3 className="font-bold text-wishes-primary mb-2">ìë´ ê´ë¦¬</h3>
            <p className="text-sm text-gray-600">{contacts.length}ê°ì ìë´ ê¸°ë¡</p>
          </a>
          <div className="card-premium p-6">
            <p className="text-2xl mb-2">âï¸</p>
            <h3 className="font-bold text-wishes-primary mb-2">ì¤ì </h3>
            <p className="text-sm text-gray-600">ì¬ì´í¸ ì¤ì  ê´ë¦¬</p>
          </div>
        </div>
      </div>
    );
  }

  // âââ ë§¤ë¬¼ ê´ë¦¬ í­ âââ
  if (tab === 'listings') {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-wishes-primary">ë§¤ë¬¼ ê´ë¦¬</h2>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setSubmitError('');
              setSubmitSuccess('');
            }}
            className="bg-wishes-secondary text-white px-6 py-2 rounded-lg hover:bg-wishes-primary transition font-semibold"
          >
            {showAddForm ? 'ì·¨ì' : '+ ì ë§¤ë¬¼ ë±ë¡'}
          </button>
        </div>

        {submitSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {submitSuccess}
          </div>
        )}

        {/* ââ ë§¤ë¬¼ ì¶ê° í¼ ââ */}
        {showAddForm && (
          <div className="card-premium p-6 mb-6">
            <h3 className="text-lg font-bold text-wishes-primary mb-4">ì ë§¤ë¬¼ ë±ë¡</h3>

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {submitError}
              </div>
            )}

            <form onSubmit={handleAddListing} className="space-y-5">
              {/* ê¸°ë³¸ ì ë³´ */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">ê¸°ë³¸ ì ë³´</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-3">
                    <label className={labelClass}>ë§¤ë¬¼ ì ëª© *</label>
                    <input
                      type="text"
                      placeholder="ì: ì ë¦¼ë ì­ì¸ê¶ ì ì¶ ìë£¸"
                      value={newListing.title}
                      onChange={(e) => setNewListing({ ...newListing, title: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ë§¤ë¬¼ ì í *</label>
                    <select
                      value={newListing.type}
                      onChange={(e) => setNewListing({ ...newListing, type: e.target.value as any })}
                      className={inputClass}
                    >
                      <option value="ìë£¸">ìë£¸</option>
                      <option value="í¬ë£¸">í¬ë£¸</option>
                      <option value="ì°ë¦¬ë£¸">ì°ë¦¬ë£¸</option>
                      <option value="ì¤í¼ì¤í">ì¤í¼ì¤í</option>
                      <option value="ìíí¸">ìíí¸</option>
                      <option value="ìê°">ìê°</option>
                      <option value="ì¬ë¬´ì¤">ì¬ë¬´ì¤</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>ê±°ë ì í *</label>
                    <select
                      value={newListing.deal}
                      onChange={(e) => setNewListing({ ...newListing, deal: e.target.value as any })}
                      className={inputClass}
                    >
                      <option value="ì ì¸">ì ì¸</option>
                      <option value="ìì¸">ìì¸</option>
                      <option value="ë§¤ë§¤">ë§¤ë§¤</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>ìí</label>
                    <select
                      value={newListing.status}
                      onChange={(e) => setNewListing({ ...newListing, status: e.target.value as any })}
                      className={inputClass}
                    >
                      <option value="ê°ì©">ê°ì©</option>
                      <option value="ê³ì½ì¤">ê³ì½ì¤</option>
                      <option value="ê³ì½ìë£">ê³ì½ìë£</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ê°ê²© ì ë³´ */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">ê°ê²© ì ë³´ (ë§ì)</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className={labelClass}>ë³´ì¦ê¸ *</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newListing.deposit || ''}
                      onChange={(e) => setNewListing({ ...newListing, deposit: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ìì¸</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newListing.monthly || ''}
                      onChange={(e) => setNewListing({ ...newListing, monthly: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ë§¤ë§¤ê°</label>
                    <input
                      type="number"
                      placeholder="ë§¤ë§¤ì ìë ¥"
                      value={newListing.price || ''}
                      onChange={(e) => setNewListing({ ...newListing, price: e.target.value ? parseInt(e.target.value) : undefined })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ê´ë¦¬ë¹</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newListing.maintenance_fee || ''}
                      onChange={(e) => setNewListing({ ...newListing, maintenance_fee: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* ìì¹ ì ë³´ */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">ìì¹ ì ë³´</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className={labelClass}>ì£¼ì *</label>
                    <input
                      type="text"
                      placeholder="ì: ìì¸ ê´ìêµ¬ ì ë¦¼ë¡ 267"
                      value={newListing.address}
                      onChange={(e) => setNewListing({ ...newListing, address: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ë *</label>
                    <input
                      type="text"
                      placeholder="ì: ì ë¦¼ë"
                      value={newListing.dong}
                      onChange={(e) => setNewListing({ ...newListing, dong: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className={labelClass}>ìì¸ ì£¼ì</label>
                    <input
                      type="text"
                      placeholder="ì: 301í¸"
                      value={newListing.address_detail}
                      onChange={(e) => setNewListing({ ...newListing, address_detail: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* ë©´ì /ì¸µì */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">í¨ì  / ì¸µì¬ / êµ¬ì¡°</p>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label className={labelClass}>ì ì©ë©´ì (m2) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="19.83"
                      value={newListing.area_m2 || ''}
                      onChange={(e) => setNewListing({ ...newListing, area_m2: parseFloat(e.target.value) || 0 })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ê³µê¸ë©´ì (m2)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="26.45"
                      value={newListing.area_supply_m2 || ''}
                      onChange={(e) => setNewListing({ ...newListing, area_supply_m2: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>í´ë¹ ì¸µ *</label>
                    <input
                      type="text"
                      placeholder="3"
                      value={newListing.floor_current}
                      onChange={(e) => setNewListing({ ...newListing, floor_current: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ì´ ì¸µ</label>
                    <input
                      type="text"
                      placeholder="5"
                      value={newListing.floor_total}
                      onChange={(e) => setNewListing({ ...newListing, floor_total: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ë°© ì</label>
                    <input
                      type="number"
                      placeholder="1"
                      value={newListing.rooms || ''}
                      onChange={(e) => setNewListing({ ...newListing, rooms: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ìì¤ ì</label>
                    <input
                      type="number"
                      placeholder="1"
                      value={newListing.bathrooms || ''}
                      onChange={(e) => setNewListing({ ...newListing, bathrooms: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* ì¶ê° ì ë³´ */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">ì¶ê° ì ë³´</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className={labelClass}>ë°©í¥</label>
                    <select
                      value={newListing.direction}
                      onChange={(e) => setNewListing({ ...newListing, direction: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">ì í</option>
                      <option value="ëí¥">ëí¥</option>
                      <option value="ìí¥">ìí¥</option>
                      <option value="ë¨í¥">ë¨í¥</option>
                      <option value="ë¶í¥">ë¶í¥</option>
                      <option value="ë¨ëí¥">ë¨ëí¥</option>
                      <option value="ë¨ìí¥">ë¨ìí¥</option>
                      <option value="ë¶ëí¥">ë¶ëí¥</option>
                      <option value="ë¶ìí¥">ë¶ìí¥</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>ëë°© ë°©ì</label>
                    <select
                      value={newListing.heating_type}
                      onChange={(e) => setNewListing({ ...newListing, heating_type: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">ì í</option>
                      <option value="ê°ë³ëë°©">ê°ë³ëë°©</option>
                      <option value="ì¤ìëë°©">ì¤ìëë°©</option>
                      <option value="ì§ì­ëë°©">ì§ì­ëë°©</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>ìì£¼ê°ë¥ì¼</label>
                    <input
                      type="text"
                      placeholder="ì¦ììì£¼ / 2026-04-01"
                      value={newListing.available_date}
                      onChange={(e) => setNewListing({ ...newListing, available_date: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ì¤ê³µì°ë</label>
                    <input
                      type="text"
                      placeholder="2020"
                      value={newListing.built_year}
                      onChange={(e) => setNewListing({ ...newListing, built_year: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* í¸ììì¤ ìµì */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">í¸ììì¤ / ìµì</p>
                <div className="flex flex-wrap gap-4">
                  {[
                    { key: 'parking', label: 'ì£¼ì°¨' },
                    { key: 'elevator', label: 'ìë¦¬ë² ì´í°' },
                    { key: 'pet', label: 'ë°ë ¤ëë¬¼' },
                    { key: 'balcony', label: 'ë² ëë¤/ë°ì½ë' },
                    { key: 'full_option', label: 'íìµì' },
                    { key: 'loan_available', label: 'ëì¶ê°ë¥' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={(newListing as any)[key]}
                        onChange={(e) => setNewListing({ ...newListing, [key]: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* ì¤ëª */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">ë§¤ë¬¼ ì¤ëª</p>
                <textarea
                  placeholder="ë§¤ë¬¼ì ëí ìì¸ ì¤ëªì ìë ¥íì¸ì"
                  value={newListing.description}
                  onChange={(e) => setNewListing({ ...newListing, description: e.target.value })}
                  className={inputClass}
                  rows={4}
                />
              </div>

              {/* ì´ë¯¸ì§ ìë¡ë */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">매물 이미지</p>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
                    isDragOver
                      ? 'border-yellow-400 bg-yellow-50 scale-[1.02] shadow-lg'
                      : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageUpload} className="hidden" />
                  <div className="flex flex-col items-center gap-3">
                    {isDragOver ? (
                      <>
                        <svg className="w-12 h-12 text-yellow-500 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                        <p className="text-lg font-bold text-gray-800">여기에 놓으세요!</p>
                      </>
                    ) : (
                      <>
                        <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <div>
                          <p className="text-sm font-semibold text-gray-700">사진을 드래그하여 놓거나 클릭하세요</p>
                          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP / 최대 5MB / 여러 장 동시 업로드 가능</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {uploadingImages && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-4 h-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      <p className="text-sm text-gray-600">업로드 중... {uploadProgress}%</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-gradient-to-r from-blue-500 to-yellow-400 h-2 rounded-full transition-all duration-300" style={{ width: uploadProgress + '%' }} />
                    </div>
                  </div>
                )}
                {uploadedImages.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">업로드된 이미지 ({uploadedImages.length}장)</p>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                      {uploadedImages.map((img, i) => (
                        <div key={i} className="relative group aspect-square">
                          <img src={img.url} alt={`매물 사진 ${i + 1}`} className="w-full h-full object-cover rounded-lg border border-gray-200 shadow-sm group-hover:shadow-md transition" />
                          {i === 0 && <span className="absolute top-1 left-1 bg-yellow-400 text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded">대표</span>}
                          <button type="button" onClick={(e) => { e.stopPropagation(); setUploadedImages(uploadedImages.filter((_, idx) => idx !== i)); }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ë±ë¡ ë²í¼ */}
              <button
                type="submit"
                disabled={submitLoading}
                className="w-full bg-wishes-secondary text-white py-3 rounded-lg hover:bg-wishes-primary transition font-bold text-lg disabled:opacity-50"
              >
                {submitLoading ? 'ë±ë¡ ì¤...' : 'ë§¤ë¬¼ ë±ë¡íê¸°'}
              </button>
            </form>
          </div>
        )}

        {/* ââ ë§¤ë¬¼ ëª©ë¡ ââ */}
        <div className="space-y-3">
          {listings.length === 0 ? (
            <div className="card-premium p-8 text-center text-gray-600">
              ë±ë¡ë ë§¤ë¬¼ì´ ììµëë¤. ìì &quot;ì ë§¤ë¬¼ ë±ë¡&quot; ë²í¼ì í´ë¦­í´ì ë§¤ë¬¼ì ì¶ê°í´ë³´ì¸ì.
            </div>
          ) : (
            listings.map((listing) => (
              <div key={listing.id} className="card-premium p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-wishes-primary">{listing.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {listing.address} | {listing.type} | {listing.deal}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center ml-4">
                    <select
                      value={listing.status}
                      onChange={(e) => handleStatusChange(listing.id, e.target.value)}
                      className={`px-2 py-1 border rounded-lg text-xs font-medium ${
                        listing.status === 'ê°ì©'
                          ? 'border-green-300 text-green-700 bg-green-50'
                          : listing.status === 'ê³ì½ì¤'
                          ? 'border-orange-300 text-orange-700 bg-orange-50'
                          : 'border-blue-300 text-blue-700 bg-blue-50'
                      }`}
                    >
                      <option value="ê°ì©">ê°ì©</option>
                      <option value="ê³ì½ì¤">ê³ì½ì¤</option>
                      <option value="ê³ì½ìë£">ê³ì½ìë£</option>
                    </select>
                    <button
                      onClick={() => handleDeleteListing(listing.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-xs"
                    >
                      ì­ì 
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">ê°ê²©</p>
                    <p className="font-semibold text-wishes-primary">{formatPrice(listing)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">ë©´ì </p>
                    <p className="font-semibold">{listing.area_m2}mÂ²</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">ì¸µ</p>
                    <p className="font-semibold">
                      {listing.floor_current}{listing.floor_total ? `/${listing.floor_total}` : ''}ì¸µ
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">ë°©/ìì¤</p>
                    <p className="font-semibold">
                      {listing.rooms || '-'}ë°© / {listing.bathrooms || '-'}ìì¤
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">ë±ë¡ì¼</p>
                    <p className="font-semibold text-xs">
                      {new Date(listing.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // âââ ìë´ ê´ë¦¬ í­ âââ
  if (tab === 'contacts') {
    return (
      <div>
        <h2 className="text-2xl font-bold text-wishes-primary mb-6">ìë´ ê´ë¦¬</h2>

        <div className="space-y-3">
          {contacts.length === 0 ? (
            <div className="card-premium p-8 text-center text-gray-600">
              ìë´ ë´ì­ì´ ììµëë¤
            </div>
          ) : (
            contacts.map((contact) => (
              <div key={contact.id} className="card-premium p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-wishes-primary">{contact.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {contact.phone}
                      {contact.email && ` | ${contact.email}`}
                    </p>
                    {contact.listingTitle && (
                      <p className="text-sm text-wishes-secondary font-medium mt-1">
                        ð {contact.listingTitle}
                      </p>
                    )}
                  </div>
                  <select
                    value={contact.status}
                    onChange={(e) => handleContactStatusChange(contact.id, e.target.value)}
                    className={`px-2 py-1 border rounded-lg text-xs font-medium ${
                      contact.status === 'ì ì'
                        ? 'border-red-300 text-red-700 bg-red-50'
                        : contact.status === 'ì²ë¦¬ì¤'
                        ? 'border-yellow-300 text-yellow-700 bg-yellow-50'
                        : 'border-green-300 text-green-700 bg-green-50'
                    }`}
                  >
                    <option value="ì ì">ì ì</option>
                    <option value="ì²ë¦¬ì¤">ì²ë¦¬ì¤</option>
                    <option value="ìë£">ìë£</option>
                  </select>
                </div>

                {contact.message && (
                  <p className="text-gray-700 text-sm mb-3 p-3 bg-gray-50 rounded-lg">
                    {contact.message}
                  </p>
                )}

                <p className="text-xs text-gray-400">
                  {new Date(contact.createdAt || contact.created_at || '').toLocaleString('ko-KR')}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return null;
}
