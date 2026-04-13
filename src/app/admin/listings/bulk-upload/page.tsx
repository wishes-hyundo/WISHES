'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'wishes2026';

interface BulkListing {
  title: string;
  address: string;
  addressDetail: string;
  dong: string;
  type: string;
  deal: string;
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  area_m2: number | null;
  floor_current: string;
  rooms: number | null;
  description: string;
  status: string;
  // 유효성 검사 결과
  _valid: boolean;
  _errors: string[];
  _selected: boolean;
}

const REQUIRED_HEADERS = ['address', 'deal', 'type'];
const HEADER_MAP: Record<string, string> = {
  '주소': 'address', '소재지': 'address',
  '상세주소': 'addressDetail', '호수': 'addressDetail',
  '동': 'dong',
  '유형': 'type', '매물유형': 'type',
  '거래': 'deal', '거래유형': 'deal',
  '보증금': 'deposit',
  '월세': 'monthly',
  '매매가': 'price', '가격': 'price',
  '면적': 'area_m2', '전용면적': 'area_m2',
  '층': 'floor_current', '층수': 'floor_current',
  '방수': 'rooms', '방': 'rooms',
  '제목': 'title',
  '설명': 'description', '비고': 'description',
  '상태': 'status',
  // English headers
  'address': 'address', 'deal': 'deal', 'type': 'type',
  'deposit': 'deposit', 'monthly': 'monthly', 'price': 'price',
  'area': 'area_m2', 'floor': 'floor_current', 'rooms': 'rooms',
  'title': 'title', 'description': 'description', 'status': 'status',
  'dong': 'dong', 'addressDetail': 'addressDetail',
};

const VALID_TYPES = ['원룸', '투룸', '쓰리룸+', '오피스텔', '아파트', '빌라', '상가', '기타'];
const VALID_DEALS = ['월세', '전세', '매매'];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i+1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',' || ch === '\t') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i+1] === '\n') i++;
        row.push(current.trim()); current = '';
        if (row.some(c => c)) rows.push(row);
        row = [];
      } else { current += ch; }
    }
  }
  row.push(current.trim());
  if (row.some(c => c)) rows.push(row);
  return rows;
}

