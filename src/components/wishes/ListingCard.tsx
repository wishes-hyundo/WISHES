/**
 * Phase 2 (2026-04-28): 옛날 /search 매물 카드 픽셀 재현
 *
 * 출처: _PHASE2_UI_ANALYSIS_2026-04-28.md §A-3 (본문 그리드)
 * - 데스크탑: 110x110 이미지 + 콘텐츠 + 175px 가격/버튼
 * - 모바일 ≤768px: 세로 카드 (이미지 200px height)
 * - hover: #fafff9, selected: #f0fdf4
 * - 가격: #2D5A27 (font-size 17px, weight 800)
 * - 거래 칩: #FFF3E0 / #E65100
 */

'use client';

import { useMemo } from 'react';

export type ListingCardProps = {
  id: number | string;
  /** 이미지 URL (대표 1장) */
  imageUrl?: string | null;
  /** 사진 갯수 (배지) */
  imageCount?: number;
  /** 등록 시간 ISO (상대 표현) */
  registeredAt?: string;
  /** 주소 1줄 */
  address: string;
  /** 건물명 / 매물 제목 */
  title?: string;
  /** 부제 (층/면적/방수) */
  subtitle?: string;
  /** 태그 칩 (옵션 6가지 등) */
  tags?: string[];
  /** 거래 유형 (월세/전세/매매) */
  deal: '월세' | '전세' | '매매' | string;
  /** 가격 표시 (포맷된 문자열, 예: "1억 5,000 / 80만") */
  priceLabel: string;
  /** 상태 (공개/비공개/계약중/계약완료) */
  status?: '공개' | '비공개' | '계약중' | '계약완료' | string;
  /** 즐겨찾기 여부 */
  favorite?: boolean;
  /** 선택 여부 (다중선택) */
  selected?: boolean;
  /** AI 라벨 (한국 AI 기본법 2026) */
  aiGenerated?: boolean;
  /** 문제 매물 표시 (사장님 명령) */
  problematic?: boolean;
  /** 콜백 */
  onClick?: () => void;
  onSelectChange?: (selected: boolean) => void;
  onFavoriteToggle?: () => void;
  onEdit?: () => void;
  onDetail?: () => void;
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  공개:    { bg: '#dcfce7', fg: '#166534' },
  비공개:  { bg: '#f3f4f6', fg: '#4b5563' },
  계약중:  { bg: '#fef3c7', fg: '#b45309' },
  계약완료: { bg: '#dbeafe', fg: '#1e40af' },
};

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '방금';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}일 전`;
  return d.toISOString().slice(0, 10);
}

export function ListingCard(props: ListingCardProps) {
  const {
    id,
    imageUrl,
    imageCount = 0,
    registeredAt,
    address,
    title,
    subtitle,
    tags = [],
    deal,
    priceLabel,
    status,
    favorite = false,
    selected = false,
    aiGenerated = false,
    problematic = false,
    onClick,
    onSelectChange,
    onFavoriteToggle,
    onEdit,
    onDetail,
  } = props;

  const statusStyle = useMemo(() => STATUS_COLORS[status || ''] || null, [status]);
  const ago = useMemo(() => timeAgo(registeredAt), [registeredAt]);

  return (
    <article
      className={[
        'ws-listing-card group flex max-md:flex-col w-full transition-colors cursor-pointer',
        'border-b border-[#eee]',
        selected ? 'bg-[#f0fdf4]' : 'bg-white hover:bg-[#fafff9]',
      ].join(' ')}
      style={{ minHeight: 120 }}
      onClick={onClick}
      data-listing-id={id}
      data-problematic={problematic ? 'true' : undefined}
    >
      {/* 체크박스 */}
      <label
        onClick={(e) => e.stopPropagation()}
        className="flex items-start max-md:absolute max-md:top-2 max-md:left-2 max-md:z-10 max-md:bg-white/80 max-md:rounded p-1.5"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectChange?.(e.target.checked)}
          aria-label="매물 선택"
          className="w-4 h-4 cursor-pointer"
        />
      </label>

      {/* 이미지 */}
      <div
        className="ws-listing-image-wrap relative shrink-0 overflow-hidden bg-[#f5f5f5] max-md:w-full max-md:h-[200px] max-md:rounded-none"
        style={{
          width: 110,
          height: 110,
          margin: '6px 0 6px 6px',
          borderRadius: 4,
          borderRight: '1px solid #f0f0f0',
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title || address}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-[#999]">
            사진 없음
          </div>
        )}

        {/* 사진 갯수 배지 */}
        {imageCount > 0 && (
          <span
            className="absolute top-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
          >
            📷 {imageCount}
          </span>
        )}

        {/* 시간 배지 */}
        {ago && (
          <span
            className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
          >
            {ago}
          </span>
        )}

        {/* AI 라벨 (한국 AI 기본법 2026) */}
        {aiGenerated && (
          <span
            className="absolute bottom-1 right-1 text-[10px] px-1 py-0.5 rounded"
            style={{ background: 'rgba(99,102,241,0.85)', color: '#fff' }}
            title="AI 생성 콘텐츠 (한국 AI 기본법 2026)"
          >
            🤖 AI
          </span>
        )}

        {/* 좋아요 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFavoriteToggle?.();
          }}
          aria-label="즐겨찾기"
          className="absolute top-1 right-1 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[12px]"
          style={{ background: 'rgba(255,255,255,0.85)' }}
        >
          {favorite ? '❤️' : '🤍'}
        </button>

        {/* 문제 매물 배지 (사장님 명령) */}
        {problematic && (
          <span
            className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(239,68,68,0.92)', color: '#fff' }}
            title="사장님 검토 필요 (data integrity)"
          >
            ⚠️ 검토
          </span>
        )}
      </div>

      {/* 콘텐츠 */}
      <div className="ws-listing-content flex-1 flex max-md:flex-col items-stretch gap-3 px-3 py-2.5 max-md:p-3.5">
        {/* 좌측: 주소/제목/부제/태그 */}
        <div className="flex-1 flex flex-col gap-[3px] min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="ws-listing-addr text-[13.5px] font-bold text-[#222] whitespace-nowrap overflow-hidden text-ellipsis">
              {address}
            </span>
            {statusStyle && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                style={{ background: statusStyle.bg, color: statusStyle.fg }}
              >
                {status}
              </span>
            )}
          </div>
          {title && (
            <div className="text-[13.5px] font-bold text-[#222] whitespace-nowrap overflow-hidden text-ellipsis">
              {title}
            </div>
          )}
          {subtitle && (
            <div className="text-[11.5px] text-[#888]">{subtitle}</div>
          )}
          {tags.length > 0 && (
            <div className="ws-listing-tags flex flex-wrap gap-1 mt-0.5">
              {tags.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: '#E8F5E9', color: '#2D5A27' }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 우측: 가격 + 버튼 */}
        <div
          className="ws-card-right flex flex-col items-end justify-between max-md:flex-row max-md:items-center max-md:w-full max-md:border-t max-md:border-[#f0f0f0] max-md:pt-2 max-md:mt-1"
          style={{ width: 175, borderLeft: '1px solid #f0f0f0', paddingLeft: 12 }}
        >
          <div className="flex flex-col items-end max-md:items-start">
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded mb-1"
              style={{ background: '#FFF3E0', color: '#E65100' }}
            >
              {deal}
            </span>
            <span
              className="text-[17px] font-extrabold whitespace-nowrap"
              style={{ color: '#2D5A27' }}
            >
              {priceLabel}
            </span>
          </div>

          <div
            className="flex gap-1.5 max-md:gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {onDetail && (
              <button
                type="button"
                onClick={onDetail}
                className="text-[11px] font-semibold px-2 py-1 rounded border border-[#ddd] bg-white hover:bg-[#f5f5f5]"
              >
                상세
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="text-[11px] font-semibold px-2 py-1 rounded border border-[#ddd] bg-white hover:bg-[#f5f5f5]"
              >
                편집
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default ListingCard;
