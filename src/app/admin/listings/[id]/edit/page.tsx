'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
  maintenanceFee: number;
  maintenanceFeeIncludes: string[];
  heatingType: string;
  exclusiveArea: number;
  supplyArea: number;
  floorType: string;
  roomLayout: string;
  moveInType: string;
  parkingAvailable: boolean;
  petAllowed: boolean;
  rooms: number;
  bathrooms: number;
  direction: string;
  moveInDate: string;
  features: string[];
  description: string;
  images: string[];
  status: string;
  dong: string;
  buildingName: string;
  buildingStructure: string;
  buildingPurpose: string;
  approvalDate: string;
  elevatorCount: number;
  parkingCount: number;
  totalFloorArea: number;
  sigunguCode: string;
  bcode: string;
  siteArea: number;
  buildingCoverageRatio: number;
  floorAreaRatio: number;
  undergroundFloors: number;
  householdCount: number;
  unitCount: number;
  roadAddress: string;
  jibunAddress: string;
}

interface SubmitMessage {
  type: string;
  text: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROPERTY_TYPES = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'];
const TRANSACTION_TYPES = ['전세', '월세', '매매'];
const DIRECTIONS = ['동', '서', '남', '북', '동남', '동북', '서남', '서북'];
const HEATING_TYPES = ['개별난방', '중앙난방', '지역난방'];
const MAINTENANCE_OPTIONS = ['수도', '전기', '가스', '인터넷', 'TV', '청소비', '주차비', '엘리베이터유지비'];
const STATUS_OPTIONS = ['가용', '계약중', '계약완료'];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 매물 수정 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const listingId = params?.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 상태 ──
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<SubmitMessage>({ type: '', text: '' });
  const [activeStep, setActiveStep] = useState(0);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [originalData, setOriginalData] = useState<any>(null);

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
    maintenanceFee: 0,
    maintenanceFeeIncludes: [],
    heatingType: '',
    exclusiveArea: 0,
    supplyArea: 0,
    floorType: '',
    roomLayout: '',
    moveInType: '',
    parkingAvailable: false,
    petAllowed: false,
    rooms: 0,
    bathrooms: 0,
    direction: '',
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
    sigunguCode: '',
    bcode: '',
    siteArea: 0,
    buildingCoverageRatio: 0,
    floorAreaRatio: 0,
    undergroundFloors: 0,
    householdCount: 0,
    unitCount: 0,
    roadAddress: '',
    jibunAddress: '',
  });

  // ── 매물 데이터 로드 ──
  useEffect(() => {
    if (!listingId) return;

    const fetchListing = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const res = await fetch(`/api/admin/listings/${listingId}`, {
          headers: { 'Authorization': 'Bearer wishes2026' },
        });

        if (!res.ok) {
          throw new Error(`매물 조회 실패 (HTTP ${res.status})`);
        }

        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.error || '매물 데이터를 불러올 수 없습니다');
        }

        const d = json.data;
        setOriginalData(d);

        // API 필드 → formData 매핑
        setFormData({
          title: d.title || '',
          transactionType: d.deal || '월세',
          propertyType: d.type || '아파트',
          address: d.address || '',
          addressDetail: d.address_detail || '',
          area: d.area_m2 || 0,
          floor: d.floor_current ? parseInt(d.floor_current) || 0 : 0,
          totalFloors: d.floor_total ? parseInt(d.floor_total) || 0 : 0,
          price: d.price || 0,
          deposit: d.deposit || 0,
          monthlyRent: d.monthly || 0,
          maintenanceFee: d.maintenance_fee || 0,
          maintenanceFeeIncludes: d.maintenance_includes || [],
          heatingType: d.heating_type || '',
          exclusiveArea: d.area_m2 || 0,
          supplyArea: d.area_supply_m2 || 0,
          floorType: '',
          roomLayout: '',
          moveInType: '',
          parkingAvailable: d.parking || false,
          petAllowed: d.pet || false,
          rooms: d.rooms || 0,
          bathrooms: d.bathrooms || 0,
          direction: d.direction || '',
          moveInDate: d.available_date || '',
          features: [],
          description: d.description || '',
          images: (d.listing_images || [])
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((img: any) => img.url),
          status: d.status || '가용',
          dong: d.dong || '',
          buildingName: d.building_name || '',
          buildingStructure: '',
          buildingPurpose: '',
          approvalDate: d.built_year || '',
          elevatorCount: 0,
          parkingCount: 0,
          totalFloorArea: 0,
          sigunguCode: '',
          bcode: '',
          siteArea: 0,
          buildingCoverageRatio: 0,
          floorAreaRatio: 0,
          undergroundFloors: 0,
          householdCount: 0,
          unitCount: 0,
          roadAddress: d.address || '',
          jibunAddress: '',
        });

        // 기존 이미지 미리보기
        if (d.listing_images && d.listing_images.length > 0) {
          const sortedImages = [...d.listing_images]
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((img: any) => img.url);
          setPreviewImages(sortedImages);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '매물 데이터를 불러올 수 없습니다');
      } finally {
        setIsLoading(false);
      }
    };

    fetchListing();
  }, [listingId]);

  // ── 이미지 업로드 ──
  const handleImageUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploadingImages(true);

    try {
      const uploadPromises = fileArray.map(async (file) => {
        const uploadFormData = new window.FormData();
        uploadFormData.append('file', file);

        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer wishes2026' },
          body: uploadFormData,
        });

        if (!res.ok) throw new Error(`업로드 실패: ${file.name}`);
        const json = await res.json();
        return json.url;
      });

      const urls = await Promise.all(uploadPromises);

      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...urls],
      }));
      setPreviewImages((prev) => [...prev, ...urls]);
    } catch (err) {
      alert('이미지 업로드 오류: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setIsUploadingImages(false);
    }
  }, []);

  // ── 이미지 삭제 ──
  const handleRemoveImage = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
    setPreviewImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── 이미지 순서 변경 ──
  const handleMoveImage = useCallback((index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    setFormData((prev) => {
      const newImages = [...prev.images];
      [newImages[index], newImages[newIndex]] = [newImages[newIndex], newImages[index]];
      return { ...prev, images: newImages };
    });
    setPreviewImages((prev) => {
      const newPrev = [...prev];
      [newPrev[index], newPrev[newIndex]] = [newPrev[newIndex], newPrev[index]];
      return newPrev;
    });
  }, []);

  // ── 드래그 앤 드롭 ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleImageUpload(files);
  }, [handleImageUpload]);

  // ── 수정 제출 ──
  const handleSubmit = async () => {
    // 필수 필드 검증
    if (!formData.title || !formData.address || !formData.area) {
      setSubmitMessage({
        type: 'error',
        text: `필수 입력 항목을 확인해주세요: ${!formData.title ? '제목' : ''} ${!formData.address ? '주소' : ''} ${!formData.area ? '면적' : ''}`.trim(),
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      const body = {
        id: parseInt(listingId),
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
        dong: formData.dong || (formData.address.match(/([\uAC00-\uD7AF]{1,5}\ub3d9)/) || [''])[0],
        address_detail: formData.addressDetail || null,
        description: formData.description || null,
        available_date: formData.moveInDate || null,
        status: formData.status || '가용',
        maintenance_fee: formData.maintenanceFee || 0,
        maintenance_includes: formData.maintenanceFeeIncludes.length > 0 ? formData.maintenanceFeeIncludes : null,
        heating_type: formData.heatingType || null,
        area_supply_m2: formData.supplyArea || null,
        parking: formData.parkingAvailable,
        elevator: formData.elevatorCount > 0,
        pet: formData.petAllowed,
        built_year: formData.approvalDate || null,
        loan_available: true,
        images: formData.images || [],
      };

      const response = await fetch('/api/admin/listings', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer wishes2026',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSubmitMessage({ type: 'success', text: '매물이 성공적으로 수정되었습니다!' });
        setTimeout(() => {
          router.push('/admin/listings');
        }, 1500);
      } else {
        setSubmitMessage({
          type: 'error',
          text: `매물 수정 실패: ${result.error || result.message || '알 수 없는 오류'}`,
        });
      }
    } catch (error) {
      setSubmitMessage({
        type: 'error',
        text: `매물 수정 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── 단계 정의 ──
  const steps = ['사진 수정', '주소 & 기본정보', '매물 정보', '설명 & 저장'];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 로딩/에러 화면
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin inline-block w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
          <p className="mt-4 text-gray-600">매물 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">매물 조회 실패</h2>
          <p className="text-gray-600 mb-6">{loadError}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push('/admin/listings')}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              목록으로
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 메인 UI
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin/listings')}
              className="text-gray-500 hover:text-gray-700 p-1"
            >
              ← 목록
            </button>
            <h1 className="text-lg font-bold text-gray-900">매물 수정 #{listingId}</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={formData.status}
              onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
              className="px-3 py-1.5 border rounded-lg text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 단계 탭 */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex">
            {steps.map((step, idx) => (
              <button
                key={step}
                onClick={() => setActiveStep(idx)}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeStep === idx
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {step}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 메시지 */}
      {submitMessage.text && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className={`p-4 rounded-lg ${
            submitMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {submitMessage.text}
          </div>
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ── Step 0: 사진 수정 ── */}
        {activeStep === 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">매물 사진</h2>

            {/* 드래그 앤 드롭 영역 */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
                className="hidden"
              />
              <div className="text-gray-400 text-4xl mb-2">📷</div>
              <p className="text-gray-600 font-medium">
                {isUploadingImages ? '업로드 중...' : '사진을 드래그하거나 클릭하여 추가'}
              </p>
              <p className="text-gray-400 text-sm mt-1">JPG, PNG, WebP 지원</p>
            </div>

            {/* 이미지 미리보기 */}
            {previewImages.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-gray-500 mb-3">등록된 이미지: {previewImages.length}장 (첫 번째가 대표 이미지)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {previewImages.map((url, idx) => (
                    <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border">
                      <img
                        src={url}
                        alt={`매물 이미지 ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {idx === 0 && (
                        <div className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded">
                          대표
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                        {idx > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMoveImage(idx, 'up'); }}
                            className="bg-white/90 text-gray-700 w-8 h-8 rounded-full text-sm hover:bg-white"
                          >
                            ←
                          </button>
                        )}
                        {idx < previewImages.length - 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMoveImage(idx, 'down'); }}
                            className="bg-white/90 text-gray-700 w-8 h-8 rounded-full text-sm hover:bg-white"
                          >
                            →
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveImage(idx); }}
                          className="bg-red-500/90 text-white w-8 h-8 rounded-full text-sm hover:bg-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: 주소 & 기본정보 ── */}
        {activeStep === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">주소 정보</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">주소 *</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="예: 서울특별시 강남구 역삼동 123-45"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">상세주소</label>
                  <input
                    type="text"
                    value={formData.addressDetail}
                    onChange={(e) => setFormData((p) => ({ ...p, addressDetail: e.target.value }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="동/호수 (예: 101동 502호)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">동</label>
                    <input
                      type="text"
                      value={formData.dong}
                      onChange={(e) => setFormData((p) => ({ ...p, dong: e.target.value }))}
                      className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="예: 역삼동"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">건물명</label>
                    <input
                      type="text"
                      value={formData.buildingName}
                      onChange={(e) => setFormData((p) => ({ ...p, buildingName: e.target.value }))}
                      className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="건물명"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">기본 정보</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="매물 제목"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">매물 유형 *</label>
                    <div className="flex flex-wrap gap-2">
                      {PROPERTY_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData((p) => ({ ...p, propertyType: type }))}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            formData.propertyType === type
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">거래 유형 *</label>
                    <div className="flex flex-wrap gap-2">
                      {TRANSACTION_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData((p) => ({ ...p, transactionType: type }))}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            formData.transactionType === type
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: 매물 정보 ── */}
        {activeStep === 2 && (
          <div className="space-y-6">
            {/* 가격 정보 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">가격 정보</h2>
              <div className="grid grid-cols-2 gap-4">
                {formData.transactionType === '매매' ? (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">매매가 (만원)</label>
                    <input
                      type="number"
                      value={formData.price || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, price: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="매매가 입력"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">보증금 (만원)</label>
                      <input
                        type="number"
                        value={formData.deposit || ''}
                        onChange={(e) => setFormData((p) => ({ ...p, deposit: parseInt(e.target.value) || 0 }))}
                        className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="보증금"
                      />
                    </div>
                    {formData.transactionType === '월세' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">월세 (만원)</label>
                        <input
                          type="number"
                          value={formData.monthlyRent || ''}
                          onChange={(e) => setFormData((p) => ({ ...p, monthlyRent: parseInt(e.target.value) || 0 }))}
                          className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="월세"
                        />
                      </div>
                    )}
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">관리비 (만원)</label>
                  <input
                    type="number"
                    value={formData.maintenanceFee || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, maintenanceFee: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="관리비"
                  />
                </div>
              </div>
              {/* 관리비 포함 항목 */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">관리비 포함 항목</label>
                <div className="flex flex-wrap gap-2">
                  {MAINTENANCE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setFormData((p) => ({
                          ...p,
                          maintenanceFeeIncludes: p.maintenanceFeeIncludes.includes(opt)
                            ? p.maintenanceFeeIncludes.filter((i) => i !== opt)
                            : [...p.maintenanceFeeIncludes, opt],
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        formData.maintenanceFeeIncludes.includes(opt)
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 면적/구조 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">면적 & 구조</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">전용면적 (m²) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.area || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, area: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="전용면적"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">공급면적 (m²)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.supplyArea || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, supplyArea: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="공급면적"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">해당 층</label>
                  <input
                    type="number"
                    value={formData.floor || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, floor: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="층"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">총 층수</label>
                  <input
                    type="number"
                    value={formData.totalFloors || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, totalFloors: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="총 층수"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">방 수</label>
                  <input
                    type="number"
                    value={formData.rooms || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, rooms: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="방 수"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">욕실 수</label>
                  <input
                    type="number"
                    value={formData.bathrooms || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, bathrooms: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="욕실 수"
                  />
                </div>
              </div>
            </div>

            {/* 추가 정보 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">추가 정보</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">방향</label>
                  <div className="flex flex-wrap gap-2">
                    {DIRECTIONS.map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, direction: dir }))}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          formData.direction === dir
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">난방 방식</label>
                  <div className="flex flex-wrap gap-2">
                    {HEATING_TYPES.map((ht) => (
                      <button
                        key={ht}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, heatingType: ht }))}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          formData.heatingType === ht
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {ht}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">입주 가능일</label>
                  <input
                    type="date"
                    value={formData.moveInDate}
                    onChange={(e) => setFormData((p) => ({ ...p, moveInDate: e.target.value }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">사용승인일/준공년도</label>
                  <input
                    type="text"
                    value={formData.approvalDate}
                    onChange={(e) => setFormData((p) => ({ ...p, approvalDate: e.target.value }))}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="예: 2020"
                  />
                </div>
              </div>
              {/* 옵션 토글 */}
              <div className="mt-4 flex flex-wrap gap-4">
                {[
                  { key: 'parkingAvailable', label: '주차 가능' },
                  { key: 'petAllowed', label: '반려동물 가능' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(formData as any)[key]}
                      onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.checked }))}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: 설명 & 저장 ── */}
        {activeStep === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">매물 설명</h2>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={10}
                placeholder="매물에 대한 상세 설명을 입력해주세요..."
              />
            </div>

            {/* 수정 전 요약 */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">수정 내용 확인</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">제목</span>
                  <span className="font-medium text-gray-900">{formData.title || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">유형</span>
                  <span className="font-medium text-gray-900">{formData.propertyType} / {formData.transactionType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">주소</span>
                  <span className="font-medium text-gray-900 text-right max-w-[200px] truncate">{formData.address || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">가격</span>
                  <span className="font-medium text-gray-900">
                    {formData.transactionType === '매매'
                      ? `${formData.price?.toLocaleString() || 0}만원`
                      : formData.transactionType === '전세'
                        ? `전세 ${formData.deposit?.toLocaleString() || 0}만원`
                        : `${formData.deposit?.toLocaleString() || 0} / ${formData.monthlyRent?.toLocaleString() || 0}만원`
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">면적</span>
                  <span className="font-medium text-gray-900">{formData.area || 0}m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">층</span>
                  <span className="font-medium text-gray-900">{formData.floor || '-'}층 / {formData.totalFloors || '-'}층</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">이미지</span>
                  <span className="font-medium text-gray-900">{formData.images.length}장</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">상태</span>
                  <span className="font-medium text-gray-900">{formData.status}</span>
                </div>
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/listings')}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '수정 중...' : '매물 수정 저장'}
              </button>
            </div>
          </div>
        )}

        {/* 하단 네비게이션 */}
        {activeStep < 3 && (
          <div className="flex gap-3 mt-6">
            {activeStep > 0 && (
              <button
                onClick={() => setActiveStep((p) => p - 1)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                이전
              </button>
            )}
            <button
              onClick={() => setActiveStep((p) => p + 1)}
              className="flex-[2] py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
