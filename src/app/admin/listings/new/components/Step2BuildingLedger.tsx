'use client';

import React from 'react';
import type { Step2Props } from '../types';
import { pyeongToSqm, sqmToPyeong } from '../utils';

export default function Step2BuildingLedger({
  form,
  updateForm,
  buildingInfo,
  buildingLoading,
  buildingError,
  buildingRawData,
  fetchBuildingLedger,
  downloadBuildingPdf,
  setCurrentStep,
  addressData,
}: Step2Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 좌측: 건축물대장 */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span className="w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm">2</span>
                    건축물대장 정보
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={fetchBuildingLedger} disabled={buildingLoading}
                      className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition">
                      {buildingLoading ? '⏳ 조회 중...' : '🔄 재조회'}
                    </button>
                    <button onClick={() => setShowBuildingDoc(!showBuildingDoc)}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">
                      📄 {showBuildingDoc ? '정보 보기' : '원본 보기'}
                    </button>
                    {buildingInfo && (
                      <button onClick={downloadBuildingPdf}
                        className="px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition">
                        📥 PDF 저장
                      </button>
                    )}
                  </div>
                </div>

                {buildingLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-3 border-green-700 border-t-transparent rounded-full" />
                    <span className="ml-3 text-gray-500">건축물대장 조회 중...</span>
                  </div>
                )}

                {buildingError && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">
                    ⚠️ {buildingError}
                    <button onClick={fetchBuildingLedger} className="ml-2 underline">재시도</button>
                  </div>
                )}

                {buildingInfo && !showBuildingDoc && (
                  <div className="space-y-4 text-sm">
                    {/* 기본 정보 */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">🏢 건물 기본정보</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">건물명:</span> {buildingInfo.건물명 || '-'}</div>
                        <div><span className="text-gray-400">주용도:</span> {buildingInfo.주용도 || '-'}</div>
                        <div><span className="text-gray-400">구조:</span> {buildingInfo.건물구조 || '-'}</div>
                        <div><span className="text-gray-400">지붕:</span> {buildingInfo.지붕구조 || '-'}</div>
                        <div><span className="text-gray-400">사용승인:</span> {formatDate(buildingInfo.사용승인일)}</div>
                        <div><span className="text-gray-400">대장구분:</span> {buildingInfo.대장구분 || '-'}</div>
                      </div>
                    </div>

                    {/* 면적/비율 */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">📐 면적 · 비율</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">대지면적:</span> {formatArea(buildingInfo.대지면적)}</div>
                        <div><span className="text-gray-400">건축면적:</span> {formatArea(buildingInfo.건축면적)}</div>
                        <div><span className="text-gray-400">연면적:</span> {formatArea(buildingInfo.연면적)}</div>
                        <div><span className="text-gray-400">건폐율:</span> {buildingInfo.건폐율?.toFixed(1)}%</div>
                        <div><span className="text-gray-400">용적률:</span> {buildingInfo.용적률?.toFixed(1)}%</div>
                      </div>
                    </div>

                    {/* 층수/승강기/주차 */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">🔢 층수 · 시설</h3>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div><span className="text-gray-400">지상/지하:</span> {buildingInfo.지상층수}층 / B{buildingInfo.지하층수}</div>
                        <div><span className="text-gray-400">승강기:</span> {(buildingInfo.승용엘리베이터||0) + (buildingInfo.비상용엘리베이터||0)}대</div>
                        <div><span className="text-gray-400">주차:</span> {buildingInfo.총주차대수}대</div>
                        <div><span className="text-gray-400">세대/호수:</span> {buildingInfo.세대수}세대 / {buildingInfo.호수}호</div>
                      </div>
                    </div>

                    {/* 층별 개요 */}
                    {buildingInfo.층별개요 && buildingInfo.층별개요.length > 0 && (
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h3 className="font-semibold text-gray-800 mb-2">📊 층별개요</h3>
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-400 border-b">
                              <th className="text-left py-1">층</th><th className="text-left py-1">구분</th>
                              <th className="text-left py-1">용도</th><th className="text-right py-1">면적(㎡)</th>
                            </tr></thead>
                            <tbody>
                              {buildingInfo.층별개요.map((f, i) => (
                                <tr key={i} className="text-gray-600 border-b border-gray-100">
                                  <td className="py-1">{f.층번호}</td><td className="py-1">{f.층구분}</td>
                                  <td className="py-1">{f.층용도}</td><td className="text-right py-1">{f.면적?.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 건축물대장 원본 이미지 (공문서 스타일) */}
                {buildingInfo && showBuildingDoc && (
                  <div className="border-2 border-gray-800 rounded-lg bg-white p-6 text-sm font-['Batang','serif']">
                    <div className="text-center mb-4">
                      <div className="text-xs text-gray-500 mb-1">국토교통부 건축물대장 정보</div>
                      <h3 className="text-lg font-bold border-b-2 border-black pb-2">건 축 물 대 장</h3>
                      <div className="text-xs text-gray-400 mt-1">
                        (건축물대장HUB 서비스 API 조회 결과)
                      </div>
                    </div>

                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 w-24 border-r border-gray-600">대장 구분</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.대장구분}</td>
                          <td className="bg-gray-100 font-bold p-2 w-24 border-r border-gray-600">대장 종류</td>
                          <td className="p-2">{buildingInfo.대장종류}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">도로명주소</td>
                          <td className="p-2" colSpan={3}>{buildingInfo.도로명주소 || form.road_address}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">지번주소</td>
                          <td className="p-2" colSpan={3}>{buildingInfo.지번주소 || form.jibun_address}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">건물명</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.건물명 || '-'}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">주용도</td>
                          <td className="p-2">{buildingInfo.주용도}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">건물구조</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.건물구조}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">지붕구조</td>
                          <td className="p-2">{buildingInfo.지붕구조 || '-'}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">대지면적</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.대지면적?.toFixed(2)}㎡</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">건축면적</td>
                          <td className="p-2">{buildingInfo.건축면적?.toFixed(2)}㎡</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">연면적</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.연면적?.toFixed(2)}㎡</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">건폐율</td>
                          <td className="p-2">{buildingInfo.건폐율?.toFixed(2)}%</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">용적률</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.용적률?.toFixed(2)}%</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">사용승인일</td>
                          <td className="p-2">{formatDate(buildingInfo.사용승인일)}</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">지상층수</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.지상층수}층</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">지하층수</td>
                          <td className="p-2">{buildingInfo.지하층수}층</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">승강기</td>
                          <td className="p-2 border-r border-gray-600">승용 {buildingInfo.승용엘리베이터}대 / 비상 {buildingInfo.비상용엘리베이터}대</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">총주차</td>
                          <td className="p-2">{buildingInfo.총주차대수}대</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">세대수</td>
                          <td className="p-2 border-r border-gray-600">{buildingInfo.세대수}세대</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">호수</td>
                          <td className="p-2">{buildingInfo.호수}호</td>
                        </tr>
                        <tr className="border border-gray-600">
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">허가일</td>
                          <td className="p-2 border-r border-gray-600">{formatDate(buildingInfo.허가일)}</td>
                          <td className="bg-gray-100 font-bold p-2 border-r border-gray-600">착공일</td>
                          <td className="p-2">{formatDate(buildingInfo.착공일)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="mt-4 text-center text-xs text-gray-400">
                      조회일시: {new Date().toLocaleString('ko-KR')} | 출처: 국토교통부 건축물대장정보 서비스
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 우측: 세부정보 */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <h3 className="font-bold text-gray-900 mb-4">📝 세부정보 (수정 가능)</h3>

                <div className="space-y-4">
                  {/* 면적 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">전용면적 (㎡)</label>
                      <input type="number" step="0.1" value={form.area_m2 ?? ''} placeholder="예: 33.5"
                        onChange={e => updateForm({ area_m2: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">공급면적 (㎡)</label>
                      <input type="number" step="0.1" value={form.area_supply_m2 ?? ''} placeholder="예: 45.2"
                        onChange={e => updateForm({ area_supply_m2: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                  </div>

                  {/* 층 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">해당층</label>
                      <input type="text" value={form.floor_current} placeholder="예: 5"
                        onChange={e => updateForm({ floor_current: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">전체층</label>
                      <input type="text" value={form.floor_total} readOnly
                        className="w-full px-3 py-2.5 border rounded-lg bg-gray-50 text-sm text-gray-500" />
                    </div>
                  </div>

                  {/* 방/욕실 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">방 개수</label>
                      <input type="number" value={form.rooms ?? ''} placeholder="예: 2"
                        onChange={e => updateForm({ rooms: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">욕실 수</label>
                      <input type="number" value={form.bathrooms ?? ''} placeholder="예: 1"
                        onChange={e => updateForm({ bathrooms: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    </div>
                  </div>

                  {/* 방향 / 난방 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">방향</label>
                      <select value={form.direction} onChange={e => updateForm({ direction: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="">선택</option>
                        {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">난방방식</label>
                      <select value={form.heating_type} onChange={e => updateForm({ heating_type: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="">선택</option>
                        {HEATING_TYPES.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* 관리비 */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">관리비 (만원)</label>
                    <input type="text" inputMode="numeric" value={form.maintenance_fee != null ? form.maintenance_fee.toLocaleString() : ''} placeholder="예: 5"
                      onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateForm({ maintenance_fee: raw ? Number(raw) : null }); }}
                      className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {MAINTENANCE_OPTIONS.map(opt => (
                        <button key={opt} onClick={() => {
                          const arr = form.maintenance_includes.includes(opt)
                            ? form.maintenance_includes.filter(o => o !== opt)
                            : [...form.maintenance_includes, opt];
                          updateForm({ maintenance_includes: arr });
                        }}
                          className={`px-2 py-1 text-xs rounded-md transition ${
                            form.maintenance_includes.includes(opt) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 입주 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">입주유형</label>
                      <select value={form.move_in_type} onChange={e => updateForm({ move_in_type: e.target.value })}
                        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                        <option value="즉시">즉시 입주</option>
                        <option value="협의">협의</option>
                        <option value="날짜지정">날짜 지정</option>
                      </select>
                    </div>
                    {form.move_in_type === '날짜지정' && (
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">입주예정일</label>
                        <input type="date" value={form.move_in_date}
                          onChange={e => updateForm({ move_in_date: e.target.value })}
                          className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                      </div>
                    )}
                  </div>

                  {/* 특징 */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">특징 태그</label>
                    <div className="flex flex-wrap gap-1.5">
                      {FEATURES_OPTIONS.map(f => (
                        <button key={f} onClick={() => {
                          const arr = form.features.includes(f)
                            ? form.features.filter(x => x !== f)
                            : [...form.features, f];
                          updateForm({ features: arr });
                        }}
                          className={`px-3 py-1.5 text-xs rounded-full transition ${
                            form.features.includes(f)
                              ? 'bg-green-700 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 다음 버튼 */}
              <div className="flex justify-between">
                <button onClick={() => setCurrentStep(1)}
                  className="px-6 py-3 rounded-xl border text-gray-600 hover:bg-gray-50 transition">
                  ← 이전
                </button>
                <button onClick={() => { saveDraft(); setCurrentStep(3); }}
                  className="px-8 py-3 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition shadow-lg">
                  다음 → 사진 등록
                </button>
              </div>
            </div>
          </div>
  );
}
