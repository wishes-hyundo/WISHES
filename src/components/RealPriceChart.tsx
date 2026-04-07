'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, AlertCircle } from 'lucide-react';

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

function formatWon(value: number): string {
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const man = value % 10000;
    if (man === 0) return `${eok}Ã¬âÂµ`;
    return `${eok}.${Math.round(man / 1000)}Ã¬âÂµ`;
  }
  return `${value.toLocaleString()}Ã«Â§Å`;
}

function formatPeriod(period: string): string {
  // "202505 ~ 202604" Ã¢â â "25.05 ~ 26.04"
  if (!period) return 'Ã¬ÂµÅÃªÂ·Â¼ 12ÃªÂ°ÅÃ¬âºâ';
  return period.replace(/(\d{4})(\d{2})/g, (_, y, m) => `${y.slice(2)}.${m}`);
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
          setError(json.error || 'Ã«ÂÂ°Ã¬ÂÂ´Ã­âÂ°Ã«Â¥Â¼ Ã«Â¶ËÃ«Å¸Â¬Ã¬ËÂ¬ Ã¬ËË Ã¬ââ Ã¬Å ÂµÃ«â¹ËÃ«â¹Â¤');
        }
      } catch {
        setError('Ã«âÂ¤Ã­Å Â¸Ã¬âºÅÃ­ÂÂ¬ Ã¬ËÂ¤Ã«Â¥ËÃªÂ°â¬ Ã«Â°ÅÃ¬ÆÂÃ­âËÃ¬Å ÂµÃ«â¹ËÃ«â¹Â¤');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [listingId]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
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
    const pad = { top: 20, right: 16, bottom: 44, left: 58 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const prices = data.map(d => d.avgPrice);
    const counts = data.map(d => d.count);
    const maxPrice = Math.max(...prices) * 1.15;
    const minPrice = Math.min(...prices) * 0.85;
    const maxCount = Math.max(...counts) * 1.3;

    const barWidth = Math.min(chartW / data.length * 0.5, 28);
    const stepX = chartW / data.length;

    // Determine if last month is partial (current month)
    const now = new Date();
    const currentYM = `${String(now.getFullYear()).slice(2)}.${now.getMonth() + 1}`;
    const lastItem = data[data.length - 1];
    const isLastPartial = lastItem.month === currentYM;

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

      const val = maxPrice - ((maxPrice - minPrice) * i) / gridLines;
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = val >= 10000
        ? `${(val / 10000).toFixed(1)}Ã¬âÂµ`
        : `${Math.round(val).toLocaleString()}Ã«Â§Å`;
      ctx.fillText(label, pad.left - 6, y);
    }
    ctx.setLineDash([]);

    // Bar chart (ÃªÂ±Â°Ã«Å¾ËÃªÂ±Â´Ã¬ËË)
    data.forEach((d, i) => {
      const x = pad.left + stepX * i + stepX / 2 - barWidth / 2;
      const barH = maxCount > 0 ? (d.count / maxCount) * chartH : 0;
      const y = pad.top + chartH - barH;

      // Partial month: dashed pattern for current month
      const isPartial = i === data.length - 1 && isLastPartial;
      ctx.fillStyle = isPartial ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.15)';

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

      // Partial month: dashed border
      if (isPartial) {
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Line chart (Ã­Ââ°ÃªÂ·Â ÃªÂ°â¬)
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
      const isPartial = i === data.length - 1 && isLastPartial;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = isPartial ? '#86efac' : '#16a34a';
      ctx.lineWidth = 2;
      if (isPartial) {
        ctx.setLineDash([2, 2]);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // X-axis labels (months)
    data.forEach((d, i) => {
      const x = pad.left + stepX * i + stepX / 2;
      const isPartial = i === data.length - 1 && isLastPartial;
      ctx.fillStyle = isPartial ? '#d1d5db' : '#9ca3af';
      ctx.font = `${isPartial ? 'italic ' : ''}10px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
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
  }, [data]);

  // Draw chart when data changes
  useEffect(() => {
    if (data.length > 0) drawChart();
  }, [data, drawChart]);

  // Resize handler
  useEffect(() => {
    if (data.length === 0) return;
    const handleResize = () => { drawChart(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data, drawChart]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-green-500/70" />
          {dong} Ã¬â¹Â¤ÃªÂ±Â°Ã«Å¾ËÃªÂ°â¬ Ã«Ââ¢Ã­âÂ¥
        </h3>
        <div className="bg-green-50/50 rounded-xl p-6 flex items-center justify-center h-[240px]">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-400">Ã¬â¹Â¤ÃªÂ±Â°Ã«Å¾ËÃªÂ°â¬ Ã«ÂÂ°Ã¬ÂÂ´Ã­âÂ° Ã«Â¡ÅÃ«âÂ©Ã¬Â¤â...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-green-500/70" />
          {dong} Ã¬â¹Â¤ÃªÂ±Â°Ã«Å¾ËÃªÂ°â¬ Ã«Ââ¢Ã­âÂ¥
        </h3>
        <div className="bg-green-50/50 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Ã¬â¹Â¤ÃªÂ±Â°Ã«Å¾ËÃªÂ°â¬ Ã¬Â â¢Ã«Â³Â´</p>
              <p className="text-xs text-gray-400">Ã­â¢Â´Ã«â¹Â¹ Ã¬Â§â¬Ã¬âÂ­Ã¬ÂË Ã¬â¹Â¤ÃªÂ±Â°Ã«Å¾Ë Ã«ÂÂ°Ã¬ÂÂ´Ã­âÂ°ÃªÂ°â¬ Ã¬ââ Ã¬Å ÂµÃ«â¹ËÃ«â¹Â¤</p>
            </div>
          </div>
          <a
            href="https://rt.molit.go.kr/pt/xls/xls.do#tabNm=6"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-100 hover:bg-green-200 px-3 py-2 rounded-lg transition-colors font-medium"
          >
            <TrendingUp className="w-3 h-3" />
            ÃªÂµÂ­Ã­â Â ÃªÂµÂÃ­â ÂµÃ«Â¶â¬ Ã¬â¹Â¤ÃªÂ±Â°Ã«Å¾ËÃªÂ°â¬ Ã¬Â¡Â°Ã­Å¡ÅÃ­â¢ËÃªÂ¸Â°
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
  const priceUnit = isRent ? 'Ã«Â³Â´Ã¬Â¦ÂÃªÂ¸Ë' : 'Ã«Â§Â¤Ã«Â§Â¤ÃªÂ°â¬';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-green-500" />
            {dong} {meta?.label || `${type} ${deal}`} Ã¬â¹Â¤ÃªÂ±Â°Ã«Å¾ËÃªÂ°â¬ Ã«Ââ¢Ã­âÂ¥
          </h3>
          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-green-600 rounded-full inline-block" /> Ã­Ââ°ÃªÂ·Â ÃªÂ°â¬
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-500/15 rounded-sm inline-block" /> ÃªÂ±Â°Ã«Å¾ËÃ«Å¸â°
            </span>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[11px] text-gray-400 mb-0.5">Ã¬ÂµÅÃªÂ·Â¼ Ã­Ââ°ÃªÂ·Â° {priceUnit}</p>
            <p className="text-lg font-bold text-gray-800">
              {formatWon(latestPrice)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[11px] text-gray-400">Ã¬Â âÃ¬âºâÃ«Åâ¬Ã«Â¹â</p>
              <p className={`text-sm font-bold ${isUp ? 'text-red-500' : latestPrice < prevPrice ? 'text-blue-500' : 'text-gray-500'}`}>
                {isUp ? 'Ã¢âÂ²' : latestPrice < prevPrice ? 'Ã¢âÂ¼' : 'Ã¢ââ¬'} {Math.abs(Number(changePercent))}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400">ÃâÂ ÃªÂ±Â°Ã«Å¾Ë</p>
              <p className="text-sm font-bold text-gray-700">{totalCount.toLocaleString()}ÃªÂ±Â´</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-2">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: '200px' }}
        />
      </div>

      {/* Footer */}
      <div className="px-4 sm:px-6 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">
          {formatPeriod(meta?.period || '')} ÃªÂ¸Â°Ã¬Â¤â¬ ÃÂ· ÃªÂµÂ­Ã­â Â ÃªÂµÂÃ­â ÂµÃ«Â¶â¬ Ã¬â¹Â¤ÃªÂ±Â°Ã«Å¾ËÃªÂ°â¬ ÃªÂ³ÂµÃªÂ°ÅÃ¬â¹ÅÃ¬Å Â¤Ã­â¦Å
        </p>
        <a
          href="https://rt.molit.go.kr/pt/xls/xls.do#tabNm=6"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-green-600 hover:text-green-700 font-medium"
        >
          Ã¬ÆÂÃ¬âÂ¸ Ã¬Â¡Â°Ã­Å¡Å Ã¢â â
        </a>
      </div>
    </div>
  );
}
