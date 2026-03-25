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
  dong: string;
  // ê±´ì¶ë¬¼ëì¥ ì ë³´
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

const TRANSACTION_TYPES = ['ë§¤ë§¤', 'ì ì¸', 'ìì¸'];
const PROPERTY_TYPES = ['ìíí¸', 'ì¤í¼ì¤í', 'ë¹ë¼', 'ìë£¸', 'í¬ë£¸', 'ìê°', 'ì¬ë¬´ì¤', 'í ì§', 'ê¸°í'];
const DIRECTIONS = ['ëí¥', 'ìí¥', 'ë¨í¥', 'ë¶í¥', 'ë¨ëí¥', 'ë¨ìí¥', 'ë¶ëí¥', 'ë¶ìí¥'];
const FEATURES_LIST = [
  'ì£¼ì°¨ê°ë¥', 'ìë¦¬ë² ì´í°', 'ë°ë ¤ëë¬¼', 'íìµì', 'ë² ëë¤',
  'íë¼ì¤', 'ë³µì¸µ', 'ë¶ë¦¬í', 'ì ì¶', 'ë¦¬ëª¨ë¸ë§',
  'ì­ì¸ê¶', 'íêµ°', 'ê³µìì¸ì ', 'ëë¡ë³', 'ë³´ììì¤',
  'ìì´ì»¨', 'ì¸íê¸°', 'ëì¥ê³ ', 'ì¸ëì', 'ê°ì¤ë ì¸ì§'
];

