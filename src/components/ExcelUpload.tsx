'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Download, AlertCircle, CheckCircle2, FileText, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExcelUploadProps {
  onSubmit: (listings: any[]) => Promise<void>;
  authHeader?: string;
}

interface ParsedRow {
  row: number;
  data: Record<string, any>;
  errors: string[];
  isValid: boolean;
}

// 엑셀 셀 값을 한국 문자열로 변환 ("O"/"X" → boolean)
const parseExcelValue = (value: any, fieldName: string): any => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const stringValue = String(value).trim();

  // Boolean 필드 처리 (O/X → true/false)
  if (['parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available'].includes(fieldName)) {
    return stringValue.toUpperCase() === 'O';
  }

  // 숫자 필드 처리
  if (['deposit', 'monthly', 'price', 'maintenance_fee', 'area_m2', 'area_supply_m2', 'floor_current', 'floor_total', 'rooms', 'bathrooms', 'built_year'].includes(fieldName)) {
    const num = parseInt(stringValue, 10);
    return isNaN(num) ? null : num;
  }

  return stringValue;
};

// 엑셀에서 로드
const loadXLSX = async () => {
  if ((window as any).XLSX) return (window as any).XLSX;
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve((window as any).XLSX);
    document.head.appendChild(script);
  });
};

// 엑셀 컬럼 매핑
const COLUMN_MAPPING: Record<string, string> = {
  '제목': 'title',
  '유형': 'type',
  '거래유형': 'deal',
  '보증금': 'deposit',
  '월세': 'monthly',
  '매매가': 'price',
  '관리비': 'maintenance_fee',
  '전용면적': 'area_m2',
  '공급면적': 'area_supply_m2',
  '현층': 'floor_current',
  '총층': 'floor_total',
  '방수': 'rooms',
  '욕실수': 'bathrooms',
  '방향': 'direction',
  '난방방식': 'heating_type',
  '주소': 'address',
  '동': 'dong',
  '상세주소': 'address_detail',
  '설명': 'description',
  '입주가능일': 'available_date',
  '준공연도': 'built_year',
  '주차': 'parking',
  '엘리베이터': 'elevator',
  '반려동물': 'pet',
  '발코니': 'balcony',
  '풀옵션': 'full_option',
  '대출가능': 'loan_available',
};

// 필수 필드
const REQUIRED_FIELDS = ['title', 'type', 'deal', 'deposit', 'area_m2', 'floor_current', 'address', 'dong'];

// 검증 함수
const validateListing = (data: Record<string, any>, rowNumber: number): ParsedRow => {
  const errors: string[] = [];

  // 필수 필드 검증
  REQUIRED_FIELDS.forEach((field) => {
    if (!data[field]) {
      errors.push(`필수 항목 미입력: ${field}`);
    }
  });

  // 유형 검증
  if (data.type && !['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'].includes(data.type)) {
    errors.push(`유효하지 않은 유형: ${data.type}`);
  }

  // 거래유형 검증
  if (data.deal && !['전세', '월세', '매매'].includes(data.deal)) {
    errors.push(`유효하지 않은 거래유형: ${data.deal}`);
  }

  // 조건부 필수 필드
  if (data.deal === '월세' && !data.monthly) {
    errors.push('월세는 월세 금액이 필수입니다');
  }
  if (data.deal === '매매' && !data.price) {
    errors.push('매매는 매매가가 필수입니다');
  }

  return {
    row: rowNumber,
    data,
    errors,
    isValid: errors.length === 0,
  };
};

