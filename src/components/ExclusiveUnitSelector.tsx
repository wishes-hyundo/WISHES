'use client';

import React, { useState, useMemo } from 'react';

/* ─── 타입 정의 ─── */
export interface ExclusiveUnit {
  dongNm: string;
  hoNm: string;
  flrNo: string;
  flrNoNm: string;
  exclusiveArea: number;
  commonArea: number;
  totalArea: number;
  floorNum: number;
  mainPurpsCdNm: string;
  etcPurps: string;
  strctCdNm: string;
}

interface ExclusiveUnitSelectorProps {
  units: ExclusiveUnit[];
  onSelectUnit: (unit: ExclusiveUnit) => void;
  selectedUnit: ExclusiveUnit | null;
  propertyType?: string;
}

/* ─── 전유부 필요 여부 사전 판단 ─── */
export function needsExclusivePart(propertyType: string): boolean | null {
  const NEEDS_EXCLUSIVE: string[] = [
    '아파트', 'apartment', 'apt',
    '오피스텔', 'officetel',
    '빌라', '연립', '다세대', 'villa',
    '주상복합',
  ];
  const NO_EXCLUSIVE: string[] = [
    '단독주택', '다가구', '다중주택',
    '토지', 'land',
    '공장', '창고', 'warehouse',
  ];
  const MAYBE_EXCLUSIVE: string[] = [
    '상가', '사무실', 'office', '근린생활',
    '원룸', '투룸', 'studio',
    '지식산업센터', '아파트형공장',
  ];

  const lower = propertyType.toLowerCase();

  if (NEEDS_EXCLUSIVE.some(t => lower.includes(t.toLowerCase()))) return true;
  if (NO_EXCLUSIVE.some(t => lower.includes(t.toLowerCase()))) return false;
  if (MAYBE_EXCLUSIVE.some(t => lower.includes(t.toLowerCase()))) return null;

  return null;
}

/* ─── 면적 포맷 유틸 ─── */
function fmtArea(v: number): string {
  return v ? `${v.toFixed(2)}m\u00B2` : '-';
}
function sqmToPyeong(v: number): string {
  return v ? `${(v / 3.305785).toFixed(1)}평` : '-';
}

