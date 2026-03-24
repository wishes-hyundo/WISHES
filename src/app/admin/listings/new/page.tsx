'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, MapPin, Banknote, Ruler, Image as ImageIcon, 
  FileText, ChevronRight, ChevronLeft, Check, Plus, X,
  Home, Store, Briefcase, ArrowUp, ThermometerSun,
  Car, Dog, Maximize2, Sofa, CreditCard, Calendar,
  Upload, AlertCircle, CheckCircle2, Loader2
} from 'lucide-react';

type ListingType = '원룸' | '투룸' | '쓰리룸' | '오피스텔' | '아파트' | '상가' | '사무실';
type DealType = '전세' | '월세' | '매매';

interface FormData {
  // Step 1: 기본 정보
  type: ListingType | '';
  deal: DealType | '';
  // Step 2: 위치
  address: string;
  address_detail: string;
  dong: string;
  floor_current: string;
  floor_total: string;
  // Step 3: 가격
  deposit: string;
  monthly: string;
  price: string;
  maintenance_fee: string;
  maintenance_includes: string[];
  // Step 4: 상세
  title: string;
  area_m2: string;
  area_supply_m2: string;
  rooms: string;
  bathrooms: string;
  direction: string;
  heating_type: string;
  built_year: string;
  available_date: string;
  // Step 5: 옵션/특징
  parking: boolean;
  elevator: boolean;
  pet: boolean;
  balcony: boolean;
  full_option: boolean;
  loan_available: boolean;
  features: string[];
  // Step 6: 사진/설명
  description: string;
  images: File[];
  imagePreviews: string[];
}

const STEPS = [
  { id: 1, title: '매물 유형', icon: Building2, desc: '매물과 거래 유형 선택' },
  { id: 2, title: '위치 정보', icon: MapPin, desc: '주소 및 층수 정보' },
  { id: 3, title: '가격 정보', icon: Banknote, desc: '보증금, 월세, 관리비' },
  { id: 4, title: '상세 정보', icon: Ruler, desc: '면적, 방/욕실, 방향' },
  { id: 5, title: '옵션/특징', icon: Sofa, desc: '주차, 엘리베이터, 반려동물' },
  { id: 6, title: '사진/설명', icon: ImageIcon, desc: '사진 업로드 및 상세 설명' },
];

const LISTING_TYPES: { value: ListingType; icon: any; label: string }[] = [
  { value: '원룸', icon: Home, label: '원룸' },
  { value: '투룸', icon: Home, label: '투룸' },
  { value: '쓰리룸', icon: Home, label: '쓰리룸+' },
  { value: '오피스텔', icon: Building2, label: '오피스텔' },
  { value: '아파트', icon: Building2, label: '아파트' },
  { value: '상가', icon: Store, label: '상가' },
  { value: '사무실', icon: Briefcase, label: '사무실' },
];

const DEAL_TYPES: { value: DealType; color: string }[] = [
  { value: '전세', color: 'bg-blue-500' },
  { value: '월세', color: 'bg-wishes-accent' },
  { value: '매매', color: 'bg-red-500' },
];

const DIRECTIONS = ['남향', '남동향', '동향', '북동향', '북향', '북서향', '서향', '남서향'];
const HEATING_TYPES = ['개별난방', '중앙난방', '지역난방'];
const MAINTENANCE_OPTIONS = ['수도', '전기', '가스', '인터넷', 'TV', '청소', '주차'];

