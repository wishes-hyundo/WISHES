'use client';

import { useState } from 'react';
import { X, Check, MapPin, Building2, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createAuthClient } from '@/lib/supabase';

const AREA_OPTIONS = ['강남/서초', '송파/강동', '마포/용산', '성동/광진', '종로/중구', '강서/양천', '영등포/동작', '관악/금천', '노원/도봉', '구로/은평', '경기 남부', '경기 북부', '경기 서부', '경기 동부'];
const TYPE_OPTIONS = ['원룸', '투룸', '쓰리룸+', '오피스텔', '아파트', '빌라/연립', '상가/사무실', '토지/건물'];

interface ProfileCompletionProps {
  onComplete: () => void;
}

export default function ProfileCompletion({ onComplete }: ProfileCompletionProps) {
  const { user, session } = useAuth();
  const [name, setName] = useState(user?.user_metadata?.full_name || user?.user_metadata?.name || '');
  const [phone, setPhone] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  const toggleArea = (area: string) => {
    setSelectedAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : prev.length < 5 ? [...prev, area] : prev);
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : prev.length < 4 ? [...prev, type] : prev);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
        body: JSON.stringify({ name, phone, preferred_areas: selectedAreas, preferred_types: selectedTypes }),
      });
      if (resp.ok) onComplete();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSkip = async () => {
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
        body: JSON.stringify({ name: name || '', phone: '', preferred_areas: [], preferred_types: [] }),
      });
    } catch {}
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[480px] mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button onClick={handleSkip} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors z-10" aria-label="건너뛰기">
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {/* 헤더 */}
        <div className="pt-8 pb-4 px-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center shadow-lg">
            <User className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">프로필을 완성해주세요</h2>
          <p className="text-sm text-gray-500 mt-1.5">맞춤 매물 추천과 알림을 받으실 수 있어요</p>
          {/* 스텝 인디케이터 */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {[1, 2].map(s => (
              <div key={s} className={'w-8 h-1 rounded-full transition-colors ' + (s <= step ? 'bg-wishes-secondary' : 'bg-gray-200')} />
            ))}
          </div>
        </div>

        <div className="px-8 pb-8">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">이름</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="이름을 입력하세요" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-wishes-secondary focus:ring-2 focus:ring-wishes-secondary/20 outline-none transition-all text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">연락처 <span className="text-gray-400 font-normal">(선택)</span></label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-wishes-secondary focus:ring-2 focus:ring-wishes-secondary/20 outline-none transition-all text-sm" />
              </div>
              <button onClick={() => setStep(2)} className="w-full py-3.5 bg-wishes-secondary text-white rounded-xl font-semibold text-sm hover:bg-wishes-secondary/90 transition-colors">다음</button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-1" />관심 지역 <span className="text-gray-400 font-normal">(최대 5개)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {AREA_OPTIONS.map(area => (
                    <button key={area} onClick={() => toggleArea(area)} className={'px-3 py-2 rounded-lg text-xs font-medium border transition-all ' + (selectedAreas.includes(area) ? 'bg-wishes-secondary text-white border-wishes-secondary' : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-secondary/50')}>
                      {area}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Building2 className="w-4 h-4 inline mr-1" />관심 유형 <span className="text-gray-400 font-normal">(최대 4개)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map(type => (
                    <button key={type} onClick={() => toggleType(type)} className={'px-3 py-2 rounded-lg text-xs font-medium border transition-all ' + (selectedTypes.includes(type) ? 'bg-wishes-accent text-white border-wishes-accent' : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-accent/50')}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">이전</button>
                <button onClick={handleSubmit} disabled={saving} className="flex-[2] py-3.5 bg-wishes-secondary text-white rounded-xl font-semibold text-sm hover:bg-wishes-secondary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? '저장 중...' : <><Check className="w-4 h-4" />완료</>}
                </button>
              </div>
            </div>
          )}

          <button onClick={handleSkip} className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">나중에 할게요</button>
        </div>
      </div>
    </div>
  );
}