/**
 * v354 — Streaming prefetch (옵션 Z Step 1B)
 * 사장님 명령 2026-05-11.
 *
 * 진단 결과 (실측):
 *   28초 분해: TTFB 12.2초 + Download 1.4초 + Parse+Render 13.8초
 *   JSON 원본 47.7MB (마스터 doc 6MB 추정의 8배)
 *
 * 목적:
 *   /api/admin/listings/stream (NDJSON streaming) 호출 → fetch streaming reader 로
 *   매물 line-by-line parse + 매 page (10K rows) 마다 WS.allListings 점진 업데이트.
 *   사장님 시야 1-2초 안 첫 10K 매물 표시 (baseline 28초 대비 -26초 효과).
 *
 * Streaming 흐름:
 *   0초:    페이지 로드
 *   0.2초:  v354 init (INIT_DELAY)
 *   0.5초:  stream fetch start → first chunk (header) 도착
 *   1.5초:  page 1 (10K rows) 도착 → WS.allListings = 10K → renderAll → 사장님 시야
 *   3초:    page 2 (20K rows) 누적 → render throttled (250ms)
 *   5-7초:  60K 전체 stream 완료 → 최종 render
 *
 * 회귀 회피 (회귀 9번 학습):
 *   - 새 파일 → 기존 patch (v349, v352, v346, v294 등) 안 건드림
 *   - window.fetch wrap X → v294/v260-perf 충돌 회피
 *   - response.body stream 직접 사용 → 새 흐름, 충돌 X
 *   - WS.allListings 이미 큰 list (>1000) 이면 skip → cache 신선 흐름 영향 X
 *   - 60K 도착 감지 시 stream abort (race 회피)
 *   - 사용 안 되면 prod 영향 0 (등록 X 시 비활성)
 *
 * 안전 가드:
 *   - WS / WS.renderAll 없으면 skip
 *   - stream fail 시 silent (content.js 의 28초 fetch 가 fallback)
 *   - renderAll throttle 250ms (매 line 마다 render 회피 — 성능)
 *   - JSON.parse 라인별 try/catch (잘못된 line 1개로 전체 fail 회피)
 *
 * 사장님 시야 비교:
 *   - baseline (캐시 없음): 28초 skeleton → 62K 카드
 *   - v354 streaming: 1.5초 안 첫 10K → 5초 안 60K (모든 필터/검색 60K 정상)
 */
