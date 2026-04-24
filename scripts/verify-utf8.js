#!/usr/bin/env node
/**
 * verify-utf8.js (2026-04-22)
 * ─────────────────────────────────────────────
 * src/**, public/** 하위 텍스트 파일이 모두 valid UTF-8 인지 검사.
 *
 * 배경: 2026-04-22 build f (512fb85) 가 src/app/api/admin/dedup/cleanup/route.ts
 *   UTF-8 중간 절단으로 Vercel build 실패. 같은 유형 사고 3번째 (75428e1 →
 *   4c9786a → build f). Linux bindfs ↔ Windows 파일 왕복 과정에서 발생하는
 *   구조적 문제. pre-commit + prebuild 2중 방어로 재발 차단.
 *
 * 사용:
 *   node scripts/verify-utf8.js          # 전체 스캔, exit 1 if invalid
 *   node scripts/verify-utf8.js --staged # staged 파일만 (pre-commit hook)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.mjs', '.cjs', '.css', '.html', '.yaml', '.yml']);
const SCAN_ROOTS = ['src', 'public', 'scripts'];

function walkDir(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
      walkDir(fp, out);
    } else if (e.isFile() && EXTS.has(path.extname(e.name))) {
      out.push(fp);
    }
  }
}

function isValidUtf8(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    // Node util.TextDecoder with fatal:true — throws on invalid UTF-8.
    const dec = new (require('util').TextDecoder)('utf-8', { fatal: true });
    dec.decode(buf);
    return { ok: true, size: buf.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).filter(f => EXTS.has(path.extname(f)));
  } catch (e) {
    console.error('git diff --cached 실패:', e.message);
    return [];
  }
}

function main() {
  const stagedOnly = process.argv.includes('--staged');
  const files = stagedOnly
    ? getStagedFiles().filter(f => fs.existsSync(f))
    : (() => { const arr = []; SCAN_ROOTS.forEach(r => walkDir(r, arr)); return arr; })();

  if (files.length === 0) {
    console.log('[verify-utf8] 검사 대상 파일 없음');
    return 0;
  }

  const bad = [];
  for (const f of files) {
    const r = isValidUtf8(f);
    if (!r.ok) bad.push({ file: f, error: r.error });
  }

  if (bad.length > 0) {
    console.error('\n[verify-utf8] ❌ UTF-8 invalid 파일 ' + bad.length + '건 발견:');
    for (const b of bad) console.error('  ' + b.file + '  →  ' + b.error);
    console.error('\n  복구 방법: git show HEAD~1:<파일> 로 이전 커밋 원본 확인 후 restore.');
    console.error('  (2026-04-22 build f 실패 사고 대응용 가드)\n');
    return 1;
  }

  console.log('[verify-utf8] ✅ ' + files.length + '개 파일 모두 UTF-8 valid' + (stagedOnly ? ' (staged)' : ''));
  return 0;
}

process.exit(main());
