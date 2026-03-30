'use client';

import React from 'react';
import type { Step1Props } from '../types';

export default function Step1Required({
  form,
  updateForm,
  addressData,
  showAddressModal,
  setShowAddressModal,
  setCurrentStep,
  isStep1Valid,
  touchedFields,
  setTouchedFields,
  goToStep2,
}: Step1Props) {
  return (
    <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border p-8">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">1</span>
                  필수 정보 입력
                </h2>
                <p className="text-sm text-gray-500 mt-1 ml-10">3가지 필수 항목만 입력하면 나머지는 자동으로 채워집니다</p>
              </div>

              {/* 소재지 */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📍 소재지 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={form.address}
                      readOnly
                      placeholder="주소를 검색해주세요"
                      className="w-full px-4 py-3 border rounded-xl bg-gray-50 text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                      onClick={openAddressSearch}
                    />
                    {addressData && (
                      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                        <div>도로명: {addressData.roadAddress}</div>
                        <div>지번: {addressData.jibunAddress}</div>
                        <div>동: {form.dong} | 우편번호: {addressData.zonecode}</div>
                      </div>
                    )}
                  </div>
                  <button onClick={openAddressSearch}
                    className="px-5 py-3 bg-green-700 text-white rounded-xl font-medium hover:bg-green-800 transition shrink-0">
                    🔍 주소 검색
                  </button>
                </div>
                <input
                  type="text"
                  value={form.addressDetail}
                  onChange={e => updateForm({ addressDetail: e.target.value })}
                  placeholder="상세주소 (동/호수)"
                  className="w-full mt-2 px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* 거래가격 */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  💰 거래유형 및 가격 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 mb-3">
                  {DEAL_TYPES.map(d => (
                    <button key={d} onClick={() => updateForm({ deal: d, deposit: null, monthly: null, price: null })}
                      className={`flex-1 py-3 rounded-xl font-semibold transition ${
                        form.deal === d ? 'bg-green-700 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(form.deal === '월세' || form.deal === '전세') && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">보증금 (만원)</label>
                      <input type="text" inputMode="numeric"
                        value={form.deposit != null ? form.deposit.toLocaleString() : ''}
                        placeholder="예: 1,000"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ deposit: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                  {form.deal === '월세' && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">월세 (만원)</label>
                      <input type="text" inputMode="numeric"
                        value={form.monthly != null ? form.monthly.toLocaleString() : ''}
                        placeholder="예: 50"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ monthly: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                  {form.deal === '매매' && (
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">매매가 (만원)</label>
                      <input type="text" inputMode="numeric"
                        value={form.price != null ? form.price.toLocaleString() : ''}
                        placeholder="예: 30,000"
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateForm({ price: raw ? Number(raw) : null });
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  )}
                </div>
                {/* 가격 미리보기 */}
                {(form.deposit || form.monthly || form.price) && (
                  <div className="mt-2 text-sm text-green-700 font-medium">
                    💵 {form.deal === '매매' ? `매매가 ${formatAmount(form.price)}` :
                         form.deal === '전세' ? `전세 ${formatAmount(form.deposit)}` :
                         `보증금 ${formatAmount(form.deposit)} / 월세 ${formatAmount(form.monthly)}`}
                  </div>
                )}
              </div>

              {/* 매물유형 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  🏠 매물유형 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PROPERTY_TYPES.map(t => (
                    <button key={t} onClick={() => updateForm({ type: t })}
                      className={`py-3 rounded-xl font-medium text-sm transition ${
                        form.type === t ? 'bg-green-700 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* 다음 버튼 */}
              <div className="flex justify-end pt-4 border-t">
                <button onClick={goToStep2} disabled={!isStep1Valid}
                  className={`px-8 py-3 rounded-xl font-semibold text-white transition ${
                    isStep1Valid ? 'bg-green-700 hover:bg-green-800 shadow-lg' : 'bg-gray-300 cursor-not-allowed'
                  }`}>
                  다음 → 건축물대장 자동조회
                </button>
              </div>
            </div>
          </div>
  );
}
