'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): BulkActionsBar — 일괄 작업 바
//   옛날 /admin/listings 의 handleBulkStatusChange/Delete/Verify 재현
//   매물 다중선택 후 상태변경/삭제/현장확인/CSV export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { Trash2, Check, Eye, EyeOff, FileSpreadsheet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export type BulkAction = 'set-public' | 'set-private' | 'set-contracting' | 'set-completed' | 'verify' | 'delete' | 'export-csv';

export interface BulkActionsBarProps {
  selectedIds: number[];
  onAction: (action: BulkAction, ids: number[]) => Promise<void> | void;
  onClear: () => void;
  className?: string;
  loading?: boolean;
}

export function BulkActionsBar({ selectedIds, onAction, onClear, className, loading }: BulkActionsBarProps) {
  if (selectedIds.length === 0) return null;

  const handle = async (action: BulkAction) => {
    if (action === 'delete') {
      if (!confirm(`${selectedIds.length}개 매물을 정말 삭제하시겠어요? 되돌릴 수 없습니다.`)) return;
    }
    await onAction(action, selectedIds);
  };

  return (
    <div className={cn(
      'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-premium border border-wishes-border p-3 flex items-center gap-2 flex-wrap max-w-[calc(100vw-2rem)]',
      className
    )}>
      <div className="flex items-center gap-2 px-2">
        <Badge variant="default" className="text-xs">{selectedIds.length}개 선택됨</Badge>
        <Button variant="ghost" size="sm" onClick={onClear} aria-label="선택 해제">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <Button variant="outline" size="sm" onClick={() => handle('set-public')} disabled={loading}>
        <Eye className="h-4 w-4 mr-1" />
        공개
      </Button>
      <Button variant="outline" size="sm" onClick={() => handle('set-private')} disabled={loading}>
        <EyeOff className="h-4 w-4 mr-1" />
        비공개
      </Button>
      <Button variant="outline" size="sm" onClick={() => handle('set-contracting')} disabled={loading}>
        계약중
      </Button>
      <Button variant="outline" size="sm" onClick={() => handle('set-completed')} disabled={loading}>
        계약완료
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button variant="secondary" size="sm" onClick={() => handle('verify')} disabled={loading}>
        <Check className="h-4 w-4 mr-1" />
        현장확인
      </Button>

      <Button variant="outline" size="sm" onClick={() => handle('export-csv')} disabled={loading}>
        <FileSpreadsheet className="h-4 w-4 mr-1" />
        CSV
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button variant="destructive" size="sm" onClick={() => handle('delete')} disabled={loading}>
        <Trash2 className="h-4 w-4 mr-1" />
        삭제
      </Button>
    </div>
  );
}
