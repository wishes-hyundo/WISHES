'use client';

import React from 'react';
import type { Step3Props } from '../types';

export default function Step3Photos({
  form,
  updateForm,
  uploadedImages,
  setUploadedImages,
  enhancedImages,
  setEnhancedImages,
  imageUploading,
  handleImageUpload,
  removeImage,
  enhanceImage,
  dragIndex,
  setDragIndex,
  watermarkEnabled,
  setWatermarkEnabled,
  setCurrentStep,
}: Step3Props) {
  return (
    <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">3</span>
                  사진 등록
                </h2>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={useEnhanced} onChange={e => setUseEnhanced(e.target.checked)}
                    className="accent-green-700 w-4 h-4" />
                  <span className="text-gray-700">✨ 자동 품질 개선 사용</span>
                </label>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                사진을 업로드하면 <strong>밝기, 대비, 선명도, 색감</strong>이 자동으로 보정됩니다.
                원본과 보정본을 비교하고 선택할 수 있습니다.
              </p>

              {/* 드래그 앤 드롭 영역 */}
              <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer ${
                  isDragOver ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => { e.preventDefault(); setIsDragOver(false); handleImageFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-4xl mb-2">📷</div>
                <div className="text-sm text-gray-600 font-medium">
                  클릭하여 사진을 선택하거나, 여기에 드래그하세요
                </div>
                <div className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP 지원 · 최대 20장</div>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={e => e.target.files && handleImageFiles(e.target.files)} />
              </div>

              {/* 업로드된 이미지 */}
              {uploadedImages.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 text-sm">
                      업로드된 사진 ({uploadedImages.length}장)
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {uploadedImages.map((img, i) => (
                      <div key={i} className={`relative group ${dragIndex === i ? 'opacity-50 scale-95' : ''} transition-all cursor-grab active:cursor-grabbing`}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={() => {
                      if (dragIndex === null || dragIndex === i) return;
                      const newImages = [...uploadedImages];
                      const [moved] = newImages.splice(dragIndex, 1);
                      newImages.splice(i, 0, moved);
                      setUploadedImages(newImages);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}>
                        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 border">
                          {img.isEnhancing ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-50">
                              <div className="text-center">
                                <div className="animate-spin w-6 h-6 border-2 border-green-700 border-t-transparent rounded-full mx-auto" />
                                <div className="text-xs text-gray-400 mt-2">품질 개선 중...</div>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={(useEnhanced && img.enhanced) ? img.enhanced : img.preview}
                              alt={`사진 ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>

                        {/* 원본/개선 토글 배지 */}
                        {img.enhanced && !img.isEnhancing && (
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-600 text-white">
                            {useEnhanced ? '✨ 개선' : '원본'}
                          </div>
                        )}

                        {/* 순서 표시 */}
                        <div className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white text-xs rounded-full flex items-center justify-center">
                          {i + 1}
                        </div>

                        {/* 호버 액션 */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition rounded-xl flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          {i > 0 && (
                            <button onClick={() => moveImage(i, i - 1)}
                              className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow text-sm">←</button>
                          )}
                          <button onClick={() => removeImage(i)}
                            className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow text-sm">✕</button>
                          {i < uploadedImages.length - 1 && (
                            <button onClick={() => moveImage(i, i + 1)}
                              className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow text-sm">→</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── 사진 등록 후: AI자동등록 / 직접 등록 선택 ── */}
            {uploadedImages.length > 0 && !showAiPanel && (
              <div className="bg-white rounded-2xl shadow-sm border p-8">
                <h3 className="text-base font-bold text-gray-800 mb-4 text-center">매물 등록 방식을 선택하세요</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={() => setShowAiPanel(true)}
                    className="p-6 border-2 border-green-600 rounded-2xl hover:bg-green-50 transition text-left group">
                    <div className="text-3xl mb-2">🤖</div>
                    <h3 className="font-bold text-green-800 text-lg group-hover:text-green-900">AI 자동등록</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      AI가 <span className="text-green-600 font-semibold">제목과 설명</span>을 자동으로 생성합니다.
                      2026 트렌드에 맞는 센스 있는 매물 소개글을 만들어 드립니다.
                    </p>
                  </button>
                  <button onClick={() => { saveDraft(); setCurrentStep(4); }}
                    className="p-6 border-2 border-gray-300 rounded-2xl hover:bg-gray-50 transition text-left group">
                    <div className="text-3xl mb-2">✍️</div>
                    <h3 className="font-bold text-gray-800 text-lg group-hover:text-gray-900">직접 등록</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      매물 제목과 설명을 <span className="text-gray-700 font-semibold">직접 작성</span>합니다.
                      원하는 대로 자유롭게 입력할 수 있습니다.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* ── AI 자동등록 패널 ── */}
            {showAiPanel && (
              <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">🤖 AI 자동등록</h3>
                  <button onClick={() => setShowAiPanel(false)} className="text-sm text-gray-400 hover:text-gray-600 transition">✕ 닫기</button>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">AI 스타일을 선택하세요</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setAiStyleOption('trendy')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'trendy' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">🔥</div>
                      <div className="font-bold text-sm text-gray-800">트렌디 2026</div>
                      <div className="text-xs text-gray-500 mt-0.5">MZ세대 감성, 꿀매물·맛집 등 트렌드 키워드</div>
                    </button>
                    <button onClick={() => setAiStyleOption('premium')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'premium' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">✨</div>
                      <div className="font-bold text-sm text-gray-800">프리미엄</div>
                      <div className="text-xs text-gray-500 mt-0.5">고급스럽고 격식 있는 프로페셔널 톤</div>
                    </button>
                    <button onClick={() => setAiStyleOption('clean')} className={`p-4 rounded-xl border-2 text-left transition ${aiStyleOption === 'clean' ? 'border-green-600 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-1">📋</div>
                      <div className="font-bold text-sm text-gray-800">클린 정석</div>
                      <div className="text-xs text-gray-500 mt-0.5">깔끔하고 정돈된 기본 포맷</div>
                    </button>
                  </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">AI 모델 선택</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAiModel('template')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                aiModel === 'template'
                  ? 'bg-gray-600 text-white ring-2 ring-gray-400'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              📝 빠른생성
            </button>
            <button
              type="button"
              onClick={() => setAiModel('best')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                aiModel === 'best'
                  ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              ✨ 최고 AI
            </button>
            <button
              type="button"
              onClick={() => setAiModel('latest')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                aiModel === 'latest'
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              ⚡ 최신 AI
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {aiModel === 'template' ? '템플릿 기반 즉시 생성' : aiModel === 'best' ? 'Claude Opus - 최고 품질 AI 작성' : 'Claude Sonnet - 빠르고 스마트한 AI'}
          </p>
        </div>

                </div>
                {!form.title && (
                  <div className="text-center">
                    <button onClick={() => runAiAutoFill(aiStyleOption, aiModel)} disabled={aiGenerating} className="px-10 py-3.5 bg-green-700 text-white rounded-xl font-semibold hover:bg-green-800 transition shadow-lg disabled:bg-gray-400 text-base">
                      {aiGenerating ? (<span className="flex items-center gap-2"><div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />AI가 매물 정보를 분석 중...</span>) : '🤖 AI 자동완성 실행'}
                    </button>
                  </div>
                )}
                {form.title && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700">📌 매물 제목 <span className="text-green-600 text-xs font-normal ml-1">AI 생성됨</span></label>
                        <button onClick={() => runAiAutoFill(aiStyleOption, aiModel)}
                          disabled={aiGenerating}
                          className="text-xs text-gray-400 hover:text-green-600 transition disabled:opacity-50">
                          {aiGenerating ? '생성 중...' : '🔄 다시 생성'}</button>
                      </div>
                      <input type="text" value={form.title} onChange={e => updateForm({ title: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-base" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">📝 매물 설명 <span className="text-green-600 text-xs font-normal ml-1">AI 생성됨</span></label>
                      <p className="text-xs text-gray-400 mb-1">※ 소재지, 면적, 층수 등 건축물대장에서 확인 가능한 정보는 제외됩니다</p>
                      <textarea value={form.description} onChange={e => updateForm({ description: e.target.value })} rows={8} className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-y text-sm leading-relaxed" />
                    </div>
                    <div className="bg-gray-50 rounded-xl p-5">
                      <h4 className="font-semibold text-gray-800 text-sm mb-3">📋 등록 정보 요약</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">소재지</div><div className="font-medium text-gray-800 truncate">{form.address || '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">거래</div><div className="font-medium text-gray-800">{form.deal === '매매' ? `매매 ${formatAmount(form.price)}` : form.deal === '전세' ? `전세 ${formatAmount(form.deposit)}` : `월세 ${formatAmount(form.deposit)}/${formatAmount(form.monthly)}`}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">유형</div><div className="font-medium text-gray-800">{form.type || '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">면적</div><div className="font-medium text-gray-800">{form.area_m2 ? `${form.area_m2}㎡` : '-'}</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">층</div><div className="font-medium text-gray-800">{form.floor_current || '-'}층 / {form.floor_total || '-'}층</div></div>
                        <div className="bg-white rounded-lg p-3"><div className="text-gray-400 text-xs">사진</div><div className="font-medium text-gray-800">{uploadedImages.length}장</div></div>
                      </div>
                      {form.features.length > 0 && (<div className="mt-3 flex flex-wrap gap-1">{form.features.map(f => (<span key={f} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{f}</span>))}</div>)}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => { setShowAiPanel(false); setCurrentStep(2); }} className="px-6 py-3 rounded-xl border text-gray-600 hover:bg-gray-50 transition">← 이전</button>
              {<button onClick={() => { saveDraft(); setCurrentStep(4); }} className="px-6 py-3 rounded-xl bg-black text-white hover:bg-gray-800 transition">다음 →</button>}
            </div>
          </div>
  );
}
