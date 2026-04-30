// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-FIX2: External module declarations (production runtime only deps)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사장님 명령 (CLAUDE.md): "함수 사이즈 ~3MB 유지" → @sparticuz/chromium-min
// + puppeteer-core 는 deps/devDeps 에 추가 X (Vercel 함수 사이즈 한도 보호).
//
// 그러나 src/app/api/admin/briefing-pdf/[id]/route.ts 가 dynamic import 사용
// → typecheck 단계에서 module not found 에러.
//
// 해결: 이 파일에서 module declaration 으로 type 만 stub.
//   런타임에 실제 패키지 없으면 dynamic import 실패 → catch 블록 fallback.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

declare module '@sparticuz/chromium-min' {
  export const args: string[];
  export const defaultViewport: any;
  export function executablePath(url?: string): Promise<string>;
  const chromium: {
    args: string[];
    defaultViewport: any;
    executablePath: (url?: string) => Promise<string>;
  };
  export default chromium;
}

declare module 'puppeteer-core' {
  export function launch(options: any): Promise<any>;
  const puppeteer: {
    launch: (options: any) => Promise<any>;
  };
  export default puppeteer;
}
