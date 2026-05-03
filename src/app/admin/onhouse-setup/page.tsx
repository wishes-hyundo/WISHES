'use client';

// /admin/onhouse-setup — 사장님이 onhouse 자격증명 등록하는 페이지
// 사장님 명령 (2026-04-29): "아이디랑 암호 적는 창 띄워놔줘"

import { useEffect, useState } from 'react';

// G-30 fix (2026-05-03): adminFetch + useAdminSession 으로 인증 토큰 자동 첨부.
// 직전 결함: fetch('/api/admin/onhouse-creds', ...) → HTTP 401.
import { useAdminSession } from '@/lib/useAdminSession';
import { adminFetch } from '@/lib/adminFetch';

interface CredsStatus {
  ok: boolean;
  db: { hasUsername: boolean; hasPassword: boolean; masked: string };
  env: { hasUsername: boolean; hasPassword: boolean; masked: string };
  activeSource: 'db' | 'env' | 'none';
}

export default function OnhouseSetupPage() {
  const [status, setStatus] = useState<CredsStatus | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);

  const { token } = useAdminSession('/admin/onhouse-setup');
  const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

  async function fetchStatus() {
    try {
      const r = await adminFetch('/api/admin/onhouse-creds', {
        cache: 'no-store',
        headers: authHeaders(),
        credentials: 'include',
      });
      const j = await r.json();
      if (j.ok) setStatus(j);
    } catch {}
  }

  useEffect(() => { if (token) fetchStatus(); }, [token]);

  async function save() {
    if (!username.trim() || !password.trim()) {
      setMsg({ type: 'err', text: '아이디/비밀번호 모두 입력해주세요' });
      return;
    }
    setBusy(true);
    setMsg({ type: 'info', text: 'onhouse 로그인 테스트 + 저장 중...' });
    try {
      const r = await adminFetch('/api/admin/onhouse-creds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password: password.trim(), test: true }),
      });
      const j = await r.json();
      if (j.ok) {
        setMsg({ type: 'ok', text: '✅ 저장 완료 — 로그인 테스트 통과 (' + (j.test?.hint || '') + ')' });
        setPassword('');
        await fetchStatus();
      } else {
        setMsg({ type: 'err', text: '❌ ' + (j.error || '실패') });
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: '❌ 네트워크 오류: ' + (e?.message || '') });
    } finally {
      setBusy(false);
    }
  }

  async function runEnrichOnce() {
    setBusy(true);
    setMsg({ type: 'info', text: '단일 매물(맥스텔 62381) sample 로 호수 추출 테스트 중... 약 10초' });
    try {
      const r = await adminFetch('/api/admin/enrich-onhouse-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({ sampleId: 62381, debug: true }),
      });
      const j = await r.json();
      if (j.ok) {
        const first = (j.results || [])[0];
        setMsg({
          type: first?.status === 'ok' ? 'ok' : 'info',
          text: '결과: ' + JSON.stringify(first || {}, null, 2),
        });
      } else {
        setMsg({ type: 'err', text: '❌ ' + (j.error || '') });
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: '❌ ' + (e?.message || '') });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm('저장된 onhouse 자격증명을 삭제하시겠습니까?')) return;
    setBusy(true);
    try {
      const r = await adminFetch('/api/admin/onhouse-creds', { method: 'DELETE', headers: authHeaders(), credentials: 'include' });
      const j = await r.json();
      if (j.ok) {
        setMsg({ type: 'ok', text: '🗑 삭제 완료' });
        await fetchStatus();
      } else {
        setMsg({ type: 'err', text: '❌ ' + (j.error || '') });
      }
    } finally { setBusy(false); }
  }

  const isActive = status?.activeSource === 'db' || status?.activeSource === 'env';

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 py-8 px-4">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            🔐 onhouse 자격증명 등록
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            매일 03:00 KST 에 onhouse 매물 페이지에 자동 로그인하여 호수·동·사진 정보를 수집합니다.
            <br />
            ID/PW 는 Supabase 의 RLS 보호된 <code className="rounded bg-neutral-200 px-1 text-xs dark:bg-neutral-800">app_secrets</code> 테이블에 저장 (service-role 만 read).
          </p>
        </div>

        {/* 현재 상태 */}
        <div className={'mb-6 rounded-xl border p-4 ' + (
          isActive
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
            : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
        )}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{isActive ? '✅' : '⚠️'}</span>
            <span className="font-semibold">
              {isActive ? '활성 (' + (status?.activeSource === 'env' ? 'Vercel env' : 'DB') + ')' : '미등록'}
            </span>
          </div>
          {status && (
            <ul className="mt-2 space-y-1 text-xs text-neutral-700 dark:text-neutral-300">
              <li>• DB: {status.db.hasUsername && status.db.hasPassword ? '✅ ' + status.db.masked : '❌ 미등록'}</li>
              <li>• Vercel env: {status.env.hasUsername && status.env.hasPassword ? '✅ ' + status.env.masked : '❌ 미등록'}</li>
            </ul>
          )}
        </div>

        {/* 입력 form */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-neutral-900 dark:text-neutral-100">
              onhouse 아이디
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              placeholder="onhouse 로그인 ID"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div className="mb-5">
            <label className="mb-1 block text-sm font-medium text-neutral-900 dark:text-neutral-100">
              비밀번호
            </label>
            <div className="flex gap-2">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                placeholder="비밀번호 (4~16자)"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                disabled={busy}
              >
                {showPwd ? '숨김' : '보기'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={busy || !username || !password}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? '처리중...' : '저장 + 로그인 테스트'}
            </button>
            <button
              onClick={runEnrichOnce}
              disabled={busy || !isActive}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
              title="62381 맥스텔 1건으로 호수 추출 테스트"
            >
              호수 추출 테스트
            </button>
            <button
              onClick={clear}
              disabled={busy || !status?.db.hasUsername}
              className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400"
            >
              삭제
            </button>
          </div>

          {msg && (
            <pre className={
              'mt-4 rounded-lg p-3 text-xs whitespace-pre-wrap break-all ' + (
                msg.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                  : msg.type === 'err'
                  ? 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
              )
            }>{msg.text}</pre>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
          <p className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">동작</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>저장 클릭 → server 가 onhouse 로그인 시도 → 매물 페이지 접근 검증 → 통과 시 DB 저장</li>
            <li>매일 03:00 KST cron 자동 실행 → 호수 누락 매물 20건씩 enrich</li>
            <li>30분마다 도로명주소 백필 (별개 cron)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
