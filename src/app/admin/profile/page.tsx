'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /admin/profile — 중개사 프로필 편집 페이지
//   AgentContactModal 에 노출되는 모든 필드를 중개사가 직접 편집.
//
// 편집 항목:
//   - 프로필 사진 (R2 업로드)
//   - 이름, 휴대폰
//   - 사무소명, 사무소 전화, 사무소 주소
//   - 공인중개사 등록번호, 경력(년차)
//
// 의존성:
//   - GET /api/profile (본인 프로필 조회)
//   - PUT /api/profile (본인 프로필 수정; L-agent-profile 필드 포함)
//   - POST /api/admin/upload (avatar 파일 → R2 → URL 획득)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState } from 'react';
import { useAdminSession } from '@/lib/useAdminSession';
import { adminFetch } from '@/lib/adminFetch';
import { Camera, Loader2, Check } from 'lucide-react';

interface ProfileData {
  id?: string;
  name: string;
  phone: string;
  avatar_url: string | null;
  office_name: string;
  office_phone: string;
  office_address: string;
  registration_no: string;
  career_years: number | null;
}

const INITIAL: ProfileData = {
  name: '',
  phone: '',
  avatar_url: null,
  office_name: '',
  office_phone: '',
  office_address: '',
  registration_no: '',
  career_years: null,
};

export default function AgentProfilePage() {
  const { token, loading: sessionLoading, authHeader } = useAdminSession('/admin/profile');
  const [form, setForm] = useState<ProfileData>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 초기 로드
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await adminFetch('/api/profile', { headers: { ...authHeader() } });
        if (!r.ok) { setLoading(false); return; }
        const data = await r.json();
        setForm({
          id: data.id,
          name: data.name || '',
          phone: data.phone || '',
          avatar_url: data.avatar_url || null,
          office_name: data.office_name || '',
          office_phone: data.office_phone || '',
          office_address: data.office_address || '',
          registration_no: data.registration_no || '',
          career_years: (typeof data.career_years === 'number' ? data.career_years : null),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [token, authHeader]);

  // 토스트 자동 숨김
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // 프로필 사진 업로드
  const handleAvatarChange = async (file: File) => {
    if (!file.type.startsWith('image/')) { setToast({ type: 'err', text: '이미지 파일만 가능합니다.' }); return; }
    if (file.size > 5 * 1024 * 1024) { setToast({ type: 'err', text: '이미지는 5MB 이하.' }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await adminFetch('/api/admin/upload', {
        method: 'POST',
        headers: { ...authHeader() },
        body: fd,
      });
      const json = await r.json();
      if (!r.ok || !json?.url) throw new Error(json?.error || '업로드 실패');
      setForm(prev => ({ ...prev, avatar_url: json.url }));
      setToast({ type: 'ok', text: '프로필 사진 업로드 완료' });
    } catch (e: any) {
      setToast({ type: 'err', text: e?.message || '업로드 실패' });
    } finally {
      setUploading(false);
    }
  };

  // 저장
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        avatar_url: form.avatar_url,
        office_name: form.office_name || null,
        office_phone: form.office_phone || null,
        office_address: form.office_address || null,
        registration_no: form.registration_no || null,
        career_years: form.career_years,
      };
      const r = await adminFetch('/api/profile', {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error || '저장 실패');
      setToast({ type: 'ok', text: '프로필 저장 완료' });
    } catch (e: any) {
      setToast({ type: 'err', text: e?.message || '저장 실패' });
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> 프로필을 불러오는 중...
      </div>
    );
  }

  const initials = (form.name || '중개사').trim().slice(0, 3);

  return (
    <div className="max-w-2xl mx-auto p-6 md:p-10">
      <h1 className="text-2xl font-bold mb-1">중개사 프로필</h1>
      <p className="text-sm text-gray-500 mb-8">매물 상세 페이지 · 지도 패널 담당자 모달에 노출됩니다.</p>

      {/* 프로필 사진 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">프로필 사진</h2>
        <div className="flex items-center gap-5">
          <div className="relative">
            {form.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.avatar_url} alt="프로필 사진" className="w-24 h-24 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-wishes-primary/10 text-wishes-primary flex items-center justify-center font-semibold text-lg">
                {initials}
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && handleAvatarChange(e.target.files[0])} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">
              <Camera className="w-4 h-4" /> 사진 변경
            </button>
            <p className="text-xs text-gray-400 mt-2">JPG / PNG / WebP · 최대 5MB</p>
          </div>
        </div>
      </div>

      {/* 개인 정보 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">개인 정보</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">이름</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/30" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">휴대폰</label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="010-1234-5678"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/30" />
          </div>
        </div>
      </div>

      {/* 사무소 정보 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-bold text-gray-700 mb-4">사무소 정보</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">사무소명</label>
            <input type="text" value={form.office_name} onChange={e => setForm({ ...form, office_name: e.target.value })} placeholder="예: 단비공인중개사사무소"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/30" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">사무소 전화</label>
            <input type="tel" value={form.office_phone} onChange={e => setForm({ ...form, office_phone: e.target.value })} placeholder="02-123-4567"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/30" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">등록번호</label>
            <input type="text" value={form.registration_no} onChange={e => setForm({ ...form, registration_no: e.target.value })} placeholder="예: 11620-2024-00123"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/30" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">사무소 주소</label>
            <input type="text" value={form.office_address} onChange={e => setForm({ ...form, office_address: e.target.value })} placeholder="예: 서울시 관악구 봉천로 485"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/30" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">경력 (년)</label>
            <input type="number" min={0} max={60}
              value={form.career_years === null ? '' : form.career_years}
              onChange={e => setForm({ ...form, career_years: e.target.value === '' ? null : Math.max(0, Math.min(60, Number(e.target.value))) })}
              placeholder="예: 6"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/30" />
          </div>
        </div>
      </div>

      {/* 저장 */}
      <div className="sticky bottom-4 bg-white border border-gray-200 rounded-2xl p-3 flex items-center justify-end gap-3 shadow-lg">
        {toast && (
          <span className={`text-xs flex items-center gap-1 ${toast.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {toast.type === 'ok' && <Check className="w-3 h-3" />} {toast.text}
          </span>
        )}
        <button type="button" onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-wishes-primary text-white text-sm font-semibold hover:brightness-110 active:scale-[0.98] disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          저장
        </button>
      </div>
    </div>
  );
}
