'use client';
// BoB Phase 1 — TanStack Table v8 + TanStack Virtual + shadcn UI
// 12,000+ 매물 가상 스크롤 + 정렬/필터/검색

import { useMemo, useState, useRef } from 'react';
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, ChevronDown, ExternalLink, Search } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export interface Listing {
  id: number;
  type?: string;
  deal?: string;
  status?: string;
  dong?: string;
  gu?: string;
  address?: string;
  building_name?: string;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  area_m2?: number | null;
  floor_current?: string;
  floor_total?: string;
  rooms?: number | null;
  bathrooms?: number | null;
  built_year?: string;
  updated_at?: string;
}

function formatPrice(l: Listing): string {
  const fmt = (n: number) => {
    if (n >= 10000) {
      const u = Math.floor(n / 10000);
      const r = n % 10000;
      return r > 0 ? `${u}억 ${r.toLocaleString('ko-KR')}` : `${u}억`;
    }
    return n.toLocaleString('ko-KR');
  };
  if (l.deal === '월세' && l.deposit != null && l.monthly != null) {
    return `${fmt(l.deposit)}/${fmt(l.monthly)}만원`;
  }
  if (l.deal === '전세' && l.deposit != null) return `${fmt(l.deposit)}만원`;
  if (l.deal === '매매' && l.price != null) return `${fmt(l.price)}만원`;
  return '-';
}

function statusBadgeVariant(status?: string): 'success' | 'secondary' | 'warning' | 'outline' {
  if (status === '공개') return 'success';
  if (status === '계약중') return 'warning';
  if (status === '계약완료') return 'secondary';
  return 'outline';
}

export function ListingTable({ data }: { data: Listing[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updated_at', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<Listing>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="text-xs text-muted-foreground">#{row.original.id}</span>,
        size: 60,
      },
      {
        accessorKey: 'type',
        header: '종류',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.original.type || '-'}
          </Badge>
        ),
        size: 80,
      },
      {
        accessorKey: 'deal',
        header: '거래',
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.deal || '-'}</span>,
        size: 60,
      },
      {
        id: 'price',
        header: '가격',
        accessorFn: (l) => formatPrice(l),
        cell: ({ row }) => <span className="text-sm font-semibold">{formatPrice(row.original)}</span>,
        size: 140,
      },
      {
        accessorKey: 'dong',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 -ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            동
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => <span className="text-sm">{row.original.dong || '-'}</span>,
        size: 100,
      },
      {
        accessorKey: 'building_name',
        header: '건물명',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground truncate block max-w-[180px]">
            {row.original.building_name || '-'}
          </span>
        ),
        size: 180,
      },
      {
        id: 'spec',
        header: '면적/층/방',
        accessorFn: (l) =>
          `${l.area_m2 || '-'}㎡ / ${l.floor_current || '-'}층 / ${l.rooms || '-'}룸`,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <span className="text-xs text-muted-foreground">
              {l.area_m2 ? `${l.area_m2}㎡` : '-'} ·{' '}
              {l.floor_current ? `${l.floor_current}/${l.floor_total || '?'}층` : '-'} ·{' '}
              {l.rooms ? `${l.rooms}룸` : '-'}
            </span>
          );
        },
        size: 180,
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ row }) => (
          <Badge variant={statusBadgeVariant(row.original.status)}>{row.original.status || '-'}</Badge>
        ),
        size: 80,
      },
      {
        accessorKey: 'updated_at',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 -ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            수정일
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const d = row.original.updated_at;
          if (!d) return <span className="text-xs text-muted-foreground">-</span>;
          const date = new Date(d);
          const now = new Date();
          const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
          const label = diffDays === 0 ? '오늘' : diffDays < 7 ? `${diffDays}일 전` : date.toLocaleDateString('ko-KR');
          return <span className="text-xs text-muted-foreground">{label}</span>;
        },
        size: 100,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/listings/${row.original.id}`}
            target="_blank"
            className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs"
          >
            보기 <ExternalLink className="w-3 h-3" />
          </Link>
        ),
        size: 70,
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _, filterValue) => {
      const v = String(filterValue).toLowerCase();
      const l = row.original;
      return [l.dong, l.building_name, l.address, l.type, l.deal, String(l.id)]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(v));
    },
  });

  // Virtual scroll
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div className="space-y-3">
      {/* 검색 + 통계 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="동, 건물명, 주소, ID 검색..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="secondary" className="text-sm">
          {rows.length.toLocaleString('ko-KR')}개 매물
        </Badge>
        {globalFilter && (
          <Button variant="ghost" size="sm" onClick={() => setGlobalFilter('')}>
            검색 초기화
          </Button>
        )}
      </div>

      {/* 가상 스크롤 테이블 */}
      <div
        ref={tableContainerRef}
        className="rounded-lg border bg-card overflow-auto"
        style={{ height: '70vh' }}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card border-b">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {paddingTop > 0 && (
              <TableRow>
                <TableCell style={{ height: paddingTop }} colSpan={columns.length} />
              </TableRow>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <TableRow
                  key={row.id}
                  className={cn('hover:bg-muted/40 cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {paddingBottom > 0 && (
              <TableRow>
                <TableCell style={{ height: paddingBottom }} colSpan={columns.length} />
              </TableRow>
            )}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  매물이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
