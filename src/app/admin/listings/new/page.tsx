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
  // 건축물대장 정보
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

const TRANSACTION_TYPES = ['매매', '전세', '월세'];
const PROPERTY_TYPES = ['아파트', '오피스텔', '빌라', '원룸', '투룸', '상가', '사무실', '토지', '기타'];
const DIRECTIONS = ['동향', '서향', '남향', '북향', '남동향', '남서향', '북동향', '북서향'];
const FEATURES_LIST = [
  '주차가능', '엘리베이터', '반려동물', '풀옵션', '베란다',
  '테라스', '복층', '분리형', '신축', '리모델링',
  '역세권', '학군', '공원인접', '대로변', '보안시설',
  '에어컨', '세탁기', '냉장고', '인덕션', '가스레인지'
];

export default function NewListingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    transactionType: '월세',
    propertyType: '아파트',
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
    direction: '남향',
    moveInDate: '',
    features: [],
    description: '',
    images: [],
    status: '가용',
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

  // 주소에서 시군구, 번지 정보 추출
  const parseAddress = (address: string) => {
    const parts = address.trim().split(/\s+/);
    let sigungu = '';
    let bun = '';
    let ji = '';

    for (const part of parts) {
      if (part.endsWith('구') || part.endsWith('시') || part.endsWith('군')) {
        sigungu = part;
      }
      // 번지 패턴: 123-45 또는 123
      const bunjiMatch = part.match(/^(\d+)(-(\d+))?$/);
      if (bunjiMatch) {
        bun = bunjiMatch[1];
        ji = bunjiMatch[3] || '0';
      }
    }

    return { sigungu, bun, ji };
  };

  // 건축물대장 조회
  const handleBuildingLookup = async () => {
    if (!formData.address) {
      setBuildingError('주소를 먼저 입력해주세요.');
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

      if (result.success && result.building) {
        const building: BuildingInfo = result.building;
        setBuildingData(building);

        // 폼 데이터 자동 채우기
        setFormData(prev => {
          // 건축물대장 기반 자동 기입 - 모든 매물 정보 자동 설정
          const purposeToType: Record<string, string> = {
            '단독주택': '원룸', '다중주택': '원룸', '다가구주택': '원룸',
            '공동주택': '아파트', '아파트': '아파트',
            '연립주택': '투룸', '다세대주택': '투룸',
            '오피스텔': '오피스텔',
            '근린생활시설': '상가', '제1종근린생활시설': '상가', '제2종근린생활시설': '상가',
            '업무시설': '사무실',
          };
          const matchedType = Object.entries(purposeToType).find(([key]) => 
            info.mainPurpose?.includes(key)
          );
          
          return {
            ...prev,
            buildingName: info.buildingName || prev.buildingName,
            buildingStructure: info.buildingStructure || prev.buildingStructure,
            buildingPurpose: info.mainPurpose || prev.buildingPurpose,
            approvalDate: info.approvalDate || prev.approvalDate,
            elevatorCount: info.elevatorCount || prev.elevatorCount,
            parkingCount: info.parkingCount || prev.parkingCount,
            totalFloorArea: info.totalFloorArea || prev.totalFloorArea,
            totalFloors: info.floors?.aboveGround || prev.totalFloors,
            // 매물 정보 자동 설정
            propertyType: matchedType ? matchedType[1] : prev.propertyType,
            area: info.totalFloorArea || prev.area,
            floor: prev.floor,
            elevator: info.elevatorCount > 0 ? true : prev.elevator,
            parking: info.parkingCount > 0 ? true : prev.parking,
            builtYear: info.approvalDate ? info.approvalDate.substring(0, 4) : prev.builtYear,
          };
        });
        setBuildingError('');
      } else {
        setBuildingError(result.message || '건축물대장 정보를 찾을 수 없습니다.');
        if (result.estimatedData) {
          setFormData(prev => ({
            ...prev,
            buildingStructure: result.estimatedData.structure || prev.buildingStructure,
          }));
        }
      }
    } catch (error) {
      console.error('Building lookup error:', error);
      setBuildingError('건축물대장 조회 중 오류가 발생했습니다.');
    } finally {
      setIsFetchingBuilding(false);
    }
  };

  // AI 매물 설명 자동 생성
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
        setDescSource(result.source === 'ai' ? 'AI가 작성했습니다' : '템플릿 기반으로 생성되었습니다');
      }
    } catch (error) {
      console.error('Description generation error:', error);
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  // 이미지 업로드
  const optimizeImage = (file: File, maxWidth = 1920, quality = 0.85): Promise<File> => {
    return new Promise((resolve) => {
      // 2MB 이하면 최적화 스킵
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

        // 클라이언트 이미지 최적화
        const optimizedFile = await optimizeImage(file);

        // 미리보기 생성
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(optimizedFile);
        });
        newPreviews.push(preview);

        // 서버 업로드 (인증 헤더 포함)
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
    
    // window.open으로 주소 검색 페이지 열기 (CSP 우회)
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
      alert('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
      return;
    }
    
    // postMessage로 결과 수신
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'ADDRESS_SELECTED') {
        const data = event.data;
        const fullAddr = data.roadAddress || data.jibunAddress || '';
        const dong = data.bname || '';
        updateField('address', fullAddr);
        if (dong) updateField('dong', dong);
        if (data.buildingName) updateField('buildingName', data.buildingName);
        // 자동으로 건축물대장 조회
        if (fullAddr) {
          fetchBuildingInfo(fullAddr);
        }
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
    
    // 팝업이 닫히면 리스너 제거
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
      }
    }, 500);
  };

  // 특징 토글
  const toggleFeature = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature],
    }));
  };

  // 폼 제출

  // Smart AI Analysis
  const handleSmartAnalyze = async () => {
    if (!formData.address) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const price = formData.transactionType === '월세' ? formData.deposit : formData.price;
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
          setDescSource('AI 스마트 분석으로 자동 생성');
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
      setSubmitMessage({ type: 'error', text: `필수 입력 항목을 확인해주세요: ${!formData.title ? '제목' : ''}${!formData.title && !formData.address ? ', ' : ''}${!formData.address ? '주소' : ''} 항목이 비어있습니다.` });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      // formData를 API 스키마에 맞게 변환
      const statusMap: Record<string, string> = { 'active': '가용', '계약중': '계약중', '계약완료': '계약완료', '가용': '가용' };
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
        status: statusMap[formData.status] || '가용',
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
        setSubmitMessage({ type: 'error', text: `매물 등록 실패 (HTTP ${response.status}): ${errorDetail}` });
        setIsSubmitting(false);
        return;
      }

      if (result.success) {
        setSubmitMessage({ type: 'success', text: '매물이 성공적으로 등록되었습니다!' });
        setTimeout(() => router.push('/admin'), 2000);
      } else {
        setSubmitMessage({ type: 'error', text: `매물 등록 실패: ${result.message || result.error || '서버 오류가 발생했습니다.'} (응답코드: ${response.status})` });
      }
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitMessage({ type: 'error', text: `매물 등록 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '네트워크 연결을 확인해주세요.'}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof FormData, value: FormData[keyof FormData]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // 스텝 진행률
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
      {/* 헤더 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">스마트 매물 등록</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              진행률 <span className="font-bold text-blue-600">{stepProgress()}%</span>
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

      {/* 스텝 네비게이션 */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex">
            {[
              { num: 1, label: '사진 등록' },
              { num: 2, label: '주소 & 건축물대장' },
              { num: 3, label: '매물 정보' },
              { num: 4, label: '설명 & 등록' },
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
        {/* ========== STEP 1: 사진 등록 ========== */}
        {activeStep === 1 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">매물 사진 등록</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">매물 사진을 등록하면 자동으로 최적화되어 업로드됩니다. 최대 20장까지 등록 가능핫니다.</p>

            {/* 이미지 업로드 영역 */}
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
                  <p className="text-lg font-bold text-gray-800 mt-2">여기에 놓으세요!</p>
                </>
              ) : (
                <>
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <p className="text-gray-600 font-medium">사진을 드래그하여 놓거나 클릭하세요</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP / 최대 10MB / 여러 장 동시 업로드 가능</p>
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
                <span className="text-sm">이미지 업로드 중...</span>
              </div>
            )}

            {/* 이미지 미리보기 */}
            {previewImages.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">등록된 사진 ({previewImages.length}장)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {previewImages.map((src, index) => (
                    <div key={index} className="relative group aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">
                      <img src={src} alt={`매물 사진 ${index + 1}`} className="w-full h-full object-cover" />
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
                          대표사진
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
                다음: 주소 입력
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 2: 주소 & 건축물대장 ========== */}
        {activeStep === 2 && (
          <div className="space-y-6">
            {/* 주소 입력 */}
            
            {/* AI 스마트 분석 */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-purple-900">AI 스마트 분석</h3>
                    <p className="text-xs text-purple-600">주소를 입력하면 AI가 주변 환경을 분석하고 매물 설명을 자동 생성합니다</p>
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
                      분석중...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      AI 분석 시작
                    </>
                  )}
                </button>
              </div>
              {analysisResult && analysisResult.areaAnalysis && (
                <div className="mt-4 pt-4 border-t border-purple-200">
                  <h4 className="text-xs font-bold text-purple-800 mb-2">분석 결과</h4>
                  <p className="text-sm text-purple-700 whitespace-pre-line leading-relaxed">{analysisResult.areaAnalysis}</p>
                  {analysisResult.suggestedDescription && (
                    <div className="mt-3 bg-white rounded-lg p-3 border border-purple-100">
                      <p className="text-xs font-medium text-purple-600 mb-1">자동 생성된 매물 설명 (설명 & 등록 탭에서 확인)</p>
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
                <h2 className="text-lg font-bold text-gray-900">소재지 입력</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">주소 *</label>
              <div className="flex gap-2">
                <div
                  onClick={openAddressSearch}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center"
                >
                  {formData.address ? (
                    <span className="text-gray-900">{formData.address}</span>
                  ) : (
                    <span className="text-gray-400">클릭하여 주소를 검색하세요</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openAddressSearch}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium whitespace-nowrap flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  주소 검색
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">동 이름이나 도로명을 입력하면 자동 검색됩니다</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">상세주소</label>
                  <input
                    type="text"
                    value={formData.addressDetail}
                    onChange={(e) => updateField('addressDetail', e.target.value)}
                    placeholder="동/호수 (예: 101동 1203호)"
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
                  <h4 className="text-sm font-bold text-purple-800">AI 스마트 분석 결과</h4>
                </div>
                <p className="text-sm text-purple-700 whitespace-pre-line">{analysisResult.areaAnalysis}</p>
                {analysisResult.suggestedDescription && (
                  <div className="mt-3 pt-3 border-t border-purple-200">
                    <p className="text-xs font-medium text-purple-600 mb-1">자동 생성된 매물 설명:</p>
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

            {/* 건축물대장 정보 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">건축물대장 정보</h2>
                
                {/* 건축물대장 수동 조회 버튼 */}
                {!buildingData && formData.address && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800">건축물대장 조회로 매물 정보를 자동으로 채울 수 있습니다</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBuildingLookup()}
                        disabled={isLoadingBuilding}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
                      >
                        {isLoadingBuilding ? '조회 중...' : '건축물대장 조회'}
                      </button>
                    </div>
                  </div>
                )}
{buildingData && (
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">자동 입력됨</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">건물명</label>
                  <input
                    type="text"
                    value={formData.buildingName}
                    onChange={(e) => updateField('buildingName', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="건물명"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">주용도</label>
                  <input
                    type="text"
                    value={formData.buildingPurpose}
                    onChange={(e) => updateField('buildingPurpose', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="주용도"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">건물구조</label>
                  <input
                    type="text"
                    value={formData.buildingStructure}
                    onChange={(e) => updateField('buildingStructure', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="예: 철근콘크리트구조"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">사용승인일</label>
                  <input
                    type="text"
                    value={formData.approvalDate}
                    onChange={(e) => updateField('approvalDate', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="예: 20150301"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">엘리베이터</label>
                  <input
                    type="number"
                    value={formData.elevatorCount}
                    onChange={(e) => updateField('elevatorCount', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">주차대수</label>
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
                  <h4 className="text-xs font-medium text-gray-500 mb-2">조회된 상세 정보</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">지상층수:</span>
                      <span className="ml-1 font-medium">{buildingData.floors?.aboveGround || '-'}층</span>
                    </div>
                    <div>
                      <span className="text-gray-500">지하층수:</span>
                      <span className="ml-1 font-medium">{buildingData.floors?.underground || '-'}층</span>
                    </div>
                    <div>
                      <span className="text-gray-500">연면적:</span>
                      <span className="ml-1 font-medium">{buildingData.totalFloorArea ? buildingData.totalFloorArea.toLocaleString() + '㎡' : '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">세대수:</span>
                      <span className="ml-1 font-medium">{buildingData.unitCount || '-'}세대</span>
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
                이전
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                다음: 매물 정보
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 3: 매물 정보 ========== */}
        {activeStep === 3 && (
          <div className="space-y-6">
            {/* 기본 정보 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">기본 정보</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">매물 제목 *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="예: 관악구 신축 투룸 전세"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">거래유형</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">매물유형</label>
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

            {/* 가격 정보 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">가격 정보</h3>

              {formData.transactionType === '매매' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">매매가 (만원)</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => updateField('price', parseInt(e.target.value) || 0)}
                    placeholder="매매가"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {formData.transactionType === '전세' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">전세금 (만원)</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => updateField('price', parseInt(e.target.value) || 0)}
                    placeholder="전세금"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {formData.transactionType === '월세' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">보증금 (만원)</label>
                    <input
                      type="number"
                      value={formData.deposit || ''}
                      onChange={(e) => updateField('deposit', parseInt(e.target.value) || 0)}
                      placeholder="보증금"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">월세 (만원)</label>
                    <input
                      type="number"
                      value={formData.monthlyRent || ''}
                      onChange={(e) => updateField('monthlyRent', parseInt(e.target.value) || 0)}
                      placeholder="월세"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 세부 정보 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">세부 정보</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">면적 (㎡)</label>
                  <input
                    type="number"
                    value={formData.area || ''}
                    onChange={(e) => updateField('area', parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    step="0.01"
                  />
                  {formData.area > 0 && (
                    <p className="text-xs text-gray-400 mt-1">약 {Math.round(formData.area * 0.3025)}평</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">해당층</label>
                  <input
                    type="number"
                    value={formData.floor || ''}
                    onChange={(e) => updateField('floor', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">총층수</label>
                  <input
                    type="number"
                    value={formData.totalFloors || ''}
                    onChange={(e) => updateField('totalFloors', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">방 수</label>
                  <input
                    type="number"
                    value={formData.rooms}
                    onChange={(e) => updateField('rooms', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">욕실 수</label>
                  <input
                    type="number"
                    value={formData.bathrooms}
                    onChange={(e) => updateField('bathrooms', parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">방향</label>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">입주가능일</label>
                  <input
                    type="date"
                    value={formData.moveInDate}
                    onChange={(e) => updateField('moveInDate', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 특지 선택 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">특징 선택</h3>
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
                    {formData.features.includes(feature) ? '✓ ' : ''}{feature}
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
                이전
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                다음: 설명 작성
              </button>
            </div>
          </div>
        )}

        {/* ========== STEP 4: 설명 & 등록 ========== */}
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
                  <h2 className="text-lg font-bold text-gray-900">매물 설명</h2>
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
                      AI 생성중...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      AI 자동 생성
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
                placeholder="매물 설명을 입력하거나, AI 자동 생성 버튼을 클릭하세요. 입력된 매물 정보와 건축물대장 데이터를 기반으로 전문적인 소개글이 자동 작성됩니다."
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {formData.description.length}자 작성됨
              </p>
            </div>

            {/* 등록 상태 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">등록 상태</h3>
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
                    {status === 'active' ? '공개' : status === 'pending' ? '대기' : '마감'}
                  </button>
                ))}
              </div>
            </div>

            {/* 등록 요약 */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
              <h3 className="text-md font-bold text-blue-900 mb-3">등록 요약</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-blue-600">제목:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.title || '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">거래:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.transactionType}</span>
                </div>
                <div>
                  <span className="text-blue-600">유형:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.propertyType}</span>
                </div>
                <div>
                  <span className="text-blue-600">주소:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.address || '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">면적:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.area ? `${formData.area}㎡ (${Math.round(formData.area * 0.3025)}평)` : '-'}</span>
                </div>
                <div>
                  <span className="text-blue-600">사진:</span>
                  <span className="ml-1 text-blue-900 font-medium">{formData.images.length}장</span>
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
                이전
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
                    등록중...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    매물 등록하기
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