(function () {
  'use strict';
  if (window.__WS_V354_STREAM_PREFETCH__) return;
  window.__WS_V354_STREAM_PREFETCH__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  var DEBUG = true;
  var INIT_DELAY_MS = 200;
  var FULL_THRESHOLD = 1000;
  var ENDPOINT = '/api/admin/listings/stream';
  var RENDER_THROTTLE_MS = 300;   // 매 300ms 최대 1번 renderAll (CPU 절감)

  var streamLoaded = false;
  var fullLoaded = false;
  var streamAbortCtrl = null;
  var pendingRender = false;
  var lastRenderTime = 0;
  var pendingRenderTimer = null;
  var lastV354SetSize = 0;   // hotfix: v354 self-set marker

  function log() {
    if (!DEBUG) return;
    var args = ['[v354-stream-prefetch]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function getToken() {
    try {
      return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch (_) { return ''; }
  }

  function refreshUI_now() {
    pendingRender = false;
    lastRenderTime = Date.now();
    try {
      if (window.WS && typeof window.WS.renderAll === 'function') {
        window.WS.renderAll();
        return true;
      }
    } catch (e) {
      log('renderAll error:', e && e.message);
    }
    return false;
  }

  function refreshUI_throttled() {
    var now = Date.now();
    var sinceLast = now - lastRenderTime;
    if (sinceLast >= RENDER_THROTTLE_MS) {
      // immediate render
      if (pendingRenderTimer) { clearTimeout(pendingRenderTimer); pendingRenderTimer = null; }
      refreshUI_now();
    } else if (!pendingRender) {
      pendingRender = true;
      var delay = RENDER_THROTTLE_MS - sinceLast;
      pendingRenderTimer = setTimeout(function () {
        pendingRenderTimer = null;
        if (pendingRender) refreshUI_now();
      }, delay);
    }
  }

  async function streamFetch() {
    if (streamLoaded || fullLoaded) return;
    if (!window.WS) {
      log('WS missing — skip');
      return;
    }
    if (window.WS.allListings && window.WS.allListings.length > FULL_THRESHOLD) {
      log('WS.allListings already has', window.WS.allListings.length, '— skip stream');
      fullLoaded = true;
      return;
    }

    streamAbortCtrl = new AbortController();
    var t0 = Date.now();
    var firstChunkAt = 0;
    var firstRenderAt = 0;
    var rowCount = 0;
    var listings = [];

    try {
      var response = await fetch(ENDPOINT, {
        credentials: 'include',
        signal: streamAbortCtrl.signal,
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });

      if (!response.ok) throw new Error('http_' + response.status);
      if (!response.body) throw new Error('no_body_stream');

      var reader = response.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';

      // 진행 중 race condition check
      while (true) {
        if (fullLoaded) {
          // content.js 의 60K 가 먼저 도착했으면 abort
          log('full received externally — abort stream');
          try { streamAbortCtrl.abort(); } catch (_) {}
          break;
        }

        var readResult;
        try {
          readResult = await reader.read();
        } catch (e) {
          if (e && e.name === 'AbortError') break;
          throw e;
        }

        var done = readResult.done;
        var value = readResult.value;
        if (done) break;
        if (!firstChunkAt) {
          firstChunkAt = Date.now() - t0;
          log('first chunk received at', firstChunkAt, 'ms');
        }

        buffer += decoder.decode(value, { stream: true });

        // NDJSON: process complete lines (last incomplete line stays in buffer)
        var nlIdx;
        while ((nlIdx = buffer.indexOf('\n')) !== -1) {
          var line = buffer.substring(0, nlIdx);
          buffer = buffer.substring(nlIdx + 1);
          if (!line) continue;

          try {
            var obj = JSON.parse(line);
            if (obj && obj.type === 'header') {
              log('header:', obj);
            } else if (obj && obj.type === 'page') {
              log('page', obj.page, 'rows=' + obj.rows, 'total_sent=' + obj.total_sent,
                'elapsed=' + obj.elapsed_ms + 'ms');
              // page progress: update WS + throttled render
              if (!fullLoaded) {
                window.WS.allListings = listings.slice();  // copy reference
                lastV354SetSize = listings.length;  // hotfix self-set
                refreshUI_throttled();
                if (!firstRenderAt && listings.length > 0) {
                  firstRenderAt = Date.now() - t0;
                  log('first render queued at', firstRenderAt, 'ms');
                }
              }
            } else if (obj && obj.type === 'footer') {
              log('footer:', obj);
              if (!fullLoaded) {
                window.WS.allListings = listings;
                lastV354SetSize = listings.length;
                refreshUI_now();
                streamLoaded = true;
                fullLoaded = true;
              }
            } else if (obj && (obj.type === 'error' || obj.type === 'fatal')) {
              log('stream server error:', obj);
            } else if (obj && obj.id) {
              // listing row
              listings.push(obj);
              rowCount++;
            }
          } catch (parseErr) {
            log('JSON parse fail on line (skip):', line.substring(0, 100));
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          var lastObj = JSON.parse(buffer);
          if (lastObj && lastObj.id) listings.push(lastObj);
        } catch (_) { /* incomplete trailing — ignore */ }
      }

      // Final summary
      var totalMs = Date.now() - t0;
      log('stream complete:', rowCount, 'rows in', totalMs, 'ms (first chunk',
        firstChunkAt, 'ms, first render', firstRenderAt, 'ms)');

      // Ensure final WS state if footer didn't fire
      if (!streamLoaded && rowCount > 0 && !fullLoaded) {
        window.WS.allListings = listings;
        lastV354SetSize = listings.length;
        refreshUI_now();
        streamLoaded = true;
        fullLoaded = true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        log('stream aborted (race with full fetch)');
        return;
      }
      log('stream fail:', e && e.message);
    } finally {
      streamAbortCtrl = null;
    }
  }

  // content.js 의 fetchAllListings 가 먼저 도착하면 stream abort
  function watchForFull() {
    var probeAttempts = 0;
    var probeMax = 60;
    var intv = setInterval(function () {
      probeAttempts++;
      if (fullLoaded) {
        clearInterval(intv);
        return;
      }
      if (window.WS && window.WS.allListings && window.WS.allListings.length > FULL_THRESHOLD) {
        // HOTFIX: v354 self-set vs external set 구분
        var curSize = window.WS.allListings.length;
        var isLikelySelfSet = streamAbortCtrl !== null && curSize >= lastV354SetSize && curSize <= lastV354SetSize + 10;
        if (isLikelySelfSet) {
          log('watchForFull self-set', curSize, '~', lastV354SetSize, 'continue');
          return;
        }
        if (!streamLoaded) {
          fullLoaded = true;
          if (streamAbortCtrl) {
            try { streamAbortCtrl.abort(); } catch (_) {}
          }
          log('full received externally:', curSize, 'rows after', probeAttempts, 's (lastV354SetSize=' + lastV354SetSize + ')');
        }
        clearInterval(intv);
      } else if (probeAttempts >= probeMax) {
        clearInterval(intv);
      }
    }, 1000);
  }

  function init() {
    setTimeout(function () {
      streamFetch();
      watchForFull();
    }, INIT_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('installed (endpoint', ENDPOINT, ', init delay', INIT_DELAY_MS, 'ms, throttle',
    RENDER_THROTTLE_MS, 'ms)');
})();
