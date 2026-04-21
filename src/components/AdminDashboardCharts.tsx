'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface AdminDashboardChartsProps {
  listings: Array<{
    id: number;
    type: string;
    deal: string;
    status: '공개' | '비공개' | '계약중' | '계약완료';
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
};

// Donut Chart Component
const DonutChart = ({
  data,
  title,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  title: string;
}) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const chartSize = 200;
  const radius = 70;
  const innerRadius = 45;

  let currentAngle = -Math.PI / 2; // Start from top
  const slices = data.map((item) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const startX = Math.cos(startAngle) * radius;
    const startY = Math.sin(startAngle) * radius;
    const endX = Math.cos(endAngle) * radius;
    const endY = Math.sin(endAngle) * radius;

    const innerStartX = Math.cos(startAngle) * innerRadius;
    const innerStartY = Math.sin(startAngle) * innerRadius;
    const innerEndX = Math.cos(endAngle) * innerRadius;
    const innerEndY = Math.sin(endAngle) * innerRadius;

    const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

    const path = `
      M ${startX} ${startY}
      A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
      L ${innerEndX} ${innerEndY}
      A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}
      Z
    `;

    const labelAngle = startAngle + sliceAngle / 2;
    const labelRadius = (radius + innerRadius) / 2;
    const labelX = Math.cos(labelAngle) * labelRadius;
    const labelY = Math.sin(labelAngle) * labelRadius;
    const percentage = ((item.value / total) * 100).toFixed(1);

    return { path, item, labelX, labelY, percentage };
  });

  return (
    <div className="card-premium rounded-2xl p-6 bg-wishes-card border border-wishes-border">
      <h3 className="text-lg font-bold text-wishes-primary mb-6">{title}</h3>
      <div className="flex flex-col items-center gap-6">
        <svg
          width="240"
          height="240"
          viewBox="-120 -120 240 240"
          className="drop-shadow-lg"
        >
          {slices.map((slice, idx) => (
            <g key={idx}>
              <path
                d={slice.path}
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

    const monthlyData: Record<string, number> = {};
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = 0;
    }

    listings.forEach((listing) => {
      const date = new Date(listing.created_at);
      if (date >= sixMonthsAgo) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (key in monthlyData) {
          monthlyData[key]++;
        }
      }
    });

    return {
      typeDistribution,
      dealDistribution,
      dongDistribution,
      monthlyData,
    };
  }, [listings]);

  // Prepare chart data
  const typeChartData = Object.entries(stats.typeDistribution)
    .map(([type, count]) => ({
      label: type,
      value: count,
    }))
    .sort((a, b) => b.value - a.value);

  const typeChartColors = typeChartData.map(({ label }) => getTypeColor(label));

  const dealChartData = [
    { label: '전세', value: stats.dealDistribution['전세'] || 0, color: COLORS.secondary },
    { label: '월세', value: stats.dealDistribution['월세'] || 0, color: '#4caf50' },
    { label: '매매', value: stats.dealDistribution['매매'] || 0, color: COLORS.orange },
  ].filter((d) => d.value > 0);

  const dongChartData = Object.entries(stats.dongDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([dong, count]) => ({
      label: dong,
      value: count,
    }));

  const monthlyChartData = Object.entries(stats.monthlyData)
    .map(([month, count]) => {
      const [year, monthStr] = month.split('-');
      return {
        label: `${monthStr}월`,
        value: count,
      };
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-wishes-primary">관리자 대시보드</h2>
        <p className="text-wishes-muted">
          총 {listings.length}개의 매물 • 실시간 통계
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            label: '전체 매물',
            value: listings.length,
            color: COLORS.primary,
          },
          {
            label: '공개 매물',
            value: listings.filter((l) => l.status === '공개').length,
            color: COLORS.accent,
          },
          {
            label: '계약중',
            value: listings.filter((l) => l.status === '계약중').length,
            color: COLORS.blue,
          },
          {
            label: '계약완료',
            value: listings.filter((l) => l.status === '계약완료').length,
            color: COLORS.red,
          },
        ].map((stat, idx) => (
          <div
            key={idx}
            className="card-premium rounded-xl p-4 bg-wishes-card border border-wishes-border"
            style={{
              borderLeftWidth: '4px',
              borderLeftColor: stat.color,
            }}
          >
            <p className="text-sm text-wishes-muted font-medium mb-2">{stat.label}</p>
            <p className="text-3xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Property Type Distribution */}
        <HorizontalBarChart
          title="매물 유형별 분포"
          data={typeChartData}
          colors={typeChartColors}
        />

        {/* Deal Type Distribution */}
        {dealChartData.length > 0 && (
          <DonutChart title="거래 유형별 분포" data={dealChartData} />
        )}

        {/* Listings by Dong */}
        {dongChartData.length > 0 && (
          <HorizontalBarChart
            title="동별 매물 수"
            data={dongChartData}
            colors={Array(dongChartData.length).fill(COLORS.accent)}
          />
        )}

        {/* Monthly Registration Trend */}
        {monthlyChartData.length > 0 && (
          <BarChart title="월별 등록 추이" data={monthlyChartData} />
        )}
      </div>

      {/* Footer Note */}
      <div className="mt-6 p-4 bg-wishes-cream rounded-lg border border-wishes-border">
        <p className="text-xs text-wishes-muted">
          ℹ️ 모든 통계는 실시간으로 업데이트되며, 최근 6개월 데이터를 기준으로 표시됩니다.
        </p>
      </div>
    </div>
  );
};

export default AdminDashboardCharts;
