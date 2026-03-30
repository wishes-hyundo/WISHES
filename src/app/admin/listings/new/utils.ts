// 스마트 매물 등록 - 공유 유틸리티
'use client';

// Debounce utility
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Area conversion: pyeong <-> sqm
function pyeongToSqm(p) { return (p * 3.305785).toFixed(2); }
function sqmToPyeong(s) { return (s / 3.305785).toFixed(2); }

// Retry wrapper for async operations
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay * attempt));
    }
  }
}

// Loading skeleton for step transitions
function StepSkeleton() {
  return React.createElement('div', { className: 'animate-pulse space-y-4 p-6' },
    React.createElement('div', { className: 'h-8 bg-gray-200 rounded w-1/3' }),
    React.createElement('div', { className: 'space-y-3' },
      React.createElement('div', { className: 'h-12 bg-gray-200 rounded' }),
      React.createElement('div', { className: 'h-12 bg-gray-200 rounded' }),
      React.createElement('div', { className: 'h-12 bg-gray-200 rounded w-2/3' })
    )
  );
}




// Last updated: 2026-03-31 via GitHub API

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   타입 정의
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export { debounce, pyeongToSqm, sqmToPyeong, withRetry };
