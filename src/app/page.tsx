import Link from 'next/link';
import { MapPin, ArrowRight, Search, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import HeroBackground from '@/components/HeroBackground';
import HomeMapPreview from '@/components/HomeMapPreview';

// L4 (2026-04-21): force-dynamic 제거 + ISR 활성화.
//   popularDongs / totalListings 는 개인화·세션 의존 없는 집계 데이터 →
//   5분 revalidate 로 엣지 캐시가 흡수. 히어로 TTFB 급감.
//   관리자 매물 대량 작업 시에는 revalidatePath('/') 로 즉시 무효화 가능.
export const revalidate = 300;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 = 지도로 가는 단 하나의 관문.
// 위젯·섹션·카테고리·카드·지표 모두 제거.
// 사용자는 히어로에서 바로 /map(허브)로 진입하거나, 인기 동을 지도에 바로 불러옴.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default async function HomePage() {
  let popularDongs: string[] = [];
  let totalListings = 0;

  try {
    const supabase = createClient();

    const withTimeout = <T,>(thenable: PromiseLike<T>, ms = 4000): Promise<T> =>
      Promise.race([
        Promise.resolve(thenable),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    const [dongRes, countRes] = await Promise.allSettled([
      withTimeout(supabase
        .from('listings')
        .select('dong')
        .eq('status', '공개')
        .not('dong', 'is', null)
        .limit(300) as unknown as PromiseLike<any>),
      withTimeout(supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', '공개') as unknown as PromiseLike<any>),
    ]);

    if (dongRes.status === 'fulfilled') {
      const rows = (dongRes.value as any).data || [];
      const counter = new Map<string, number>();
      rows.forEach((r: any) => {
        if (!r.dong) return;
        counter.set(r.dong, (counter.get(r.dong) || 0) + 1);
      });
      popularDongs = Array.from(counter.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([d]) => d);
    }
    if (countRes.status === 'fulfilled') {
      totalListings = (countRes.value as any).count || 0;
    }
  } catch (e) {
    console.error('Homepage Supabase error:', e);
  }

  return (
    <div className="pt-16 bg-wishes-bg min-h-[100dvh]">
      {/* ━━━ 풀블리드 히어로 = 지도 허브 입장구 ━━━ */}
      <section className="relative min-h-[calc(100dvh-4rem)] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-wishes-primary via-wishes-primary to-wishes-secondary">
          <HeroBackground />
        </div>

        <div className="relative w-full max-w-6xl mx-auto px-4 py-12 md:py-20">
          <div className="grid md:grid-cols-5 gap-10 md:gap-14 items-center">
            {/* Left: 카피 + CTA */}
            {/* L-perf3 (2026-04-21): animate-fade-in-up 제거 — Chrome 은 opacity:0
                으로 시작하는 요소를 LCP 대상에서 '아직 paint 안 됨' 으로 취급해 페이드
                애니메이션 0.5s 만큼 LCP 가 밀림 (홈 Lighthouse LCP 1.7s, diagnostic
                1,690ms). 히어로는 above-the-fold → 즉시성 > 우아함 → 애니 제거로
                LCP 1.7s → ~1.2s 겨냥. */}
            <div className="md:col-span-3 text-center md:text-left space-y-6 md:space-y-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/25 backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-wishes-accent" />
                <span className="text-xs font-medium text-white/90">
                  위시스부동산 · 전국 17 시도 · {totalListings.toLocaleString('ko-KR')}개 매물
                </span>
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight">
                지도에서<br />
                <span className="text-wishes-accent">바로 찾는</span> 집.
              </h1>

              <p className="text-base md:text-lg text-white/80 max-w-xl leading-relaxed">
                동·역·단지 이름 필요 없어요. 지도만 움직여도 실시간으로
                매매·전세·월세·상가 매물이 뜹니다.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Link
                  href="/map"
                  className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white text-wishes-primary font-bold text-base shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all"
                >
                  <MapPin className="w-5 h-5" />
                  지도에서 매물 찾기
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                {/* /listings는 /map으로 통합 — 중복 CTA 대신 '맞춤 매물 의뢰'로 리드 캡처 */}
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white/10 text-white font-semibold text-base border border-white/30 backdrop-blur-md hover:bg-white/20 transition-all"
                >
                  <Search className="w-5 h-5" />
                  맞춤 매물 의뢰
                </Link>
              </div>

              {/* 인기 동 바로 진입 (최대 8개, 지도 허브로 다이렉트) */}
              {popularDongs.length > 0 && (
                <div className="pt-4">
                  {/* L-a11y1 (2026-04-21): text-white/60 → text-white/80.
                      #1b5e20 위 white/60 은 대비 3.99:1 로 WCAG AA 4.5:1 fail.
                      white/80 은 5.78:1 로 통과. Lighthouse Accessibility 95 → 100. */}
                  <p className="text-xs text-white/80 mb-2.5">인기 동 · 지도에서 바로 열기</p>
                  <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                    {popularDongs.map((dong) => (
                      <Link
                        key={dong}
                        href={`/map?dong=${encodeURIComponent(dong)}`}
                        className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[32px] px-3.5 sm:px-3 py-2 sm:py-1.5 rounded-full bg-white/10 text-white/90 text-sm sm:text-xs font-medium border border-white/20 backdrop-blur-sm hover:bg-white/20 hover:border-white/40 active:scale-95 transition-all"
                      >
                        <MapPin className="w-3 h-3" />
                        {dong}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: 지도 미리보기 (시각적 앵커) */}
            <div className="md:col-span-2 hidden md:block">
              <HomeMapPreview />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