export default function ListingRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<FormData>({
    type: '', deal: '',
    address: '', address_detail: '', dong: '', floor_current: '', floor_total: '',
    deposit: '', monthly: '', price: '', maintenance_fee: '', maintenance_includes: [],
    title: '', area_m2: '', area_supply_m2: '', rooms: '', bathrooms: '',
    direction: '', heating_type: '', built_year: '', available_date: '',
    parking: false, elevator: false, pet: false, balcony: false,
    full_option: false, loan_available: false, features: [],
    description: '', images: [], imagePreviews: [],
  });

  const updateForm = useCallback((updates: Partial<FormData>) => {
    setForm(prev => ({ ...prev, ...updates }));
    // Clear errors for updated fields
    const keys = Object.keys(updates);
    setErrors(prev => {
      const next = { ...prev };
      keys.forEach(k => delete next[k]);
      return next;
    });
  }, []);

  const validateStep = (s: number): boolean => {
    const newErrors: Record<string, string> = {};
    if (s === 1) {
      if (!form.type) newErrors.type = '매물 유형을 선택해주세요';
      if (!form.deal) newErrors.deal = '거래 유형을 선택해주세요';
    } else if (s === 2) {
      if (!form.address) newErrors.address = '주소를 입력해주세요';
      if (!form.dong) newErrors.dong = '동(벏리)를 입력해주세요';
      if (!form.floor_current) newErrors.floor_current = '해당 층을 입력해주세요';
    } else if (s === 3) {
      if (form.deal !== '매매' && !form.deposit) newErrors.deposit = '보증금을 입력해주세요';
      if (form.deal === '월세' && !form.monthly) newErrors.monthly = '월세를 입력해주세요';
      if (form.deal === '매매' && !form.price) newErrors.price = '매매가를 입력해주세요';
    } else if (s === 4) {
      if (!form.title) newErrors.title = '제목을 입력해주세요';
      if (!form.area_m2) newErrors.area_m2 = '전용면적을 입력해주세요';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) setStep(s => Math.min(s + 1, 6));
  };
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (form.images.length + files.length > 15) {
      alert('사진은 최대 15장까지 업로드 가능합니다.');
      return;
    }
    const newPreviews = files.map(f => URL.createObjectURL(f));
    updateForm({
      images: [...form.images, ...files],
      imagePreviews: [...form.imagePreviews, ...newPreviews],
    });
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(form.imagePreviews[index]);
    updateForm({
      images: form.images.filter((_, i) => i !== index),
      imagePreviews: form.imagePreviews.filter((_, i) => i !== index),
    });
  };

  const toggleMaintenance = (item: string) => {
    updateForm({
      maintenance_includes: form.maintenance_includes.includes(item)
        ? form.maintenance_includes.filter(m => m !== item)
        : [...form.maintenance_includes, item],
    });
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    setSubmitting(true);
    try {
      // Build FormData for multipart upload
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('type', form.type);
      fd.append('deal', form.deal);
      fd.append('deposit', form.deposit || '0');
      fd.append('monthly', form.monthly || '0');
      fd.append('price', form.price || '0');
      fd.append('maintenance_fee', form.maintenance_fee || '0');
      fd.append('maintenance_includes', JSON.stringify(form.maintenance_includes));
      fd.append('area_m2', form.area_m2);
      fd.append('area_supply_m2', form.area_supply_m2 || '0');
      fd.append('rooms', form.rooms || '0');
      fd.append('bathrooms', form.bathrooms || '0');
      fd.append('floor_current', form.floor_current);
      fd.append('floor_total', form.floor_total || '');
      fd.append('direction', form.direction);
      fd.append('heating_type', form.heating_type);
      fd.append('address', form.address);
      fd.append('address_detail', form.address_detail);
      fd.append('dong', form.dong);
      fd.append('description', form.description);
      fd.append('available_date', form.available_date);
      fd.append('built_year', form.built_year);
      fd.append('parking', String(form.parking));
      fd.append('elevator', String(form.elevator));
      fd.append('pet', String(form.pet));
      fd.append('balcony', String(form.balcony));
      fd.append('full_option', String(form.full_option));
      fd.append('loan_available', String(form.loan_available));
      fd.append('features', JSON.stringify(form.features));
      form.images.forEach(img => fd.append('images', img));

      const res = await fetch('/api/admin/listings', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Failed');
      setSubmitted(true);
    } catch {
      alert('등록 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="flex-1 bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">매물 등록 완료</h2>
          <p className="text-gray-600 mb-6">매물이 성공적으로 등록되었습니다.<br />검토 후 게시됩니다.</p>
          <div className="flex gap-3">
            <button onClick={() => { setSubmitted(false); setStep(1); setForm({type:'',deal:'',address:'',address_detail:'',dong:'',floor_current:'',floor_total:'',deposit:'',monthly:'',price:'',maintenance_fee:'',maintenance_includes:[],title:'',area_m2:'',area_supply_m2:'',rooms:'',bathrooms:'',direction:'',heating_type:'',built_year:'',available_date:'',parking:false,elevator:false,pet:false,balcony:false,full_option:false,loan_available:false,features:[],description:'',images:[],imagePreviews:[]}); }}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
              추가 등록
            </button>
            <button onClick={() => router.push('/listings')}
              className="flex-1 px-4 py-3 bg-wishes-primary text-white rounded-xl hover:bg-wishes-primary/90 font-medium">
              매물 목록
            </button>
          </div>
        </div>
      </main>
    );
  }

  const inputClass = (field: string) =>
    `w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${
      errors[field] ? 'border-red-400 focus:ring-red-200 bg-red-50' : 'border-gray-200 focus:ring-wishes-primary/20 focus:border-wishes-primary'
    }`;

  return (
    <main className="flex-1 bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">매물 등록</h1>
          <p className="text-gray-500 mt-1">매물 정보를 입력해주세요</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <button onClick={() => { if (s.id < step || validateStep(step)) setStep(s.id); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                  step === s.id ? 'bg-wishes-primary text-white shadow-md' :
                  s.id < step ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                {s.id < step ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                <span className="hidden sm:inline">{s.title}</span>
                <span className="sm:hidden">{s.id}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 mx-1 shrink-0" />}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">{STEPS[step - 1].title}</h2>
            <p className="text-sm text-gray-500">{STEPS[step - 1].desc}</p>
          </div>

          {/* Step 1: 매물/거래 유형 */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">매물 유형 <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {LISTING_TYPES.map(t => (
                    <button key={t.value} onClick={() => updateForm({ type: t.value })}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        form.type === t.value ? 'border-wishes-primary bg-wishes-primary/5 shadow-md' : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <t.icon className={`w-6 h-6 ${form.type === t.value ? 'text-wishes-primary' : 'text-gray-400'}`} />
                      <span className={`text-sm font-medium ${form.type === t.value ? 'text-wishes-primary' : 'text-gray-600'}`}>{t.label}</span>
                    </button>
                  ))}
                </div>
                {errors.type && <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.type}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">거래 유형 <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-3">
                  {DEAL_TYPES.map(d => (
                    <button key={d.value} onClick={() => updateForm({ deal: d.value })}
                      className={`py-4 rounded-xl border-2 text-base font-bold transition-all ${
                        form.deal === d.value ? `${d.color} text-white border-transparent shadow-lg` : 'border-gray-100 text-gray-600 hover:border-gray-200'
                      }`}>
                      {d.value}
                    </button>
                  ))}
                </div>
                {errors.deal && <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.deal}</p>}
              </div>
            </div>
          )}

          {/* Step 2: 위치 */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">주소 <span className="text-red-500">*</span></label>
                <input type="text" value={form.address} onChange={e => updateForm({ address: e.target.value })}
                  placeholder="예: 서울특별시 관악구 신림로64길 23" className={inputClass('address')} />
                {errors.address && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.address}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">상세주소</label>
                <input type="text" value={form.address_detail} onChange={e => updateForm({ address_detail: e.target.value })}
                  placeholder="예: 8층 801호" className={inputClass('address_detail')} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">동(벏리) <span className="text-red-500">*</span></label>
                <input type="text" value={form.dong} onChange={e => updateForm({ dong: e.target.value })}
                  placeholder="예: 신림동" className={inputClass('dong')} />
                {errors.dong && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.dong}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">해당 층 <span className="text-red-500">*</span></label>
                  <input type="text" value={form.floor_current} onChange={e => updateForm({ floor_current: e.target.value })}
                    placeholder="예: 3" className={inputClass('floor_current')} />
                  {errors.floor_current && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.floor_current}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">총 층수</label>
                  <input type="text" value={form.floor_total} onChange={e => updateForm({ floor_total: e.target.value })}
                    placeholder="예: 15" className={inputClass('floor_total')} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: 가격 */}
          {step === 3 && (
            <div className="space-y-4">
              {form.deal !== '매매' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">보증금 <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(만원)</span></label>
                  <input type="number" value={form.deposit} onChange={e => updateForm({ deposit: e.target.value })}
                    placeholder="예: 3000 (3천만원)" className={inputClass('deposit')} />
                  {form.deposit && <p className="text-xs text-wishes-primary mt-1">{Number(form.deposit) >= 10000 ? `${Math.floor(Number(form.deposit)/10000)}억 ${Number(form.deposit)%10000 ? (Number(form.deposit)%10000)+'만원' : '원'}` : form.deposit+'만원'}</p>}
                  {errors.deposit && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.deposit}</p>}
                </div>
              )}
              {form.deal === '월세' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">월세 <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(만원)</span></label>
                  <input type="number" value={form.monthly} onChange={e => updateForm({ monthly: e.target.value })}
                    placeholder="예: 55" className={inputClass('monthly')} />
                  {errors.monthly && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.monthly}</p>}
                </div>
              )}
              {form.deal === '매매' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">매매가 <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(만원)</span></label>
                  <input type="number" value={form.price} onChange={e => updateForm({ price: e.target.value })}
                    placeholder="예: 35000 (3억5천만원)" className={inputClass('price')} />
                  {form.price && <p className="text-xs text-wishes-primary mt-1">{Number(form.price) >= 10000 ? `${Math.floor(Number(form.price)/10000)}억 ${Number(form.price)%10000 ? (Number(form.price)%10000)+'만원' : '원'}` : form.price+'만원'}</p>}
                  {errors.price && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.price}</p>}
                </div>
              )}
              <div className="border-t border-gray-100 pt-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">관리비 <span className="text-gray-400 font-normal">(만원/월)</span></label>
                <input type="number" value={form.maintenance_fee} onChange={e => updateForm({ maintenance_fee: e.target.value })}
                  placeholder="예: 10" className={inputClass('maintenance_fee')} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">관리비 포함 항목</label>
                <div className="flex flex-wrap gap-2">
                  {MAINTENANCE_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => toggleMaintenance(opt)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                        form.maintenance_includes.includes(opt) ? 'bg-wishes-primary text-white border-wishes-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: 상세 */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">매물 제목 <span className="text-red-500">*</span></label>
                <input type="text" value={form.title} onChange={e => updateForm({ title: e.target.value })}
                  placeholder="예: 신림역 역세권 풀옵션 원룸" className={inputClass('title')} maxLength={50} />
                <p className="text-xs text-gray-400 mt-1">{form.title.length}/50</p>
                {errors.title && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.title}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">전용면적 <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(m²)</span></label>
                  <input type="number" step="0.1" value={form.area_m2} onChange={e => updateForm({ area_m2: e.target.value })}
                    placeholder="예: 33" className={inputClass('area_m2')} />
                  {form.area_m2 && <p className="text-xs text-gray-400 mt-1">≈ {(Number(form.area_m2) * 0.3025).toFixed(1)}평</p>}
                  {errors.area_m2 && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.area_m2}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">공급면적 <span className="text-gray-400 font-normal">(m²)</span></label>
                  <input type="number" step="0.1" value={form.area_supply_m2} onChange={e => updateForm({ area_supply_m2: e.target.value })}
                    placeholder="예: 45" className={inputClass('area_supply_m2')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">방 수</label>
                  <select value={form.rooms} onChange={e => updateForm({ rooms: e.target.value })} className={inputClass('rooms')}>
                    <option value="">선택</option>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}개</option>)}
                    <option value="6">6개 이상</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">욕실 수</label>
                  <select value={form.bathrooms} onChange={e => updateForm({ bathrooms: e.target.value })} className={inputClass('bathrooms')}>
                    <option value="">선택</option>
                    {[1,2,3].map(n => <option key={n} value={n}>{n}개</option>)}
                    <option value="4">4개 이상</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">방향</label>
                  <select value={form.direction} onChange={e => updateForm({ direction: e.target.value })} className={inputClass('direction')}>
                    <option value="">선택</option>
                    {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">난방 방식</label>
                  <select value={form.heating_type} onChange={e => updateForm({ heating_type: e.target.value })} className={inputClass('heating_type')}>
                    <option value="">선택</option>
                    {HEATING_TYPES.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">준공년도</label>
                  <input type="text" value={form.built_year} onChange={e => updateForm({ built_year: e.target.value })}
                    placeholder="예: 2020" className={inputClass('built_year')} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">입주 가능일</label>
                  <input type="date" value={form.available_date} onChange={e => updateForm({ available_date: e.target.value })}
                    className={inputClass('available_date')} />
                </div>
              </div>
            </div>
          )}

          {/* Step 5: 옵션 */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">시설 옵션</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'parking', icon: Car, label: '주차 가능' },
                    { key: 'elevator', icon: ArrowUp, label: '엘리베이터' },
                    { key: 'pet', icon: Dog, label: '반려동물' },
                    { key: 'balcony', icon: Maximize2, label: '발코니' },
                    { key: 'full_option', icon: Sofa, label: '풀옵션' },
                    { key: 'loan_available', icon: CreditCard, label: '대출 가능' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => updateForm({ [opt.key]: !(form as any)[opt.key] } as any)}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        (form as any)[opt.key] ? 'border-wishes-primary bg-wishes-primary/5' : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <opt.icon className={`w-5 h-5 ${(form as any)[opt.key] ? 'text-wishes-primary' : 'text-gray-400'}`} />
                      <span className={`text-sm font-medium ${(form as any)[opt.key] ? 'text-wishes-primary' : 'text-gray-600'}`}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">추가 특징 태그</label>
                <p className="text-xs text-gray-400 mb-3">입력 후 Enter를 누르세요</p>
                <input type="text" placeholder="예: 역세권, 리모델링, 새 건물..."
                  className={inputClass('features')}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !form.features.includes(val)) {
                        updateForm({ features: [...form.features, val] });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }} />
                {form.features.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {form.features.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-wishes-primary/10 text-wishes-primary rounded-full text-sm">
                        {f}
                        <button onClick={() => updateForm({ features: form.features.filter((_, j) => j !== i) })} className="hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 6: 사진/설명 */}
          {step === 6 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  사진 업로드 <span className="text-gray-400 font-normal">(최대 15장)</span>
                </label>
                <p className="text-xs text-gray-400 mb-3">첫 번째 사진이 대표 이미지로 설정됩니다</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {form.imagePreviews.map((preview, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 group">
                      <img src={preview} alt="" className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute top-1 left-1 bg-wishes-primary text-white text-[10px] px-1.5 py-0.5 rounded">대표</span>
                      )}
                      <button onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {form.images.length < 15 && (
                    <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-wishes-primary flex flex-col items-center justify-center cursor-pointer transition-colors">
                      <Upload className="w-6 h-6 text-gray-400" />
                      <span className="text-xs text-gray-400 mt-1">{form.images.length}/15</span>
                      <input type="file" accept="image/*" multiple onChange={handleImageAdd} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">상세 설명</label>
                <textarea value={form.description} onChange={e => updateForm({ description: e.target.value })}
                  rows={6} placeholder="매물의 장점, 주변 환경, 교통 등 상세히 작성해주세요.

예:
- 신림역 5분 거리 역세권
- 남향 풀채광
- 풀옵션 (세탁기, 건조기, 에어콘, 냉장고)
- 편의점, 마트 도보 5분"
                  className={`w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-wishes-primary/20 focus:border-wishes-primary resize-none`} />
                <p className="text-xs text-gray-400 mt-1">{form.description.length}자</p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            {step > 1 ? (
              <button onClick={prevStep} className="flex items-center gap-2 px-5 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors">
                <ChevronLeft className="w-4 h-4" /> 이전
              </button>
            ) : <div />}
            {step < 6 ? (
              <button onClick={nextStep}
                className="flex items-center gap-2 px-6 py-3 bg-wishes-primary text-white rounded-xl hover:bg-wishes-primary/90 font-medium shadow-md transition-all">
                다음 <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-2 px-8 py-3 bg-wishes-primary text-white rounded-xl hover:bg-wishes-primary/90 font-bold shadow-lg transition-all disabled:opacity-50">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> 등록 중...</> : <><Check className="w-4 h-4" /> 매물 등록</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