export function ExcelUpload({ onSubmit, authHeader }: ExcelUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const XLSX = await loadXLSX();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

      if (!rows || rows.length === 0) {
        alert('파일이 비어있습니다');
        return;
      }

      // 헤더 행 (첫 번째 행)
      const headers = rows[0] as string[];
      const columnMap: Record<number, string> = {};

      headers.forEach((header, index) => {
        if (header && COLUMN_MAPPING[header]) {
          columnMap[index] = COLUMN_MAPPING[header];
        }
      });

      // 데이터 행 파싱
      const parsed: ParsedRow[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as any[];

        // 빈 행 건너뛰기
        if (!row || row.every((cell) => !cell)) {
          continue;
        }

        const data: Record<string, any> = {};
        row.forEach((cellValue, cellIndex) => {
          const fieldName = columnMap[cellIndex];
          if (fieldName) {
            data[fieldName] = parseExcelValue(cellValue, fieldName);
          }
        });

        const validation = validateListing(data, i + 1);
        parsed.push(validation);
      }

      setParsedData(parsed);
      setShowPreview(true);
    } catch (error) {
      alert(`파일 처리 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && file.name.endsWith('.xlsx')) {
        await processFile(file);
      } else {
        alert('.xlsx 파일만 선택 가능합니다');
      }
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file && file.name.endsWith('.xlsx')) {
        await processFile(file);
      } else {
        alert('.xlsx 파일만 지원됩니다');
      }
    },
    [processFile]
  );

  const handleSubmit = async () => {
    const validListings = parsedData.filter((p) => p.isValid).map((p) => p.data);

    if (validListings.length === 0) {
      alert('유효한 매물 데이터가 없습니다');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit(validListings);
      alert(`${validListings.length}개의 매물이 등록되었습니다`);
      setParsedData([]);
      setShowPreview(false);
    } catch (error) {
      alert(`등록 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await loadXLSX();

    // 헤더 행 생성
    const headers = Object.keys(COLUMN_MAPPING);

    // 샘플 데이터
    const sampleData = [
      {
        '제목': '강남 원룸 우산동 신축',
        '유형': '원룸',
        '거래유형': '월세',
        '보증금': '1000',
        '월세': '45',
        '매매가': '',
        '관리비': '5',
        '전용면적': '22',
        '공급면적': '33',
        '현층': '3',
        '총층': '8',
        '방수': '1',
        '욕실수': '1',
        '방향': '남향',
        '난방방식': '중앙난방',
        '주소': '서울시 강남구 우산동',
        '동': '우산',
        '상세주소': '우산빌 301호',
        '설명': '신축 건물, 채광 좋음',
        '입주가능일': '2026-04-15',
        '준공연도': '2024',
        '주차': 'O',
        '엘리베이터': 'O',
        '반려동물': 'X',
        '발코니': 'O',
        '풀옵션': 'O',
        '대출가능': 'O',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet([headers, ...sampleData], { header: 1 });

    // 컬럼 너비 설정
    worksheet['!cols'] = Array(headers.length).fill({ wch: 15 });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '매물등록');
    XLSX.writeFile(workbook, 'wishes-listing-template.xlsx');
  };

  // 프리뷰 테이블
  if (showPreview && parsedData.length > 0) {
    const validCount = parsedData.filter((p) => p.isValid).length;
    const errorCount = parsedData.filter((p) => !p.isValid).length;

    return (
      <div className="w-full space-y-6">
        {/* 통계 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-wishes-light/20 border border-wishes-accent rounded-xl p-4">
            <p className="text-sm text-wishes-text font-medium">유효한 매물</p>
            <p className="text-2xl font-bold text-wishes-primary mt-1">{validCount}</p>
          </div>
          <div className={cn(
            'border rounded-xl p-4',
            errorCount > 0 ? 'bg-red-50 border-red-200' : 'bg-wishes-light/20 border-wishes-accent'
          )}>
            <p className={cn('text-sm font-medium', errorCount > 0 ? 'text-red-700' : 'text-wishes-text')}>
              오류
            </p>
            <p className={cn('text-2xl font-bold mt-1', errorCount > 0 ? 'text-red-600' : 'text-wishes-primary')}>
              {errorCount}
            </p>
          </div>
        </div>

        {/* 프리뷰 테이블 */}
        <div className="border border-wishes-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-wishes-bg sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-wishes-text">행</th>
                  <th className="px-4 py-3 text-left font-semibold text-wishes-text">제목</th>
                  <th className="px-4 py-3 text-left font-semibold text-wishes-text">유형</th>
                  <th className="px-4 py-3 text-left font-semibold text-wishes-text">거래</th>
                  <th className="px-4 py-3 text-left font-semibold text-wishes-text">주소</th>
                  <th className="px-4 py-3 text-left font-semibold text-wishes-text">상태</th>
                  <th className="px-4 py-3 text-left font-semibold text-wishes-text">메시지</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wishes-border">
                {parsedData.map((row) => (
                  <tr key={row.row} className={row.isValid ? '' : 'bg-red-50'}>
                    <td className="px-4 py-3 text-wishes-text">{row.row}</td>
                    <td className="px-4 py-3 text-wishes-text truncate max-w-xs">{row.data.title || '-'}</td>
                    <td className="px-4 py-3 text-wishes-text">{row.data.type || '-'}</td>
                    <td className="px-4 py-3 text-wishes-text">{row.data.deal || '-'}</td>
                    <td className="px-4 py-3 text-wishes-text truncate max-w-xs">{row.data.address || '-'}</td>
                    <td className="px-4 py-3">
                      {row.isValid ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-medium">정상</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-600">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-xs font-medium">오류</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-red-600 text-xs">
                      {row.errors.length > 0 ? (
                        <details className="cursor-pointer">
                          <summary className="hover:underline">{row.errors.length}개 오류</summary>
                          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-red-600">
                            {row.errors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setParsedData([]);
              setShowPreview(false);
            }}
            className="px-6 py-2.5 rounded-lg border border-wishes-border text-wishes-text font-semibold hover:bg-wishes-bg transition-colors"
          >
            <Trash2 className="w-4 h-4 inline mr-2" />
            초기화
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || validCount === 0}
            className="flex-1 px-6 py-2.5 rounded-lg bg-wishes-primary text-white font-semibold hover:bg-wishes-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '등록 중...' : `등록 (${validCount}개)`}
          </button>
        </div>
      </div>
    );
  }

  // 업로드 UI
  return (
    <div className="w-full space-y-4">
      {/* 드래그 앤 드롭 영역 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-wishes-accent bg-wishes-accent/10'
            : 'border-wishes-border hover:border-wishes-accent hover:bg-wishes-bg'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="hidden"
          disabled={isLoading}
        />

        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-wishes-accent/20 flex items-center justify-center">
            <Upload className="w-6 h-6 text-wishes-secondary" />
          </div>
          <div>
            <p className="text-wishes-text font-semibold">Excel 파일 선택</p>
            <p className="text-sm text-wishes-muted mt-1">
              {isDragging
                ? 'Release to upload'
                : 'Click to browse or drag and drop (.xlsx files)'}
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="mt-4">
            <div className="inline-block animate-spin">
              <svg className="w-6 h-6 text-wishes-secondary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <p className="text-sm text-wishes-muted mt-2">처리 중...</p>
          </div>
        )}
      </div>

      {/* 샘플 다운로드 버튼 */}
      <button
        onClick={downloadTemplate}
        disabled={isLoading}
        className="w-full px-4 py-2.5 rounded-lg border border-wishes-border text-wishes-text font-semibold hover:bg-wishes-bg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        <Download className="w-4 h-4" />
        샘플 다운로드
      </button>

      {/* 설명 */}
      <div className="bg-wishes-cream rounded-lg p-4 border border-wishes-border">
        <h3 className="text-sm font-semibold text-wishes-text mb-2">필수 항목</h3>
        <ul className="text-xs text-wishes-muted space-y-1">
          <li>• 제목, 유형, 거래유형, 보증금, 전용면적, 현층, 주소, 동</li>
        </ul>
      </div>
    </div>
  );
}