/* ─── 메인 컴포넌트 ─── */
export default function ExclusiveUnitSelector({
  units,
  onSelectUnit,
  selectedUnit,
  propertyType,
}: ExclusiveUnitSelectorProps) {
  const [filterDong, setFilterDong] = useState<string>('all');
  const [filterFloor, setFilterFloor] = useState<string>('all');
  const [searchHo, setSearchHo] = useState<string>('');

  /* 동 목록 추출 */
  const dongList = useMemo(() => {
    const set = new Set(units.map(u => u.dongNm).filter(Boolean));
    return Array.from(set).sort();
  }, [units]);

  /* 층 범위 추출 */
  const floorRanges = useMemo(() => {
    const floors = units.map(u => u.floorNum).filter(f => f > 0);
    if (floors.length === 0) return [];
    const max = Math.max(...floors);
    const ranges: { label: string; min: number; max: number }[] = [];
    for (let i = 1; i <= max; i += 5) {
      ranges.push({
        label: `${i}~${Math.min(i + 4, max)}층`,
        min: i,
        max: Math.min(i + 4, max),
      });
    }
    return ranges;
  }, [units]);

  /* 필터링된 호실 */
  const filteredUnits = useMemo(() => {
    return units.filter(u => {
      if (filterDong !== 'all' && u.dongNm !== filterDong) return false;
      if (filterFloor !== 'all') {
        const range = floorRanges.find(r => r.label === filterFloor);
        if (range && (u.floorNum < range.min || u.floorNum > range.max)) return false;
      }
      if (searchHo && !u.hoNm.includes(searchHo)) return false;
      return true;
    });
  }, [units, filterDong, filterFloor, searchHo, floorRanges]);

  if (!units || units.length === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-blue-900 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">
            &#x1F3E0;
          </span>
          호실 선택 (전유부)
        </h3>
        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
          {units.length}개 호실
        </span>
      </div>

      {/* 안내 메시지 */}
      <p className="text-xs text-blue-700 mb-3">
        집합건물로 확인되어 전유부(호실별 면적) 정보를 자동으로 불러왔습니다.
        호실을 선택하면 전용면적, 공급면적, 층수가 자동 입력됩니다.
      </p>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {dongList.length > 1 && (
          <select
            value={filterDong}
            onChange={e => setFilterDong(e.target.value)}
            className="text-xs px-2 py-1.5 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
          >
            <option value="all">전체 동</option>
            {dongList.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
        {floorRanges.length > 1 && (
          <select
            value={filterFloor}
            onChange={e => setFilterFloor(e.target.value)}
            className="text-xs px-2 py-1.5 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
          >
            <option value="all">전체 층</option>
            {floorRanges.map(r => (
              <option key={r.label} value={r.label}>{r.label}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={searchHo}
          onChange={e => setSearchHo(e.target.value)}
          placeholder="호수 검색..."
          className="text-xs px-2 py-1.5 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none w-24"
        />
        <span className="text-xs text-blue-500 self-center ml-auto">
          {filteredUnits.length}건 표시
        </span>
      </div>

      {/* 호실 그리드 */}
      <div className="grid gap-2 max-h-64 overflow-y-auto pr-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
        {filteredUnits.map((unit, idx) => {
          const isSelected =
            selectedUnit?.dongNm === unit.dongNm &&
            selectedUnit?.hoNm === unit.hoNm;

          return (
            <button
              key={`${unit.dongNm}_${unit.hoNm}_${idx}`}
              onClick={() => onSelectUnit(unit)}
              className={`
                text-left p-2.5 rounded-lg border text-xs transition-all
                ${isSelected
                  ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-[1.02]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                }
              `}
            >
              <div className="font-bold text-sm mb-1">
                {unit.dongNm ? `${unit.dongNm} ` : ''}{unit.hoNm}
              </div>
              <div className={isSelected ? 'text-blue-100' : 'text-gray-500'}>
                {unit.floorNum}층
              </div>
              <div className={`font-medium mt-1 ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                {fmtArea(unit.exclusiveArea)}
              </div>
              <div className={isSelected ? 'text-blue-200' : 'text-gray-400'}>
                ({sqmToPyeong(unit.exclusiveArea)})
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 호실 상세 정보 */}
      {selectedUnit && (
        <div className="mt-3 bg-white rounded-lg p-3 border border-blue-200">
          <div className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1">
            <span>&#x2705;</span> 선택된 호실 정보 (자동 입력됨)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-gray-400">호실:</span>{' '}
              <span className="font-medium">
                {selectedUnit.dongNm ? `${selectedUnit.dongNm} ` : ''}{selectedUnit.hoNm}
              </span>
            </div>
            <div>
              <span className="text-gray-400">전용면적:</span>{' '}
              <span className="font-medium text-blue-700">
                {fmtArea(selectedUnit.exclusiveArea)} ({sqmToPyeong(selectedUnit.exclusiveArea)})
              </span>
            </div>
            <div>
              <span className="text-gray-400">공용면적:</span>{' '}
              <span className="font-medium">{fmtArea(selectedUnit.commonArea)}</span>
            </div>
            <div>
              <span className="text-gray-400">공급면적:</span>{' '}
              <span className="font-medium text-green-700">
                {fmtArea(selectedUnit.totalArea)} ({sqmToPyeong(selectedUnit.totalArea)})
              </span>
            </div>
            <div>
              <span className="text-gray-400">층:</span>{' '}
              <span className="font-medium">{selectedUnit.floorNum}층</span>
            </div>
            {selectedUnit.mainPurpsCdNm && (
              <div>
                <span className="text-gray-400">용도:</span>{' '}
                <span className="font-medium">{selectedUnit.mainPurpsCdNm}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
