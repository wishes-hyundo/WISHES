'use client'; 

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface FormData {
  title: string;
  transactionType: string;
  propertyType: string;
  address: string;
  addressDetail: string;
  area: number;
  floor: number;
  totalFloors: number;
  price: number;
  deposit: number;
  monthlyRent: number;
  rooms: number;
  bathrooms: number;
  direction: string;
  moveInDate: string;
  features: string[];
  description: string;
  images: string[];
  status: string;
  // ê±´ì¶•ë¬¼ëŒ€ìž¥ ì •ë³´
  buildingName: string;
  buildingStructure: string;
  buildingPurpose: string;
  approvalDate: string;
  elevatorCount: number;
  parkingCount: number;
  totalFloorArea: number;
}

interface BuildingInfo {
  buildingName: string;
  mainPurpose: string;
  buildingStructure: string;
  roofStructure: string;
  totalFloorArea: number;
  buildingArea: number;
  floors: { underground: number; aboveGround: number };
  approvalDate: string;
  dongCount: number;
  unitCount: number;
  elevatorCount: number;
  parkingCount: number;
  address: string;
  jibun: string;
}

const TRANSACTION_TYPES = ['ë§¤ë§¤', 'ì „ì„¸', 'ì›”ì„¸'];
const PROPERTY_TYPES = ['ì•„íŒŒíŠ¸', 'ì˜¤í”¼ìŠ¤í…”', 'ë¹Œë¼', 'ì›ë£¸', 'íˆ¬ë£¸', 'ìƒê°€', 'ì‚¬ë¬´ì‹¤', 'í† ì§€', 'ê¸°íƒ€'];
const DIRECTIONS = ['ë™í–¥', 'ì„œí–¥', 'ë‚¨í–¥', 'ë¶í–¥', 'ë‚¨ë™í–¥', 'ë‚¨ì„œí–¥', 'ë¶ë™í–¥', 'ë¶ì„œí–¥'];
const FEATURES_LIST = [
  'ì£¼ì°¨ê°€ëŠ¥', 'ì—˜ë¦¬ë² ì´í„°', 'ë°˜ë ¤ë™ë¬¼', 'í’€ì˜µì…˜', 'ë² ëž€ë‹¤',
  'í…Œë¼ìŠ¤', 'ë³µì¸µ', 'ë¶„ë¦¬í˜•', 'ì‹ ì¶•', 'ë¦¬ëª¨ë¸ë§',
  'ì—­ì„¸ê¶Œ', 'í•™êµ°', 'ê³µì›ì¸ì ‘', 'ëƒ‰ìž¥ê³ ', 'ë³´ì•ˆì‹œì„¤',
  'ì—ì–´ì»¨', 'ì„¸íƒê¸°', 'ëƒ‰ìž¥ê³ ', 'ì¸ë•ì…˜', 'ê°€ìŠ¤ë ˆì¸ì§€'
];