export default function BulkUploadPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [listings, setListings] = useState<BulkListing[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{success: number; failed: number; errors: string[]}>({success:0, failed:0, errors:[]});
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const validateListing = (l: Partial<BulkListing>): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    if (!l.address) errors.push('주소 필수');
    if (!l.deal || !VALID_DEALS.includes(l.deal)) errors.push('거래유형 필수 (월세/전세/매매)');
    if (!l.type || !VALID_TYPES.includes(l.type)) errors.push('매물유형 필수');
    if (l.deal === '월세' && (!l.deposit && l.deposit !== 0)) errors.push('보증금 필수');
    if (l.deal === '월세' && !l.monthly) errors.push('월세 필수');
    if (l.deal === '전세' && !l.deposit) errors.push('보증금 필수');
    if (l.deal === '매매' && !l.price) errors.push('매매가 필수');
    return { valid: errors.length === 0, errors };
  };

  const processFile = useCallback((file: File) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) { setParseError('데이터가 없습니다. 헤더 + 1행 이상 필요'); return; }

        const headers = rows[0].map(h => HEADER_MAP[h.trim()] || h.trim().toLowerCase());
        const missing = REQUIRED_HEADERS.filter(r => !headers.includes(r));
        if (missing.length > 0) {
          setParseError(`필수 컬럼 누락: ${missing.join(', ')}. 헤더에 주소, 거래, 유형 컬럼이 필요합니다.`);
          return;
        }

        const parsed: BulkListing[] = rows.slice(1).map(row => {
          const obj: any = {};
          headers.forEach((h, idx) => { if (row[idx] !== undefined) obj[h] = row[idx]; });
          const listing: BulkListing = {
            title: obj.title || `${obj.type || ''} ${obj.deal || ''} - ${obj.address || ''}`.trim(),
            address: obj.address || '',
            addressDetail: obj.addressDetail || '',
            dong: obj.dong || '',
            type: obj.type || '',
            deal: obj.deal || '',
            deposit: obj.deposit ? Number(obj.deposit) : null,
            monthly: obj.monthly ? Number(obj.monthly) : null,
            price: obj.price ? Number(obj.price) : null,
            area_m2: obj.area_m2 ? Number(obj.area_m2) : null,
            floor_current: obj.floor_current || '',
            rooms: obj.rooms ? Number(obj.rooms) : null,
            description: obj.description || '',
            status: obj.status || '공개',
            _valid: false, _errors: [], _selected: true,
          };
          const v = validateListing(listing);
          listing._valid = v.valid;
          listing._errors = v.errors;
          return listing;
        });

        setListings(parsed);
        setStep('preview');
      } catch (err) {
        setParseError('파일 파싱 오류: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
      }
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt'))) {
      processFile(file);
    } else {
      setParseError('CSV, TSV 파일만 지원됩니다.');
    }
  }, [processFile]);

  const handleUpload = async () => {
    const selected = listings.filter(l => l._selected && l._valid);
    if (selected.length === 0) return;
    setUploading(true); setProgress(0);
    const errors: string[] = [];
    let success = 0;

    for (let i = 0; i < selected.length; i++) {
      const l = selected[i];
      try {
        const body: any = {
          title: l.title, address: l.address, address_detail: l.addressDetail,
          dong: l.dong, type: l.type, deal: l.deal,
          deposit: l.deposit, monthly: l.monthly, price: l.price,
          area_m2: l.area_m2, floor_current: l.floor_current,
          rooms: l.rooms, description: l.description,
          status: l.status === '비공개' ? '비공개' : '공개',
        };
        const resp = await fetch('/api/admin/listings', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) { success++; }
        else {
          const err = await resp.json().catch(() => ({}));
          errors.push(`#${i+1} ${l.address}: ${err.error || '등록 실패'}`);
        }
      } catch (err) {
        errors.push(`#${i+1} ${l.address}: 네트워크 오류`);
      }
      setProgress(i + 1);
    }

    setResults({ success, failed: errors.length, errors });
    setUploading(false);
    setStep('result');
  };

  const validCount = listings.filter(l => l._valid && l._selected).length;
  const invalidCount = listings.filter(l => !l._valid).length;

  return (
    <div className="max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push('/admin/listings')} className="text-gray-400 hover:text-gray-600 text-sm mb-1 flex items-center gap-1">
            ← 매물 관리로 돌아가기
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            📦 대량 매물 등록
          </h1>
          <p className="text-sm text-gray-500 mt-1">CSV 파일로 여러 매물을 한번에 등록할 수 있습니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            {step === 'upload' ? '1. 파일 업로드' : step === 'preview' ? '2. 미리보기' : '3. 완료'}
          </span>
        </div>
      </div>

      {/* Step 1: 파일 업로드 */}
      {step === 'upload' && (
        <div className="space-y-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${dragOver ? 'border-green-500 bg-green-50 scale-[1.01]' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'}`}
          >
            <div className="text-5xl mb-4">📁</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">CSV 파일을 드래그하거나 클릭하세요</h3>
            <p className="text-sm text-gray-500">지원 형식: .csv, .tsv, .txt (UTF-8 인코딩)</p>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
          </div>

          {parseError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">❌ {parseError}</div>
          )}

          {/* 양식 안내 */}
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <h3 className="font-bold text-gray-800 mb-3">📋 CSV 양식 안내</h3>
            <div className="bg-gray-50 rounded-xl p-4 font-mono text-xs overflow-x-auto mb-4">
              <div className="text-gray-500 mb-1">↓ 첫번째 행은 헤더입니다</div>
              <div>주소,상세주소,동,유형,거래,보증금,월세,면적,층,방수,제목,설명</div>
              <div className="text-green-700">서울 관악구 남부순환로181길 25-10,101호,신림동,원룸,월세,3000,60,23,,신림역 원룸,역세권 신축</div>
              <div className="text-green-700">서울 관악구 관천로16길 5,201호,신림동,투룸,전세,15000,,,35,2,관천로 투룸,풀옵션</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="font-semibold text-red-600">* 필수:</span> 주소, 거래(월세/전세/매매), 유형(원룸/투룸/...)</div>
              <div><span className="font-semibold text-blue-600">선택:</span> 보증금, 월세, 매매가, 면적, 층, 방수 등</div>
              <div><span className="font-semibold text-gray-600">금액:</span> 만원 단위 (예: 3000 = 3천만원)</div>
              <div><span className="font-semibold text-gray-600">유형:</span> 원룸, 투룸, 쓰리룸+, 오피스텔, 아파트, 빌라, 상가</div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 미리보기 */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* 요약 */}
          <div className="flex items-center gap-3 p-4 bg-white rounded-xl border shadow-sm">
            <span className="text-2xl">📊</span>
            <div className="flex-1">
              <span className="font-bold text-gray-800">총 {listings.length}건</span>
              <span className="text-sm text-gray-500 ml-2">
                (✅ 유효 {listings.filter(l=>l._valid).length}건 / ❌ 오류 {invalidCount}건)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setStep('upload'); setListings([]); }}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">다시 선택</button>
              <button onClick={handleUpload} disabled={uploading || validCount === 0}
                className="px-6 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {uploading ? `업로드중 ${progress}/${validCount}` : `✅ ${validCount}건 등록하기`}
              </button>
            </div>
          </div>
          {uploading && (
            <div className="w-full bg-green-100 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full transition-all" style={{width:`${(progress/validCount)*100}%`}} />
            </div>
          )}
          {/* 테이블 */}
          <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <input type="checkbox" checked={listings.every(l=>l._selected)}
                      onChange={(e) => setListings(listings.map(l=>({...l, _selected: e.target.checked})))}
                      className="rounded" />
                  </th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 w-10">#</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">상태</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">주소</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">유형</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">거래</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">가격</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">면적</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">층</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">제목</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {listings.map((l, i) => (
                  <tr key={i} className={`${!l._valid ? 'bg-red-50' : l._selected ? '' : 'opacity-50'}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={l._selected} disabled={!l._valid}
                        onChange={() => { const n = [...listings]; n[i]._selected = !n[i]._selected; setListings(n); }}
                        className="rounded" />
                    </td>
                    <td className="px-3 py-2 text-gray-400">{i+1}</td>
                    <td className="px-3 py-2">
                      {l._valid ?
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full">✅</span> :
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full" title={l._errors.join(', ')}>❌</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{l.address} {l.addressDetail}</td>
                    <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{l.type || '-'}</span></td>
                    <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">{l.deal || '-'}</span></td>
                    <td className="px-3 py-2 font-semibold text-gray-800">
                      {l.deal === '매매' ? (l.price ? `${l.price}만` : '-') :
                       l.deal === '전세' ? (l.deposit ? `${l.deposit}만` : '-') :
                       `${l.deposit || 0}/${l.monthly || 0}만`}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{l.area_m2 ? `${l.area_m2}㎡` : '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{l.floor_current || '-'}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{l.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invalidCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              ⚠️ 오류 {invalidCount}건은 자동으로 제외됩니다. 유효한 {validCount}건만 등록됩니다.
            </div>
          )}
        </div>
      )}

      {/* Step 3: 결과 */}
      {step === 'result' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center">
            <div className="text-5xl mb-4">{results.failed === 0 ? '🎉' : '⚠️'}</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {results.failed === 0 ? '대량 등록 완료!' : '대량 등록 완료 (일부 오류)'}
            </h2>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{results.success}</div>
                <div className="text-sm text-gray-500">성공</div>
              </div>
              {results.failed > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-500">{results.failed}</div>
                  <div className="text-sm text-gray-500">실패</div>
                </div>
              )}
            </div>
            {results.errors.length > 0 && (
              <div className="mt-4 text-left bg-red-50 rounded-xl p-4">
                <h3 className="font-semibold text-red-700 text-sm mb-2">오류 상세</h3>
                {results.errors.map((e, i) => <div key={i} className="text-xs text-red-600">{e}</div>)}
              </div>
            )}
            <div className="flex justify-center gap-3 mt-6">
              <button onClick={() => router.push('/admin/listings')}
                className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700">
                매물 관리로 이동
              </button>
              <button onClick={() => { setStep('upload'); setListings([]); setResults({success:0,failed:0,errors:[]}); }}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50">
                추가 등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
