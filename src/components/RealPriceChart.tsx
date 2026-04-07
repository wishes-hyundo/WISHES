'use client';

import { useState, useEffect, useRef } from 'react';
import { TrendingUp, BarChart3, AlertCircle } from 'lucide-react';

interface ChartDataItem {
  month: string;
  avgPrice: number;
  count: number;
}

interface ChartMeta {
  propertyType: string;
  normalizedType: string;
  dealType: string;
  label: string;
  isRent: boolean;
  period: string;
}

interface Props {
  listingId: number;
  dong: string;
  type: string;
  deal: string;
}

function formatWon(value: number, isRent: boolean): string {
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const man = value % 10000;
    if (man === 0) return `${eok}억`;
    return `${eok}억 ${man.toLocaleString()}만`;
  }
  return `${value.toLocaleString()}만원`;
}

export default function RealPriceChart({ listingId, dong, type, deal }: Props) {
  const [data, setData] = useState<ChartDataItem[]>([]);
  const [meta, setMeta] = useState<ChartMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/listings/${listingId}/real-prices`);
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          setData(json.data);
          setMeta(json.meta);
        } else {
          setError(json.error || '데이터를 불러올 수 없습니다');
        }
      } catch (e) {
        setError('네트워크 오류가 발생했습니다');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [listingId]);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    drawChart();
  }, [data]);

  function drawChart() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = displayWidth;
    const H = displayHeight;
    const pad = { top: 30, right: 16, bottom: 44, left: 58 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, W, H);

    const prices = data.map(d => d.avgPrice);
    const counts = data.map(d => d.count);
    const maxPrice = Math.max(...prices) * 1.15;
    const minPrice = Math.min(...prices) * 0.85;
    const maxCount = Math.max(...counts) * 1.3;

    const barWidth = Math.min(chartW / data.length * 0.5, 28);
    const stepX = chartW / data.length;

    // Grid lines (price axis)
    const gridLines = 4;
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (chartH * i) / gridLines;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      // Price labels
      const val = maxPrice - ((maxPrice - minPrice) * i) / gridLines;
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = val >= 10000
        ? `${(val / 10000).toFixed(1)}억`
        : `${Math.round(val).toLocaleString()}만`;
      ctx.fillText(label, pad.left - 6, y);
    }
    ctx.setLineDash([]);

    // Bar chart (거래건수)
    data.forEach((d, i) => {
      const x = pad.left + stepX * i + stepX / 2 - barWidth / 2;
      const barH = maxCount > 0 ? (d.count / maxCount) * chartH : 0;
      const y = pad.top + chartH - barH;

      ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
      ctx.beginPath();
      const r = 3;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barWidth - r, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
      ctx.lineTo(x + barWidth, pad.top + chartH);
      ctx.lineTo(x, pad.top + chartH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();

      // Count label on bar
      if (d.count > 0) {
        ctx.fillStyle = '#86efac';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${d.count}건`, x + barWidth / 2, y - 2);
      }
    });

    // Line chart (평균가)
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const points: { x: number; y: number }[] = [];
    data.forEach((d, i) => {
      const x = pad.left + stepX * i + stepX / 2;
      const y = pad.top + chartH - ((d.avgPrice - minPrice) / (maxPrice - minPrice)) * chartH;
      points.push({ x, y });
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill under line
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    grad.addColorStop(0, 'rgba(22, 163, 74, 0.12)');
    grad.addColorStop(1, 'rgba(22, 163, 74, 0.01)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
    ctx.lineTo(points[0].x, pad.top + chartH);
    ctx.closePath();
    ctx.fill();

    // Data points
    points.forEach((p, i) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Price label on last few points
      if (i >= data.length - 3 || i === 0) {
        ctx.fillStyle = '#374151';
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const priceLabel = data[i].avgPrice >= 10000
          ? `${(data[i].avgPrice / 10000).toFixed(1)}억`
          : `${data[i].avgPrice.toLocaleString()}만`;
        ctx.fillText(priceLabel, p.x, p.y - 8);
      }
    });

    // X-axis labels (months)
    data.forEach((d, i) => {
      const x = pad.left + stepX * i + stepX / 2;
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      // Show every month or every other if too many
      if (data.length <= 12 || i % 2 === 0) {
        ctx.fillText(d.month, x, pad.top + chartH + 8);
      }
    });

    // X-axis line
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + chartH);
    ctx.lineTo(W - pad.right, pad.top + chartH);
    ctx.stroke();
  }

  // Loading state
  if (loading) {
    return (
      <div className="mt-6 pt-6 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-green-500/70" />
          {dong} 실거래가 동향
        </h3>
        <div className="bg-green-50/50 rounded-xl p-6 flex items-center justify-center h-[280px]">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-400">실거래가 데이터 로딩중...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || data.length === 0) {
    return (
      <div className="mt-6 pt-6 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-green-500/70" />
          {dong} 실거래가 동향
        </h3>
        <div className="bg-green-50/50 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">실거래가 정보</p>
              <p className="text-xs text-gray-400">해당 지역의 실거래 데이터가 없습니다</p>
            </div>
          </div>
          <a
            href="https://rt.molit.go.kr/pt/xls/xls.do#tabNm=6"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-100 hover:bg-green-200 px-3 py-2 rounded-lg transition-colors font-medium"
          >
            <TrendingUp className="w-3 h-3" />
            국토교통부 실거래가 조회하기
          </a>
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const latestPrice = data[data.length - 1].avgPrice;
  const prevPrice = data.length >= 2 ? data[data.length - 2].avgPrice : latestPrice;
  const changePercent = prevPrice > 0 ? ((latestPrice - prevPrice) / prevPrice * 100).toFixed(1) : '0';
  const isUp = latestPrice > prevPrice;
  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  const isRent = meta?.isRent ?? false;
  const priceUnit = isRent ? '보증금' : '매매가';

  return (
    <div className="mt-6 pt-6 border-t border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        <TrendingUp className="w-4 h-4 text-green-500/70" />
        {dong} {meta?.label || `${type} ${deal}`} 실거래가 동향
      </h3>

      <div className="bg-green-50/30 rounded-xl border border-green-100/50 overflow-hidden">
        {/* Summary stats */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">최근 평균 {priceUnit}</p>
            <p className="text-lg font-bold text-gray-800">
              {formatWon(latestPrice, isRent)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-400">전월대비</p>
              <p className={`text-sm font-bold ${isUp ? 'text-red-500' : latestPrice < prevPrice ? 'text-blue-500' : 'text-gray-500'}`}>
                {isUp ? '▲' : latestPrice < prevPrice ? '▼' : '─'} {Math.abs(Number(changePercent))}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">총 거래</p>
              <p className="text-sm font-bold text-gray-700">{totalCount.toLocaleString()}건</p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="px-2 pb-2">
          <canvas
            ref={canvasRef}
            className="w-full"
            style={{ height: '220px' }}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-green-50/80 border-t border-green-100/50 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            국토교통부 실거래가 공개시스템 · {meta?.period?.replace(' ', '') || '최근 12개월'}
          </p>
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-green-500 rounded-full inline-block" /> 평균 {priceUnit}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-green-500/15 rounded-sm inline-block" /> 거래건수
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