export default function NewListingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    transactionType: 'ì›”ì„¸',
    propertyType: 'ì•„íŒŒíŠ¸',
    address: '',
    addressDetail: '',
    area: 0,
    floor: 0,
    totalFloors: 0,
    price: 0,
    deposit: 0,
    monthlyRent: 0,
    rooms: 1,
    bathrooms: 1,
    direction: 'ë‚¨í–¥',
    moveInDate: '',
    features: [],
    description: '',
    images: [],
    status: 'active',
    buildingName: '',
    buildingStructure: '',
    buildingPurpose: '',
    approvalDate: '',
    elevatorCount: 0,
    parkingCount: 0,
    totalFloorArea: 0,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isFetchingBuilding, setIsFetchingBuilding] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [buildingData, setBuildingData] = useState<BuildingInfo | null>(null);
  const [buildingError, setBuildingError] = useState('');
  const [descSource, setDescSource] = useState('');
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' });
  const [activeStep, setActiveStep] = useState(1);
  const [previewImages, setPreviewImages] = useState<string[]>([]);

  // ì£¼ì†Œì—ì„œ ì‹œêµ°êµ¬, ë²ˆì§€ ì •ë³´ ì¶”ì¶œ
  const parseAddress = (address: string) => {
    const parts = address.trim().split(/\s+/);
    let sigungu = '';
    let bun = '';
    let ji = '';

    for (const part of parts) {
      if (part.endsWith('êµ¬') || part.endsWith('ì‹œ') || part.endsWith('êµ°')) {
        sigungu = part;
      }
      // ë²ˆì§€ íŒ¨í„´: 123-45 ë˜ëŠ” 123
      const bunjiMatch = part.match(/^(\d+)(-(\d+))?$/);
      if (bunjiMatch) {
        bun = bunjiMatch[1];
        ji = bunjiMatch[3] || '0';
      }
    }

    return { sigungu, bun, ji };
  };

  // ê±´ì¶•ë¬¼ëŒ€ìž¥ ì¡°íšŒ
  const handleBuildingLookup = async () => {
    if (!formData.address) {
      setBuildingError('ì£¼ì†Œë¥¼ ë¨¼ì € ìž…ë ¥í•´ì£¼ì„¸ìš”.');
      return;
    }

    setIsFetchingBuilding(true);
    setBuildingError('');
    setBuildingData(null);

    try {
      const { sigungu, bun, ji } = parseAddress(formData.address);

      const params = new URLSearchParams({
        address: formData.address,
        sigungu: sigungu,
        bun: bun || '0',
        ji: ji || '0',
      });

      const response = await fetch(`/api/admin/building-registry?${params.toString()}`);
      const result = await response.json();

      if (result.success && result.building) {
        const building: BuildingInfo = result.building;
        setBuildingData(building);

        // í¼ ë°ì´í„° ìžë™ ì±„ìš°ê¸°
        setFormData(prev => ({
          ...prev,
          buildingName: building.buildingName || prev.buildingName,
          buildingStructure: building.buildingStructure || prev.buildingStructure,
          buildingPurpose: building.mainPurpose || prev.buildingPurpose,
          approvalDate: building.approvalDate || prev.approvalDate,
          elevatorCount: building.elevatorCount || prev.elevatorCount,
          parkingCount: building.parkingCount || prev.parkingCount,
          totalFloorArea: building.totalFloorArea || prev.totalFloorArea,
          totalFloors: building.floors?.aboveGround || prev.totalFloors,
        }));

        setBuildingError('');
      } else {
        setBuildingError(result.message || 'ê±´ì¶•ë¬¼ëŒ€ìž¥ ì •ë³´ë¥¼ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤.');
        if (result.estimatedData) {
          setFormData(prev => ({
            ...prev,
            buildingStructure: result.estimatedData.structure || prev.buildingStructure,
          }));
        }
      }
    } catch (error) {
      console.error('Building lookup error:', error);
      setBuildingError('ê±´ì¶•ë¬¼ëŒ€ìž¥ ì¡°íšŒ ì¤‘ ì˜¤ë¥˜ê°€ ë°œìƒí–ˆìŠµë‹ˆë‹¤.');
    } finally {
      setIsFetchingBuilding(false);
    }
  };

  // AI ë§¤ë¬¼ ì„¤ëª… ìžë™ ìƒì„±
  const handleGenerateDescription = async () => {
    setIsGeneratingDesc(true);
    setDescSource('');

    try {
      const response = await fetch('/api/admin/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          transactionType: formData.transactionType,
          propertyType: formData.propertyType,
          address: formData.address,
          area: formData.area,
          floor: formData.floor,
          totalFloors: formData.totalFloors,
          price: formData.price,
          deposit: formData.deposit,
          monthlyRent: formData.monthlyRent,
          rooms: formData.rooms,
          bathrooms: formData.bathrooms,
          direction: formData.direction,
          moveInDate: formData.moveInDate,
          features: formData.features,
          buildingInfo: buildingData ? {
            buildingName: buildingData.buildingName,
            mainPurpose: buildingData.mainPurpose,
            buildingStructure: buildingData.buildingStructure,
            approvalDate: buildingData.approvalDate,
            elevatorCount: buildingData.elevatorCount,
            parkingCount: buildingData.parkingCount,
            totalFloorArea: buildingData.totalFloorArea,
          } : undefined,
          additionalNotes: formData.description || undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setFormData(prev => ({ ...prev, description: result.description }));
        setDescSource(result.source === 'ai' ? 'AIê°€ ìž‘ì„±í–ˆìŠµë‹ˆë‹¤' : 'í…œí”Œë¦¿ ê¸°ë°˜ìœ¼ë¡œ ìƒì„±ë˜ì—ˆìŠµë‹ˆë‹¤');
      }
    } catch (error) {
      console.error('Description generation error:', error);
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  // ì´ë¯¸ì§€ ì—…ë¡œë“œ
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImages(true);
    const newImages: string[] = [];
    const newPreviews: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // ë¯¸ë¦¬ë³´ê¸° ìƒì„±
        const reader = new FileReader();
        const preview = await new Promise<string>((resolve) => {
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });
        newPreviews.push(preview);

        // ì„œë²„ ì—…ë¡œë“œ
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);

        const response = await fetch('/api/admin/upload', {
          method: 'POST',
          body: uploadFormData,
        });

        const result = await response.json();
        if (result.success && result.url) {
          newImages.push(result.url);
        }
      }

      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...newImages],
      }));
      setPreviewImages(prev => [...prev, ...newPreviews]);
    } catch (error) {
      console.error('Image upload error:', error);
    } finally {
      setIsUploadingImages(false);
    }
  };

  // ì´ë¯¸ì§€ ì‚­ì œ
  const handleRemoveImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
    setPreviewImages(prev => prev.filter((_, i) => i !== index));
  };

  // íŠ¹ì§• í† ê¸€
  const toggleFeature = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature],
    }));
  };

  // í¼ ì œì¶œ
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.address) {
      setSubmitMessage({ type: 'error', text: 'ì œëª©ê³¼ ì£¼ì†ŒëŠ” í•„ìˆ˜ ìž…ë ¥ í•­ëª©ìž…ë‹ˆë‹¤.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      const response = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        setSubmitMessage({ type: 'success', text: 'ë§¤ë¬¼ì´ ì„±ê³µì ìœ¼ë¡œ ë“±ë¡ë˜ì—ˆìŠµë‹ˆë‹¤!' });
        setTimeout(() => router.push('/admin'), 2000);
      } else {
        setSubmitMessage({ type: 'error', text: result.message || 'ë§¤ë¬¼ ë“±ë¡ì— ì‹¤íŒ¨í–ˆìŠµë‹ˆë‹¤.' });
      }
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitMessage({ type: 'error', text: 'ë§¤ë¬¼ ë“±ë¡ ì¤‘ ì˜¤ë¥˜ê°€ ë°œìƒí–ˆìŠµë‹ˆë‹¤.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof FormData, value: FormData[keyof FormData]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // ìŠ¤í… ì§„í–‰ë¥ 
  const stepProgress = () => {
    let filled = 0;
    const total = 8;
    if (formData.images.length > 0) filled++;
    if (formData.address) filled++;
    if (formData.title) filled++;
    if (formData.transactionType && formData.price > 0) filled++;
    if (formData.area > 0) filled++;
    if (formData.rooms > 0) filled++;
    if (formData.features.length > 0) filled++;
    if (formData.description) filled++;
    return Math.round((filled / total) * 100);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* í—¤ë” */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">ìŠ¤ë§ˆíŠ¸ ë§¤ë¬¼ ë“±ë¡</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              ì§„í–‰ë¥  <span className="font-bold text-blue-600">{stepProgress()}%</span>
            </div>
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${stepProgress()}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ìŠ¤í… ë„¤ë¹„ê²Œì´ì…˜ */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex">
            {[
              { num: 1, label: 'ì‚¬ì§„ ë“±ë¡' },
              { num: 2, label: 'ì£¼ì†Œ & ê±´ì¶•ë¬¼ëŒ€ìž¥' },
              { num: 3, label: 'ë§¤ë¬¼ ì •ë³´' },
              { num: 4, label: 'ì„¤ëª… & ë“±ë¡' },
            ].map(step => (
              <button
                key={step.num}
                onClick={() => setActiveStep(step.num)}
                className={`flex-1 py-3 text-center text-sm font-medium border-b-2 transition-colors ${
                  activeStep === step.num
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs mr-2 ${
                  activeStep === step.num ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                 û'¤ë¬¼ ë“±ë¡</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              ì§„í–‰ë¥  <span className="font-bold text-blue-600">{stepProgress()}%</span>
            </div>
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${stepProgress()}%` }}
              />
            </div>
          </div>
        </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 py-6">
        {/* ========== STEP 1: ì‚¬ì§„ ë“±ë¡ ========== */}
        {activeStep === 1 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">ë§¤ë¬¼ ì‚¬ì§„ ë“±ë¡</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">ë§¤ë¬¼ ì‚¬ì§„ì„ ë“±ë¡í•˜ë©´ ìžë™ìœ¼ë¡œ ìµœì í™”ë˜ì–´ ì—…ë¡œë“œë©ë‹ˆë‹¤. ìµœëŒ€ 20ìž¥ê¹Œì§€ ë“±ë¡ ê°€ëŠ¥í•©ë‹ˆë‹¤.</p>

            {/* ì´ë¯¸ì§€ ì—…ë¡œë“œ ì˜ì—­ */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
            >
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <p className="text-gray-600 font-medium">í´ë¦­í•˜ì—¬ ì‚¬ì§„ì„ ì„ íƒí•˜ì„¸ìš•</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP (ìµœëŒ€ 10MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>

            {isUploadingImages && (
              <div className="mt-4 flex items-center gap-2 text-blue-600">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">ì´ë¯¸ì§€ ì—…ë¡œë“œ ì¤‘...</span>
              </div>
            )}

            {/* ì´ë¯¸ì§€ ë¯¸ë¦¬ë³´ê¸° */}
            {previewImages.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">ë“±ë¡ëœ ì‚¬ì§„ ({previewImages.length}ìž¥)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {previewImages.map((src, index) => (
                    <div key={index} className="relative group aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">
                      <img src={src} alt={`ë§¤ë¬¼ ì‚¬ì§„ ${index + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemoveImage(index); }}
                          className="bg-red-500 text-white rounded-full p-2 hover:bg-red-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      {index === 0 && (
                        <span className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded">
                          ëŒ€í‘œì‚¬ì§„
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                ë‹¤ìŒ: ì£¼ì†Œ ìž…ë ¥
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 2: ì£¼ì†Œ & ê±´ì¶•ë¬¼ëŒ€ìž¥ ========== */}
        {activeStep === 2 && (
          <div className="space-y-6">
            {/* ì£¼ì†Œ ìž…ë ¥ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">ì†Œìž¬ì§€ ìž…ë ¥</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ì£¼ì†Œ *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="ì˜ˆ: ì„œìš¸íŠ¹ë³„ì‹œ ê´€ì•…êµ¬ ë´‰ì²œë™ 123-45"
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleBuildingLookup}
                      disabled={isFetchingBuilding || !formData.address}
                      className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex items-center gap-2"
                    >
                      {isFetchingBuilding ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          ì¡°íšŒì¤‘...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          ê±´ì¶•ë¬¼ëŒ€ìž¥ ì¡°íšŒ
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">ì£¼ì†Œ ìž…ë ¥ í›„ ê±´ì¶•ë¬¼ëŒ€ìž¥ ì¡°íšŒë¥¼ í´ë¦­í•˜ë©´ ê±´ë¬¼ ì •ë³´ê°€ ìžë™ìœ¼ë¡œ ì±„ì›Œì§‘ë‹ˆë‹¤</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ìƒì„¸ì£¼ì†Œ</label>
                  <input
                    type="text"
                    value={formData.addressDetail}
                    onChange={(e) => updateField('addressDetail', e.target.value)}
                    placeholder="ë™/í˜¸ìˆ˜ (ì˜ˆ: 101ë™ 1203í˜¸)"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {buildingError && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span>{buildingError}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ê±´ì¶•ë¬¼ëŒ€ìž¥ ì •ë³´ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">ê±´ì¶•ë¬¼ëŒ€ìž¥ ì •ë³´</h2>
                {buildingData && (
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ìžë™ ìž…ë ¥ë¨</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ê±´ë¬¼ëª…</label>
                  <input
                    type="text"
                    value={formData.buildingName}
                    onChange={(e) => updateField('buildingName', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ê±´ë¬¼ëª…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì£¼ìš©ë„</label>
                  <input
                    type="text"
                    value={formData.buildingPurpose}
                    onChange={(e) => updateField('buildingPurpose', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ì£¼ìš©ë„"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ê±´ë¬¼êµ¬ì¡°</label>
                  <input
                    type="text"
                    value={formData.buildingStructure}
                    onChange={(e) => updateField('buildingStructure', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ì˜ˆ: ì² ê·¼ì½˜í¬ë¦¬íŠ¸êµ¬ì¡°"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì‚¬ìš©ìŠ¹ì¸ì¼</label>
                  <input
                    type="text"
                    value={formData.approvalDate}
                    onChange={(e) => updateField('approvalDate', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ì˜ˆ: 20150301"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì—˜ë¦¬ë² ì´í„°</label>
                  <input
                    type="number"
                    value={formData.elevatorCount}
                    onChange={(e) => updateField('elevatorCount', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì£¼ì°¨ëŒ€ìˆ˜</label>
                  <input
                    type="number"
                    value={formData.parkingCount}
                    onChange={(e) => updateField('parkingCount', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
              </div>

              {buildingData && (
                <div className="mt-4 bg-gray-50 rounded-lg p-4">
                  <h4 className="text-xs font-medium text-gray-500 mb-2">ì¡°íšŒëœ ìƒì„¸ ì •ë³´</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">ì§€ìƒì¸µìˆ˜:</span>
                      <span className="ml-1 font-medium">{buildingData.floors?.aboveGround || '-'}ì¸µ</span>
                    </div>
                    <div>
                      <span className="text-gray-500">ì§€í•˜ì¸µìˆ˜:</span>
                      <span className="ml-1 font-medium">{buildingData.floors?.underground || '-'}ì¸µ</span>
                    </div>
                    <div>
                      <span className="text-gray-500">ì—°ë©´ì :</span>
                      <span className="ml-1 font-medium">{buildingData.totalFloorArea ? buildingData.totalFloorArea.toLocaleString() + 'ãŽ¡' : '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">ì„¸ëŒ€ìˆ˜:</span>
                      <span className="ml-1 font-medium">{buildingData.unitCount || '-'}ì„¸ëŒ€</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="text-gray-600 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                ì´ì „
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                ë‹¤ìŒ: ë§¤ë¬¼ ì •ë³´
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 3: ë§¤ë¬¼ ì •ë³´ ========== */}
        {activeStep === 3 && (
          <div className="space-y-6">
            {/* ê¸°ë³¸ ì •ë³´ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m6 4H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">ê°€ëŠ¥ ì •ë³´</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ê¸°ë³¸ ì •ë³´  ï¸ *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="ì˜ˆ: ê´€ì•…êµ¬ ìˆ¬ëº ëˆ€î¨°ë³¸ ì •ë³´"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ê±°ëž˜ìœ í˜•</label>
                    <div className="flex gap-2">
                      {TRANSACTION_TYPES.map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateField('transactionType', type)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            formData.transactionType === type
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ë§¤ë¬¼ìœ í˜•</label>
                    <select
                      value={formData.propertyType}
                      onChange={(e) => updateField('propertyType', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {PROPERTY_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ê°€ê²© ì •ë³´ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">ê°€ê²© ì •ë³´</h3>

              {formData.transactionType === 'ë§¤ë§¤' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ë§¤ë§¤ê°€ (ë§Œì›)</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => updateField('price', parseInt(e.target.value) || 0)}
                    placeholder="ë§¤ë§¤ê°€"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {formData.transactionType === 'ì „ì„¸' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ì „ì„¸ê¸ˆ (ë§Œì›)</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => updateField('price', parseInt(e.target.value) || 0)}
                    placeholder="ì „ì„¸ê¸ˆ"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {formData.transactionType === 'ì›”ì„¸' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ë³´ì¦ê¸ˆ (ë§Œì›)</label>
                    <input
                      type="number"
                      value={formData.deposit || ''}
                      onChange={(e) => updateField('deposit', parseInt(e.target.value) || 0)}
                      placeholder="ë³´ì¦ê¸ˆ"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ì›”ì„¸ (ë§Œì›)</label>
                    <input
                      type="number"
                      value={formData.monthlyRent || ''}
                      onChange={(e) => updateField('monthlyRent', parseInt(e.target.value) || 0)}
                      placeholder="ì›”ì„¸"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ì„¸ë¶€ ì •ë³´ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">ì„¸ë¶€ ì •ë³´</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ë©´ì  (ãŽ¡)</label>
                  <input
                    type="number"
                    value={formData.area || ''}
                    onChange={(e) => updateField('area', parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    step="0.01"
                  />
                  {formData.area > 0 && (
                    <p className="text-xs text-gray-400 mt-1">ì•½ {Math.round(formData.area * 0.3025)}í‰</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">í•´ë‹¹ì¸µ</label>
                  <input
                    type="number"
                    value={formData.floor || ''}
                    onChange={(e) => updateField('floor', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì´ì¸µìˆ˜</label>
                  <input
                    type="number"
                    value={formData.totalFloors || ''}
                    onChange={(e) => updateField('totalFloors', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ë°© ìˆ˜</label>
                  <input
                    type="number"
                    value={formData.rooms}
                    onChange={(e) => updateField('rooms', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ìš•ì‹¤ ìˆ˜</label>
                  <input
                    type="number"
                    value={formData.bathrooms}
                    onChange={(e) => updateField('bathrooms', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ë°©í–¥</label>
                  <select
                    value={formData.direction}
                    onChange={(e) => updateField('direction', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {DIRECTIONS.map(dir => (
                      <option key={dir} value={dir}>{dir}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ìž…ì£¼ê°€ëŠ¥ì¼</label>
                  <input
                    type="date"
                    value={formData.moveInDate}
                    onChange={(e) => updateField('moveInDate', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* íŠ¹ì§• ì„ íƒ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">íŠ¹ì§• ì„ íƒ</h3>
              <div className="flex flex-wrap gap-2">
                {FEATURES_LIST.map(feature => (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggleFeature(feature)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      formData.features.includes(feature)
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {formData.features.includes(feature) ? '\u2713 ' : ''}{feature}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="text-gray-600 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                ì´ì „
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                ë‹¤ìŒ: ì„¤ëª… ìž‘ì„±
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 4: ì„¤ëª… & ë“±ë¡ ========== */}
        {activeStep === 4 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">ë§¤ë¬¼ ì„¤ëª…</h2>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateDescription}
                  disabled={isGeneratingDesc}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 transition-all flex items-center gap-2"
                >
                  {isGeneratingDesc ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      AI ìƒì„±ì¤‘...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      AI ìžë™ ìƒì„±
                    </>
                  )}
                </button>
              </div>

              {descSource && (
                <div className="mb-3 text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg inline-block">
                  {descSource}
                </div>
              )}

              <textarea
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={10}
                placeholder="ë§¤ë¬¼ ì„¤ëª…ì„ ìž…ë ¥í•˜ê±°ë‚˜, AI ìžë™ ìƒì„± ë²„íŠ¼ì„ í´ë¦­í•˜ì„¸ìš”. ìž…ë ¥ëœ ë§¤ë¬¼ ì •ë³´ì™€ ê±´ì¶•ë¬¼ëŒ€ìž¥ ë°ì´í„°ë¥¼ ê¸°ë°˜ìœ¼ë¡œ ì „ë¬¸ì ì¸ ì†Œê°œê¸€ì´ ìžë™ ìž‘ì„±ë©ë‹ˆë‹¤."
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {formData.description.length}ìž ìž‘ì„±ë¨
              </p>
            </div>

            {/* ë“±ë¡ ìƒíƒœ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">ë“±ë¡ ìƒíƒœ</h3>
              <div className="flex gap-3">
                {['active', 'pending', 'closed'].map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateField('status', status)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      formData.status === status
                        ? status === 'active' ? 'bg-green-600 text-white border-green-600'
                         : status === 'pending' ? 'bg-yellow-500 text-white border-yellow-500'
                        : 'bg-gray-500 text-white border-gray-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {status === 'active' ? 'ê³µê°œ' : status === 'pending' ? 'ëŒ€ê¸°' : 'ë§ˆê°'}
                  </button>
                ))}
              </div>
            </div>

            {/* ë“±ë¡ ìš”ì•½ */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
              <h3 className="text-md font-bold text-blue-900 mb-3">ë“±ë¡ ìš”ì•½</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-blue-600">ì œëª©:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.title || '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">ê±°ëž˜:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.transactionType}</span>
                </div>
                <div>
                  <span className="text-blue-600">ìœ í˜•:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.propertyType}</span>
                </div>
                <div>
                  <span className="text-blue-600">ì£¼ì†Œ:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.address || '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">ë©´ì :</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.area ? `${formData.area}ãŽ¡ (${Math.round(formData.area * 0.3025)}í‰)` : '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">ì‚¬ì§„:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.images.length}ìž¥</span>
                </div>
              </div>
            </div>

            {submitMessage.text && (
              <div className={`p-4 rounded-lg text-sm ${
                submitMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {submitMessage.text}
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="text-gray-600 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                ì´ì „
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-lg font-bold hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-400 transition-all flex items-center gap-2 shadow-lg"
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    ë“±ë¡ì¤‘...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    ë§¤ë¬¼ ë“±ë¡í•˜ê¸°
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