export default function NewListingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    transactionType: 'ìì¸',
    propertyType: 'ìíí¸',
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
    direction: 'ë¨í¥',
    moveInDate: '',
    features: [],
    description: '',
    images: [],
    status: 'ê°ì©',
    dong: '',
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const ADMIN_TOKEN = 'wishes2026';
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // ì£¼ììì ìêµ°êµ¬, ë²ì§ ì ë³´ ì¶ì¶
  const parseAddress = (address: string) => {
    const parts = address.trim().split(/\s+/);
    let sigungu = '';
    let bun = '';
    let ji = '';

    for (const part of parts) {
      if (part.endsWith('êµ¬') || part.endsWith('ì') || part.endsWith('êµ°')) {
        sigungu = part;
      }
      // ë²ì§ í¨í´: 123-45 ëë 123
      const bunjiMatch = part.match(/^(\d+)(-(\d+))?$/);
      if (bunjiMatch) {
        bun = bunjiMatch[1];
        ji = bunjiMatch[3] || '0';
      }
    }

    return { sigungu, bun, ji };
  };

  // ê±´ì¶ë¬¼ëì¥ ì¡°í
  const handleBuildingLookup = async () => {
    if (!formData.address) {
      setBuildingError('ì£¼ìë¥¼ ë¨¼ì  ìë ¥í´ì£¼ì¸ì.');
      return;
    }

    setIsFetchingBuilding(true);
    setBuildingError('');
    setBuildingData(null);

    try {
      const { sigungu, bun, ji } = parseAddress(formData.address);

      const params = new URLSearchParams({
        address: formData.address,
        dong: formData.dong || (formData.address.match(/([\uAC00-\uD7AF]{1,5}\ub3d9)/) || [])[1] || '',
        sigungu: sigungu,
        bun: bun || '0',
        ji: ji || '0',
      });

      const response = await fetch(`/api/admin/building-registry?${params.toString()}`);
      const result = await response.json();

      if (result.success && result.data) {
            const bd = result.data;
            setBuildingData(bd);

            // 건축물대장 기반 자동 기입 - 모든 매물 정보 자동 설정
            const purposeToType: Record<string, string> = {
              '단독주택': '원룸', '다중주택': '원룸', '다가구주택': '원룸',
              '공동주택': '아파트', '아파트': '아파트',
              '연립주택': '투룸', '다세대주택': '투룸',
              '오피스텔': '오피스텔',
              '근린생활시설': '상가', '제1종근린생활시설': '상가', '제2종근린생활시설': '상가',
              '업무시설': '사무실', '일반업무시설': '사무실',
            };
            const matchedType = Object.entries(purposeToType).find(
              ([key]) => bd.buildingPurpose?.includes(key)
            );

            const totalArea = parseFloat(bd.totalFloorArea || '0');
            const bldArea = parseFloat(bd.buildingArea || '0');
            const floors = parseInt(bd.totalFloors || '0', 10);
            const elvCnt = parseInt(bd.elevatorCount || '0', 10);
            const pkgCnt = parseInt(bd.parkingCount || '0', 10);
            const aprDate = bd.approvalDate || '';
            const builtYear = aprDate.length >= 4 ? aprDate.substring(0, 4) : '';

            setFormData(prev => ({
              ...prev,
              ...(totalArea > 0 && { area: totalArea }),
              ...(floors > 0 && { totalFloors: floors }),
              ...(floors > 0 && !prev.floor && { floor: 1 }),
              ...(matchedType && { propertyType: matchedType[1] }),
              ...(builtYear && { builtYear }),
              elevator: elvCnt > 0,
              parking: pkgCnt > 0,
              ...(elvCnt > 0 && floors > 5 && { direction: prev.direction || '남향' }),
            }));

            toast.success(
              `건축물대장 정보가 자동 입력되었습니다.\n` +
              `용도: ${bd.buildingPurpose || '-'} / 면적: ${totalArea.toFixed(1)}m\u00B2\n` +
              `층수: ${floors}층 / 엘리베이터: ${elvCnt > 0 ? '있음' : '없음'}\n` +
              `주차: ${pkgCnt > 0 ? pkgCnt + '대' : '없음'} / 준공: ${builtYear || '-'}`
            );
          } else {
            toast.error('건축물대장 정보를 찾을 수 없습니다. 수동으로 입력해주세요.');
          }
    } catch (error) {
      console.error('Building lookup error:', error);
      setBuildingError('ê±´ì¶ë¬¼ëì¥ ì¡°í ì¤ ì¤ë¥ê° ë°ìíìµëë¤.');
    } finally {
      setIsFetchingBuilding(false);
    }
  };

  // AI ë§¤ë¬¼ ì¤ëª ìë ìì±
  const handleGenerateDescription = async () => {
    setIsGeneratingDesc(true);
    setDescSource('');

    try {
      const response = await fetch('/api/admin/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ADMIN_TOKEN },
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
        setDescSource(result.source === 'ai' ? 'AIê° ìì±íìµëë¤' : 'ííë¦¿ ê¸°ë°ì¼ë¡ ìì±ëììµëë¤');
      }
    } catch (error) {
      console.error('Description generation error:', error);
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  // ì´ë¯¸ì§ ìë¡ë
  const optimizeImage = (file: File, maxWidth = 1920, quality = 0.85): Promise<File> => {
    return new Promise((resolve) => {
      // 2MB ì´íë©´ ìµì í ì¤íµ
      if (file.size <= 2 * 1024 * 1024) { resolve(file); return; }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          const optimized = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
          resolve(optimized);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploadingImages(true);
    const newImages: string[] = [];
    const newPreviews: string[] = [];

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];

        // í´ë¼ì´ì¸í¸ ì´ë¯¸ì§ ìµì í
        const optimizedFile = await optimizeImage(file);

        // ë¯¸ë¦¬ë³´ê¸° ìì±
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(optimizedFile);
        });
        newPreviews.push(preview);

        // ìë² ìë¡ë (ì¸ì¦ í¤ë í¬í¨)
        const uploadFormData = new FormData();
        uploadFormData.append('file', optimizedFile);

        const response = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
          body: uploadFormData,
        });

        const result = await response.json();
        if (result.success && result.data?.url) {
          newImages.push(result.data.url);
        } else if (result.url) {
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
  };

  const handleRemoveImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_: string, i: number) => i !== index),
    }));
    setPreviewImages(prev => prev.filter((_: string, i: number) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) { await processFiles(files); }
  };

  const openAddressSearch = () => {
    if (typeof window === 'undefined') return;
    
    // window.openì¼ë¡ ì£¼ì ê²ì íì´ì§ ì´ê¸° (CSP ì°í)
    const width = 500;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    const popup = window.open(
      '/api/address-search',
      'addressSearch',
      'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',scrollbars=yes,resizable=yes'
    );
    
    if (!popup) {
      alert('íìì´ ì°¨ë¨ëììµëë¤. íì ì°¨ë¨ì í´ì í´ì£¼ì¸ì.');
      return;
    }
    
    // postMessageë¡ ê²°ê³¼ ìì 
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'ADDRESS_SELECTED') {
        const data = event.data;
        const fullAddr = data.roadAddress || data.jibunAddress || '';
        const dong = data.bname || '';
        updateField('address', fullAddr);
        if (dong) updateField('dong', dong);
        if (data.buildingName) updateField('buildingName', data.buildingName);
        // ìëì¼ë¡ ê±´ì¶ë¬¼ëì¥ ì¡°í
        if (fullAddr) {
          fetchBuildingInfo(fullAddr);
        }
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
    
    // íìì´ ë«íë©´ ë¦¬ì¤ë ì ê±°
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
      }
    }, 500);
  };

  // í¹ì§ í ê¸
  const toggleFeature = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature],
    }));
  };

  // í¼ ì ì¶

  // Smart AI Analysis
  const handleSmartAnalyze = async () => {
    if (!formData.address) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const price = formData.transactionType === 'ìì¸' ? formData.deposit : formData.price;
      const response = await fetch('/api/admin/smart-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ADMIN_TOKEN },
        body: JSON.stringify({
          address: formData.address,
          transactionType: formData.transactionType,
          propertyType: formData.propertyType,
          price: price,
        }),
      });
      const result = await response.json();
      if (result.success !== false) {
        setAnalysisResult(result);
        if (result.suggestedValues) {
          const sv = result.suggestedValues;
          setFormData(prev => ({
            ...prev,
            rooms: sv.rooms || prev.rooms,
            bathrooms: sv.bathrooms || prev.bathrooms,
            direction: sv.direction || prev.direction,
          }));
        }
        if (result.suggestedDescription && !formData.description) {
          setFormData(prev => ({ ...prev, description: result.suggestedDescription }));
          setDescSource('AI ì¤ë§í¸ ë¶ìì¼ë¡ ìë ìì±');
        }
      }
    } catch (error) {
      console.error('Smart analyze error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.address) {
      setSubmitMessage({ type: 'error', text: `íì ìë ¥ í­ëª©ì íì¸í´ì£¼ì¸ì: ${!formData.title ? 'ì ëª©' : ''}${!formData.title && !formData.address ? ', ' : ''}${!formData.address ? 'ì£¼ì' : ''} í­ëª©ì´ ë¹ì´ììµëë¤.` });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      // formDataë¥¼ API ì¤í¤ë§ì ë§ê² ë³í
      const statusMap: Record<string, string> = { 'active': 'ê°ì©', 'ê³ì½ì¤': 'ê³ì½ì¤', 'ê³ì½ìë£': 'ê³ì½ìë£', 'ê°ì©': 'ê°ì©' };
      const apiPayload = {
        title: formData.title,
        type: formData.propertyType,
        deal: formData.transactionType,
        deposit: formData.deposit,
        monthly: formData.monthlyRent || null,
        price: formData.price || null,
        area_m2: formData.area,
        floor_current: formData.floor ? String(formData.floor) : null,
        floor_total: formData.totalFloors ? String(formData.totalFloors) : null,
        rooms: formData.rooms || null,
        bathrooms: formData.bathrooms || null,
        direction: formData.direction || null,
        address: formData.address,
        dong: formData.dong || (formData.address.match(/([\uAC00-\uD7AF]{1,5}\ub3d9)/) || [])[1] || '',
        address_detail: formData.addressDetail || null,
        description: formData.description || null,
        available_date: formData.moveInDate || null,
        status: statusMap[formData.status] || 'ê°ì©',
        images: formData.images || [],
      };

      const response = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ADMIN_TOKEN },
        body: JSON.stringify(apiPayload),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorDetail = result.message || result.error || JSON.stringify(result);
        setSubmitMessage({ type: 'error', text: `ë§¤ë¬¼ ë±ë¡ ì¤í¨ (HTTP ${response.status}): ${errorDetail}` });
        setIsSubmitting(false);
        return;
      }

      if (result.success) {
        setSubmitMessage({ type: 'success', text: 'ë§¤ë¬¼ì´ ì±ê³µì ì¼ë¡ ë±ë¡ëììµëë¤!' });
        setTimeout(() => router.push('/admin'), 2000);
      } else {
        setSubmitMessage({ type: 'error', text: `ë§¤ë¬¼ ë±ë¡ ì¤í¨: ${result.message || result.error || 'ìë² ì¤ë¥ê° ë°ìíìµëë¤.'} (ìëµì½ë: ${response.status})` });
      }
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitMessage({ type: 'error', text: `ë§¤ë¬¼ ë±ë¡ ì¤ ì¤ë¥ê° ë°ìíìµëë¤: ${error instanceof Error ? error.message : 'ë¤í¸ìí¬ ì°ê²°ì íì¸í´ì£¼ì¸ì.'}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof FormData, value: FormData[keyof FormData]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // ì¤í ì§íë¥ 
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
      {/* í¤ë */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">ì¤ë§í¸ ë§¤ë¬¼ ë±ë¡</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              ì§íë¥  <span className="font-bold text-blue-600">{stepProgress()}%</span>
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

      {/* ì¤í ë¤ë¹ê²ì´ì */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex">
            {[
              { num: 1, label: 'ì¬ì§ ë±ë¡' },
              { num: 2, label: 'ì£¼ì & ê±´ì¶ë¬¼ëì¥' },
              { num: 3, label: 'ë§¤ë¬¼ ì ë³´' },
              { num: 4, label: 'ì¤ëª & ë±ë¡' },
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
                  {step.num}
                </span>
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 py-6">
        {/* ========== STEP 1: ì¬ì§ ë±ë¡ ========== */}
        {activeStep === 1 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">ë§¤ë¬¼ ì¬ì§ ë±ë¡</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">ë§¤ë¬¼ ì¬ì§ì ë±ë¡íë©´ ìëì¼ë¡ ìµì íëì´ ìë¡ëë©ëë¤. ìµë 20ì¥ê¹ì§ ë±ë¡ ê°ë¥í«ëë¤.</p>

            {/* ì´ë¯¸ì§ ìë¡ë ìì­ */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${isDragOver ? 'border-yellow-400 bg-yellow-50 scale-[1.02] shadow-lg' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}`}
            >
              {isDragOver ? (
                <>
                  <svg className="w-12 h-12 text-yellow-500 animate-bounce mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                  <p className="text-lg font-bold text-gray-800 mt-2">ì¬ê¸°ì ëì¼ì¸ì!</p>
                </>
              ) : (
                <>
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <p className="text-gray-600 font-medium">ì¬ì§ì ëëê·¸íì¬ ëê±°ë í´ë¦­íì¸ì</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP / ìµë 10MB / ì¬ë¬ ì¥ ëì ìë¡ë ê°ë¥</p>
                </>
              )}
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
                <span className="text-sm">ì´ë¯¸ì§ ìë¡ë ì¤...</span>
              </div>
            )}

            {/* ì´ë¯¸ì§ ë¯¸ë¦¬ë³´ê¸° */}
            {previewImages.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">ë±ë¡ë ì¬ì§ ({previewImages.length}ì¥)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {previewImages.map((src, index) => (
                    <div key={index} className="relative group aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">
                      <img src={src} alt={`ë§¤ë¬¼ ì¬ì§ ${index + 1}`} className="w-full h-full object-cover" />
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
                          ëíì¬ì§
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
                ë¤ì: ì£¼ì ìë ¥
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 2: ì£¼ì & ê±´ì¶ë¬¼ëì¥ ========== */}
        {activeStep === 2 && (
          <div className="space-y-6">
            {/* ì£¼ì ìë ¥ */}
            
            {/* AI ì¤ë§í¸ ë¶ì */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-purple-900">AI ì¤ë§í¸ ë¶ì</h3>
                    <p className="text-xs text-purple-600">ì£¼ìë¥¼ ìë ¥íë©´ AIê° ì£¼ë³ íê²½ì ë¶ìíê³  ë§¤ë¬¼ ì¤ëªì ìë ìì±í©ëë¤</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSmartAnalyze}
                  disabled={isAnalyzing || !formData.address}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      ë¶ìì¤...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      AI ë¶ì ìì
                    </>
                  )}
                </button>
              </div>
              {analysisResult && analysisResult.areaAnalysis && (
                <div className="mt-4 pt-4 border-t border-purple-200">
                  <h4 className="text-xs font-bold text-purple-800 mb-2">ë¶ì ê²°ê³¼</h4>
                  <p className="text-sm text-purple-700 whitespace-pre-line leading-relaxed">{analysisResult.areaAnalysis}</p>
                  {analysisResult.suggestedDescription && (
                    <div className="mt-3 bg-white rounded-lg p-3 border border-purple-100">
                      <p className="text-xs font-medium text-purple-600 mb-1">ìë ìì±ë ë§¤ë¬¼ ì¤ëª (ì¤ëª & ë±ë¡ í­ìì íì¸)</p>
                      <p className="text-sm text-gray-700">{analysisResult.suggestedDescription.substring(0, 200)}...</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">ìì¬ì§ ìë ¥</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ì£¼ì *</label>
              <div className="flex gap-2">
                <div
                  onClick={openAddressSearch}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center"
                >
                  {formData.address ? (
                    <span className="text-gray-900">{formData.address}</span>
                  ) : (
                    <span className="text-gray-400">í´ë¦­íì¬ ì£¼ìë¥¼ ê²ìíì¸ì</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openAddressSearch}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium whitespace-nowrap flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  ì£¼ì ê²ì
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">ë ì´ë¦ì´ë ëë¡ëªì ìë ¥íë©´ ìë ê²ìë©ëë¤</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ìì¸ì£¼ì</label>
                  <input
                    type="text"
                    value={formData.addressDetail}
                    onChange={(e) => updateField('addressDetail', e.target.value)}
                    placeholder="ë/í¸ì (ì: 101ë 1203í¸)"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              
            {analysisResult && analysisResult.areaAnalysis && (
              <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h4 className="text-sm font-bold text-purple-800">AI ì¤ë§í¸ ë¶ì ê²°ê³¼</h4>
                </div>
                <p className="text-sm text-purple-700 whitespace-pre-line">{analysisResult.areaAnalysis}</p>
                {analysisResult.suggestedDescription && (
                  <div className="mt-3 pt-3 border-t border-purple-200">
                    <p className="text-xs font-medium text-purple-600 mb-1">ìë ìì±ë ë§¤ë¬¼ ì¤ëª:</p>
                    <p className="text-sm text-purple-700">{analysisResult.suggestedDescription.substring(0, 150)}...</p>
                  </div>
                )}
              </div>
            )}
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

            {/* ê±´ì¶ë¬¼ëì¥ ì ë³´ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">ê±´ì¶ë¬¼ëì¥ ì ë³´</h2>
                {/* 건축물대장 조회 버튼 */}
              <div className="flex items-center gap-3 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">건축물대장 자동 조회</p>
                  <p className="text-xs text-blue-600">주소 입력 시 자동으로 건축물대장을 조회하여 매물 정보를 기입합니다</p>
                </div>
                <button
                  type="button"
                  onClick={() => formData.address && fetchBuildingInfo(formData.address)}
                  disabled={!formData.address || isLoadingBR}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
                >
                  {isLoadingBR ? (
                    <><span className="animate-spin">&#8635;</span> 조회 중...</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> 건축물대장 조회</>
                  )}
                </button>
              </div>
              {buildingData && (
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ìë ìë ¥ë¨</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ê±´ë¬¼ëª</label>
                  <input
                    type="text"
                    value={formData.buildingName}
                    onChange={(e) => updateField('buildingName', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ê±´ë¬¼ëª"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì£¼ì©ë</label>
                  <input
                    type="text"
                    value={formData.buildingPurpose}
                    onChange={(e) => updateField('buildingPurpose', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ì£¼ì©ë"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ê±´ë¬¼êµ¬ì¡°</label>
                  <input
                    type="text"
                    value={formData.buildingStructure}
                    onChange={(e) => updateField('buildingStructure', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ì: ì² ê·¼ì½í¬ë¦¬í¸êµ¬ì¡°"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì¬ì©ì¹ì¸ì¼</label>
                  <input
                    type="text"
                    value={formData.approvalDate}
                    onChange={(e) => updateField('approvalDate', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ì: 20150301"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ìë¦¬ë² ì´í°</label>
                  <input
                    type="number"
                    value={formData.elevatorCount}
                    onChange={(e) => updateField('elevatorCount', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì£¼ì°¨ëì</label>
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
                  <h4 className="text-xs font-medium text-gray-500 mb-2">ì¡°íë ìì¸ ì ë³´</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">ì§ìì¸µì:</span>
                      <span className="ml-1 font-medium">{buildingData.floors?.aboveGround || '-'}ì¸µ</span>
                    </div>
                    <div>
                      <span className="text-gray-500">ì§íì¸µì:</span>
                      <span className="ml-1 font-medium">{buildingData.floors?.underground || '-'}ì¸µ</span>
                    </div>
                    <div>
                      <span className="text-gray-500">ì°ë©´ì :</span>
                      <span className="ml-1 font-medium">{buildingData.totalFloorArea ? buildingData.totalFloorArea.toLocaleString() + 'ã¡' : '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">ì¸ëì:</span>
                      <span className="ml-1 font-medium">{buildingData.unitCount || '-'}ì¸ë</span>
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
                ì´ì 
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                ë¤ì: ë§¤ë¬¼ ì ë³´
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 3: ë§¤ë¬¼ ì ë³´ ========== */}
        {activeStep === 3 && (
          <div className="space-y-6">
            {/* ê¸°ë³¸ ì ë³´ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">ê¸°ë³¸ ì ë³´</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ë§¤ë¬¼ ì ëª© *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="ì: ê´ìêµ¬ ì ì¶ í¬ë£¸ ì ì¸"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ê±°ëì í</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">ë§¤ë¬¼ì í</label>
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

            {/* ê°ê²© ì ë³´ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">ê°ê²© ì ë³´</h3>

              {formData.transactionType === 'ë§¤ë§¤' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ë§¤ë§¤ê° (ë§ì)</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => updateField('price', parseInt(e.target.value) || 0)}
                    placeholder="ë§¤ë§¤ê°"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {formData.transactionType === 'ì ì¸' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ì ì¸ê¸ (ë§ì)</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => updateField('price', parseInt(e.target.value) || 0)}
                    placeholder="ì ì¸ê¸"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {formData.transactionType === 'ìì¸' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ë³´ì¦ê¸ (ë§ì)</label>
                    <input
                      type="number"
                      value={formData.deposit || ''}
                      onChange={(e) => updateField('deposit', parseInt(e.target.value) || 0)}
                      placeholder="ë³´ì¦ê¸"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ìì¸ (ë§ì)</label>
                    <input
                      type="number"
                      value={formData.monthlyRent || ''}
                      onChange={(e) => updateField('monthlyRent', parseInt(e.target.value) || 0)}
                      placeholder="ìì¸"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ì¸ë¶ ì ë³´ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">ì¸ë¶ ì ë³´</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ë©´ì  (ã¡)</label>
                  <input
                    type="number"
                    value={formData.area || ''}
                    onChange={(e) => updateField('area', parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    step="0.01"
                  />
                  {formData.area > 0 && (
                    <p className="text-xs text-gray-400 mt-1">ì½ {Math.round(formData.area * 0.3025)}í</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">í´ë¹ì¸µ</label>
                  <input
                    type="number"
                    value={formData.floor || ''}
                    onChange={(e) => updateField('floor', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ì´ì¸µì</label>
                  <input
                    type="number"
                    value={formData.totalFloors || ''}
                    onChange={(e) => updateField('totalFloors', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ë°© ì</label>
                  <input
                    type="number"
                    value={formData.rooms}
                    onChange={(e) => updateField('rooms', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ìì¤ ì</label>
                  <input
                    type="number"
                    value={formData.bathrooms}
                    onChange={(e) => updateField('bathrooms', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ë°©í¥</label>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">ìì£¼ê°ë¥ì¼</label>
                  <input
                    type="date"
                    value={formData.moveInDate}
                    onChange={(e) => updateField('moveInDate', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* í¹ì§ ì í */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">í¹ì§ ì í</h3>
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
                    {formData.features.includes(feature) ? 'â ' : ''}{feature}
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
                ì´ì 
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                ë¤ì: ì¤ëª ìì±
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 4: ì¤ëª & ë±ë¡ ========== */}
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
                  <h2 className="text-lg font-bold text-gray-900">ë§¤ë¬¼ ì¤ëª</h2>
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
                      AI ìì±ì¤...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      AI ìë ìì±
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
                placeholder="ë§¤ë¬¼ ì¤ëªì ìë ¥íê±°ë, AI ìë ìì± ë²í¼ì í´ë¦­íì¸ì. ìë ¥ë ë§¤ë¬¼ ì ë³´ì ê±´ì¶ë¬¼ëì¥ ë°ì´í°ë¥¼ ê¸°ë°ì¼ë¡ ì ë¬¸ì ì¸ ìê°ê¸ì´ ìë ìì±ë©ëë¤."
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {formData.description.length}ì ìì±ë¨
              </p>
            </div>

            {/* ë±ë¡ ìí */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">ë±ë¡ ìí</h3>
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
                    {status === 'active' ? 'ê³µê°' : status === 'pending' ? 'ëê¸°' : 'ë§ê°'}
                  </button>
                ))}
              </div>
            </div>

            {/* ë±ë¡ ìì½ */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
              <h3 className="text-md font-bold text-blue-900 mb-3">ë±ë¡ ìì½</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-blue-600">ì ëª©:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.title || '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">ê±°ë:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.transactionType}</span>
                </div>
                <div>
                  <span className="text-blue-600">ì í:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.propertyType}</span>
                </div>
                <div>
                  <span className="text-blue-600">ì£¼ì:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.address || '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">ë©´ì :</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.area ? `${formData.area}ã¡ (${Math.round(formData.area * 0.3025)}í)` : '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">ì¬ì§:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.images.length}ì¥</span>
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
                ì´ì 
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
                    ë±ë¡ì¤...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    ë§¤ë¬¼ ë±ë¡íê¸°
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
