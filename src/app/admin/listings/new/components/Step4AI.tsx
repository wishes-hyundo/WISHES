'use client';

import React from 'react';
import type { Step4Props } from '../types';

export default function Step4AI({
  form,
  updateForm,
  uploadedImages,
  enhancedImages,
  publishListing,
  isPublishing,
  uploadProgress,
  generateDescription,
  isGenerating,
  saveDraft,
  lastSavedAt,
  setCurrentStep,
  validationErrors,
}: Step4Props) {
  return (
    <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-6">
                <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">4</span>
                직접 등록
              </h2>

              {/* 매물 제목 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📌 매물 제목
                </label>
                <input type="text" value={form.title}
                  onChange={e => updateForm({ title: e.target.value })}
                  placeholder="예: 신림역 역세권 신축 원룸 월세"
                  className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {/* 매물 설명 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📝 매물 설명
                </label>
                <p className="text-xs text-gray-400 mb-1">※ 소재지, 면적, 층수 등 건축물대장에서 확인 가능한 정보는 자동 포함되므로 별도 입력 불필요</p>
                <textarea value={form.description}
                  onChange={e => updateForm({ description: e.target.value })}
                  placeholder="매물의 특장점, 주변 편의시설, 교통 등을 입력하세요"
                  rows={6}
                  className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-y" />
              </div>

              {/* 등록 요약 미리보기 */}
              <div className="bg-gray-50 rounded-xl p-5 mb-6">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">📋 등록 정보 요약</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">소재지</div>
                    <div className="font-medium text-gray-800 truncate">{form.address || '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">거래</div>
                    <div className="font-medium text-gray-800">
                      {form.deal === '매매' ? `매매 ${formatAmount(form.price)}` :
                       form.deal === '전세' ? `전세 ${formatAmount(form.deposit)}` :
                       `월세 ${formatAmount(form.deposit)}/${formatAmount(form.monthly)}`}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">유형</div>
                    <div className="font-medium text-gray-800">{form.type || '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">면적</div>
                    <div className="font-medium text-gray-800">{form.area_m2 ? `${form.area_m2}㎡` : '-'}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">층</div>
                    <div className="font-medium text-gray-800">{form.floor_current || '-'}층 / {form.floor_total || '-'}층</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-gray-400 text-xs">사진</div>
                    <div className="font-medium text-gray-800">{uploadedImages.length}장</div>
                  </div>
                </div>
                {form.features.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {form.features.map(f => (
                      <span key={f} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{f}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* 등록 방식 선택 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => publishListing('instant')} disabled={isPublishing || !form.title}
                  className="p-6 border-2 border-green-600 rounded-2xl hover:bg-green-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="text-2xl mb-2">🚀</div>
                  <h3 className="font-bold text-green-800 text-lg">즉시 업로드</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    바로 <span className="text-green-600 font-semibold">공개</span> 상태로 매물을 등록합니다.
                    즉시 홈페이지에 노출됩니다.
                  </p>
                  {isPublishing && <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-green-700 font-medium">
                      <span>업로드 진행중...</span>
                      <span>${uploadProgress}/${uploadedImages.length}</span>
                    </div>
                    <div className="w-full bg-green-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-green-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadedImages.length > 0 ? (uploadProgress / uploadedImages.length) * 100 : 0}%` }} />
                    </div>
                  </div>}
                </button>

                <button onClick={() => publishListing('review')} disabled={isPublishing || !form.title}
                  className="p-6 border-2 border-blue-400 rounded-2xl hover:bg-blue-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="text-2xl mb-2">🔍</div>
                  <h3 className="font-bold text-blue-800 text-lg">직접 등록</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="text-blue-600 font-semibold">비공개</span> 상태로 저장 후 검수합니다.
                    확인 후 수동으로 공개 전환합니다.
                  </p>
                  {isPublishing && <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-blue-700 font-medium">
                      <span>업로드 진행중...</span>
                      <span>${uploadProgress}/${uploadedImages.length}</span>
                    </div>
                    <div className="w-full bg-blue-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadedImages.length > 0 ? (uploadProgress / uploadedImages.length) * 100 : 0}%` }} />
                    </div>
                  </div>}
                </button>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setCurrentStep(3)}
                className="px-6 py-3 rounded-xl border text-gray-600 hover:bg-gray-50 transition">
                ← 이전
              </button>
            </div>
          </div>
  );
}
