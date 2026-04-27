'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): AlertLog — 🔔 알림 로그 시스템
//   옛날 content-v293-alert-log.js 재현
//   localStorage 200건 히스토리 + 드로어 타임라인
//   글로벌 window.WS.alertLog API (옛날 코드와 호환)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { Bell, Trash2, X } from 'lucide-react';
import { Dialog, SheetContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const STORAGE_KEY = 'ws_alert_log';
const MAX_LOGS = 200;

export interface AlertLogEntry {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  detail?: string;
  timestamp: number;
}

function loadLogs(): AlertLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AlertLogEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLogs(logs: AlertLogEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
  } catch {}
}

// 글로벌 API — 옛날 window.WS.alertLog 호환
export const alertLog = {
  push(type: AlertLogEntry['type'], message: string, detail?: string): void {
    const entry: AlertLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message,
      detail,
      timestamp: Date.now(),
    };
    const logs = [entry, ...loadLogs()];
    saveLogs(logs);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ws-alert-log', { detail: entry }));
    }
  },
  list(): AlertLogEntry[] {
    return loadLogs();
  },
  clear(): void {
    saveLogs([]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ws-alert-log-clear'));
    }
  },
  remove(id: string): void {
    saveLogs(loadLogs().filter((x) => x.id !== id));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ws-alert-log'));
    }
  },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (day > 0) return `${day}일 전`;
  if (hr > 0) return `${hr}시간 전`;
  if (min > 0) return `${min}분 전`;
  return '방금';
}

function variantOf(type: AlertLogEntry['type']): 'default' | 'success' | 'warning' | 'destructive' {
  switch (type) {
    case 'success': return 'success';
    case 'warning': return 'warning';
    case 'error': return 'destructive';
    default: return 'default';
  }
}

export function AlertLogButton({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [logs, setLogs] = React.useState<AlertLogEntry[]>([]);
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    setLogs(loadLogs());
    const onUpdate = () => { setLogs(loadLogs()); force(); };
    window.addEventListener('ws-alert-log', onUpdate);
    window.addEventListener('ws-alert-log-clear', onUpdate);
    return () => {
      window.removeEventListener('ws-alert-log', onUpdate);
      window.removeEventListener('ws-alert-log-clear', onUpdate);
    };
  }, []);

  const unread = logs.length;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={className}
        aria-label={`알림 ${unread}건`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center h-4 min-w-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="max-w-md">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Bell className="h-5 w-5 text-wishes-primary" />
            알림 로그
            <Badge variant="secondary" className="text-xs">{logs.length}건</Badge>
            {logs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { alertLog.clear(); setLogs([]); }}
                className="ml-auto text-xs text-red-600"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                전체 삭제
              </Button>
            )}
          </DialogTitle>

          <Separator />

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {logs.length === 0 && (
              <div className="text-center py-12 text-sm text-wishes-muted">
                알림이 없습니다.
              </div>
            )}
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-wishes-border bg-white p-3 hover:shadow-soft transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Badge variant={variantOf(entry.type)} className="text-[10px] shrink-0">
                      {entry.type === 'success' ? '성공' : entry.type === 'error' ? '에러' : entry.type === 'warning' ? '경고' : '정보'}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-wishes-text break-words">{entry.message}</p>
                      {entry.detail && (
                        <p className="text-xs text-wishes-muted mt-0.5 break-words">{entry.detail}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { alertLog.remove(entry.id); setLogs(loadLogs()); }}
                    className="text-wishes-muted hover:text-red-600 shrink-0"
                    aria-label="삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-[10px] text-wishes-muted mt-1.5">{timeAgo(entry.timestamp)}</div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Dialog>
    </>
  );
}
