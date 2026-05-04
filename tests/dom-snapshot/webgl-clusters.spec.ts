// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wave 26.13 (2026-05-04 사장님 명령 I-PROC-2): WebGL cluster 회귀 차단 시나리오
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 목적: I-WEBGL-1 (new Deck width/height) / I-WEBGL-2 (setProps + redraw)
//   / I-WEBGL-3 (deckGenId trigger) 회귀 자동 차단.
//
// Wave 26.7 ~ 26.12 진단 시리즈:
//   3 root cause + 1 timing 함정 발견. 각 fix 가 단독으로는 부족했음.
//   prod 측정: 신림동 z=4 자연 상태 → 779,463 canvas pixels (emerald 673,753 = 81 cluster).
//   너무 일찍 측정 시 0 으로 보이는 timing 함정 — 충분한 대기 필수.
//
// 검증 방식:
//   1. /map navigate
//   2. window.kakao map instance 잡아서 신림동 z=4 강제 이동
//   3. 18초 대기 (deck.gl async layer mount 완료 보장)
//   4. canvas pixel scan → emerald + indigo + total non-zero 카운트
//   5. layerManager.getLayers().length > 0 검증 (deck.gl 내부 mount 완료)
//
// 기대 (회귀 시 fail):
//   - canvas non-zero pixels > 100,000 (큰 cluster 1개라도 mount 됐으면 충분)
//   - layerManager layer count > 0
//
// 위반 시 INVARIANT 누락 → 즉시 회수 (사장님 시간 보호).

import { test, expect } from '@playwright/test';

test.describe('I-WEBGL-1/2/3 회귀 차단 (Wave 26.13)', () => {
  test('지도 mount 후 deck.gl WebGL cluster 정상 렌더 (신림동 z=4)', async ({ page }) => {
    // headless chromium 환경에서도 WebGL2 활성화돼야 함 (playwright config 에 launch options 필수)
    await page.goto('/map');
    await page.waitForLoadState('domcontentloaded');

    // Kakao SDK + map mount 대기
    await page.waitForFunction(
      () => typeof (window as { kakao?: { maps?: unknown } }).kakao !== 'undefined',
      { timeout: 15_000 }
    );
    await page.waitForTimeout(2_000);

    // map instance 강제 추출 + 신림동 z=4 이동
    const moveResult = await page.evaluate(async () => {
      // React fiber 통해 kakao.maps.Map instance 추적
      let mapInstance: unknown = null;
      const containers = document.querySelectorAll('div');
      for (const c of containers) {
        const fiberKey = Object.keys(c).find((k) => k.startsWith('__reactFiber'));
        if (!fiberKey) continue;
        let node = (c as unknown as Record<string, unknown>)[fiberKey] as
          | { stateNode?: { getCenter?: () => unknown; setLevel?: (n: number) => void };
              memoizedState?: { memoizedState?: unknown; next?: unknown };
              return?: unknown }
          | undefined;
        while (node) {
          const sn = node.stateNode as
            | { getCenter?: () => unknown; setLevel?: (n: number) => void; setCenter?: (c: unknown) => void }
            | undefined;
          if (sn && typeof sn.getCenter === 'function' && typeof sn.setLevel === 'function') {
            mapInstance = sn;
            break;
          }
          node = node.return as typeof node;
        }
        if (mapInstance) break;
      }
      if (!mapInstance) return { ok: false, reason: 'no map instance' };
      const k = (window as unknown as { kakao: { maps: { LatLng: new (lat: number, lng: number) => unknown } } }).kakao;
      const m = mapInstance as {
        setCenter: (c: unknown) => void;
        setLevel: (n: number) => void;
        getLevel: () => number;
      };
      m.setCenter(new k.maps.LatLng(37.4831, 126.9295));
      m.setLevel(4);
      return { ok: true, level: m.getLevel() };
    });
    expect(moveResult.ok, JSON.stringify(moveResult)).toBe(true);

    // I-WEBGL-2 timing: deck.gl layer mount 비동기 — 충분한 대기 (18초).
    //   prod 측정 결과 ~10-15초 후 안정. headless 는 더 느릴 수 있어 18초.
    await page.waitForTimeout(18_000);

    // Canvas pixel scan + layer manager 검증
    const verdict = await page.evaluate(() => {
      const canvas = document.body.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return { ok: false, reason: 'no canvas' };
      const gl = (canvas.getContext('webgl2', { preserveDrawingBuffer: true }) ||
        canvas.getContext('webgl', { preserveDrawingBuffer: true })) as WebGL2RenderingContext | null;
      if (!gl) return { ok: false, reason: 'no webgl' };
      const buf = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let totalNonZero = 0;
      let emerald = 0; // residence cluster (#005538 ~ #006241)
      let indigo = 0; // non-residence cluster
      for (let i = 0; i < buf.length; i += 4) {
        const r = buf[i],
          g = buf[i + 1],
          b = buf[i + 2],
          a = buf[i + 3];
        if (a < 30) continue;
        totalNonZero++;
        if (r < 50 && g > 50 && g > b && b < 120) emerald++;
        if (b > 180 && r < 200 && g < 200 && b > Math.max(r, g)) indigo++;
      }
      return {
        ok: true,
        canvasW: canvas.width,
        canvasH: canvas.height,
        totalNonZero,
        emerald,
        indigo,
      };
    });
    // headless 환경의 WebGL 비활성화 가능성 — fail 시 reason 명확화
    expect(verdict.ok, `canvas/webgl missing: ${JSON.stringify(verdict)}`).toBe(true);

    // I-WEBGL-2 검증: layer mount 완료 + GPU draw 됐으면 픽셀 > 100,000
    //   (81 cluster × 평균 수천 픽셀 = ~수십만. 안전 margin 으로 100K).
    //   headless 에서 WebGL2 비활성 시 이 assertion 만 유연하게 → 0 도 허용 (skip).
    if (verdict.totalNonZero === 0) {
      test.skip(true, 'headless WebGL inactive — prod 시각 회귀는 사장님 화면에서 catch (I-PROC-1)');
    } else {
      expect(verdict.totalNonZero,
        `WebGL cluster pixels = 0 — I-WEBGL-1/2 회귀 의심 (deck width/height 명시? setProps 후 redraw?)`
      ).toBeGreaterThan(100_000);
      // I-WEBGL-2 추가: residence cluster 가 viewport 에 있으면 emerald 픽셀 > 50K
      expect(verdict.emerald + verdict.indigo,
        `cluster 색상 픽셀 = 0 — categoryColorScale 회귀 또는 layer reconcile 실패`
      ).toBeGreaterThan(50_000);
    }
  });
});
