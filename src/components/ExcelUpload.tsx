'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface AdminDashboardChartsProps {
  listings: Array<{
    id: number;
    type: string;
    deal: string;
    status: '가용' | '계약중' | '계약완료';
    created_at: string;
    deposit: number;
    monthly?: number | null;
    price?: number | null;
    dong: string;
  }>;
}

// Color palette
const COLORS = {
  primary: '#1b5e20',
  secondary: '#2e7d32',
  accent: '#66bb6a',
  blue: '#42a5f5',
  red: '#ef5350',
  purple: '#ab47bc',
  orange: '#f9a825',
  light: '#a5d6a7',
};

const TYPE_COLORS: Record<string, string> = {
  '원룸': '#42a5f5',
  '투룸': '#66bb6a',
  '오피스텔': '#f9a825',
  '아파트': '#ef5350',
  '상가': '#ab47bc',
  '사무실': '#2e7d32',
};

// Utility to get color for property type
const getTypeColor = (type: string): string => {
  return TYPE_COLORS[type] || '#999999';
};

// Horizontal Bar Chart Component
const HorizontalBarChart = ({
  data,
  title,
  colors,
}: {
  data: Array<{ label: string; value: number }>;
  title: string;
  colors?: string[];
}) => {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barHeight = 32;
  const chartHeight = data.length * barHeight + 20;

  return (
    <div className="card-premium rounded-2xl p-6 bg-wishes-card border border-wishes-border">
      <h3 className="text-lg font-bold text-wishes-primary mb-6">{title}</h3>
      <svg width="100%" height={chartHeight} viewBox={`0 0 300 ${chartHeight}`}>
        {data.map((item, idx) => {
          const barWidth = (item.value / maxValue) * 200;
          const y = idx * barHeight + 10;
          const color = colors?.[idx] || COLORS.secondary;

          return (
            <g key={idx}>
              {/* Background bar */}
              <rect
                x="80"
                y={y}
                width="200"
                height="24"
                fill="#f0f0f0"
                rx="4"
              />
              {/* Filled bar */}
              <rect
                x="80"
                y={y}
                width={barWidth}
                height="24"
                fill={color}
                rx="4"
              />
              {/* Label */}
              <text
                x="8"
                y={y + 16}
                fontSize="12"
                fontWeight="bold"
                fill="#1b3a24"
                fontFamily="GmarketSans, sans-serif"
              >
                {item.label}
              </text>
              {/* Value */}
              <text
                x={85 + barWidth + 8}
                y={y + 16}
                fontSize="12"
                fontWeight="bold"
                fill="#1b3a24"
                fontFamily="GmarketSans, sans-serif"
              >
                {item.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};{parsedData.map((row) => (
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

      {/* 샘플 다운로h}
                fill={slice.item.color}
                stroke="white"
                strokeWidth="2"
              />
              <text
                x={slice.labelX}
                y={slice.labelY}
                fontSize="11"
                fontWeight="bold"
                fill="white"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="GmarketSans, sans-serif"
              >
                {slice.percentage}%
              </text>
            </g>
          ))}
        </svg>
        <div className="w-full space-y-2">
          {data.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-wishes-text font-medium">{item.label}</span>
              </div>
              <span className="font-bold text-wishes-primary">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Simple Bar Chart Component
const BarChart = ({
  data,
  title,
}: {
  data: Array<{ label: string; value: number }>;
  title: string;
}) => {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 40;
  const chartWidth = data.length * (barWidth + 10) + 40;
  const chartHeight = 220;

  return (
    <div className="card-premium rounded-2xl p-6 bg-wishes-card border border-wishes-border">
      <h3 className="text-lg font-bold text-wishes-primary mb-6">{title}</h3>
      <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        {/* Y-axis */}
        <line x1="40" y1="10" x2="40" y2="180" stroke="#ddd" strokeWidth="1" />
        {/* X-axis */}
        <line x1="40" y1="180" x2={chartWidth - 20} y2="180" stroke="#ddd" strokeWidth="1" />

        {/* Grid lines and labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = 180 - ratio * 160;
          const value = Math.round(maxValue * ratio);
          return (
            <g key={idx}>
              <line x1="35" y1={y} x2={chartWidth - 20} y2={y} stroke="#f0f0f0" strokeWidth="1" />
              <text
                x="5"
                y={y + 4}
                fontSize="11"
                fill="#999"
                textAnchor="end"
                fontFamily="GmarketSans, sans-serif"
              >
                {value}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((item, idx) => {
          const barHeight = (item.value / maxValue) * 160;
          const x = 40 + idx * (barWidth + 10) + 5;
          const y = 180 - barHeight;

          return (
            <g key={idx}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={COLORS.secondary}
                rx="4"
              />
              {/* Label */}
              <text
                x={x + barWidth / 2}
                y="200"
                fontSize="11"
                fill="#1b3a24"
                textAnchor="middle"
                fontWeight="bold"
                fontFamily="GmarketSans, sans-serif"
              >
                {item.label}
              </text>
              {/* Value */}
              <text
                x={x + barWidth / 2}
                y={y - 4}
                fontSize="11"
                fill={COLORS.primary}
                textAnchor="middle"
                fontWeight="bold"
                fontFamily="GmarketSans, sans-serif"
              >
                {item.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// Main Component
export const AdminDashboardCharts: React.FC<AdminDashboardChartsProps> = ({ listings }) => {
  const stats = useMemo(() => {
    // Type distribution
    const typeDistribution = listings.reduce(
      (acc, listing) => {
        const type = listing.type || '기타';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Deal type distribution
    const dealDistribution = listings.reduce(
      (acc, listing) => {
        const deal = listing.deal || '기타';
        acc[deal] = (acc[deal] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Dong distribution
    const dongDistribution = listings.reduce(
      (acc, listing) => {
        const dong = listing.dong || '미지정';
        acc[dong] = (acc[dong] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Monthly registration trend (last 6 months)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  드 버튼 */}
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
