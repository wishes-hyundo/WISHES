import Link from 'next/link';
import { MapPin, Search, ArrowRight, Building2, Droplets, ShieldCheck, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { HomeListingCard } from '@/components/HomeListingCard';

export default async function HomePage() {
  // Supabaseìì ìµì  ë§¤ë¬¼ 6ê±´ ê°ì ¸ì¤ê¸°
  const supabase = createClient();
  const { data: listings } = await supabase
    .from('listings')
    .select('*, listing_images(url, alt, sort_order)')
    .eq('status', 'ê°ì©')
    .order('created_at', { ascending: false })
    .limit(6);

  const latestListings = listings || [];

  return (
    <div className="pt-16 bg-wishes-bg">
      {/* âââ íì´ë¡ ì¹ì â Fresh Green Droplet âââ */}
      <section className="relative min-h-[80vh] flex items-center justify-center pt-12 pb-28 overflow-hidden bg-gradient-hero">
        {/* ë°°ê²½ ë³´ì¼ ê¸ë¡ì° */}
        <div className="absolute top-[-5%] left-[60%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(76,175,80,0.15),transparent_70%)] blur-[60px] animate-float"></div>
        <div className="absolute bottom-[10%] left-[-5%] w-[350px] h-[350px] rounded-full bg-[radial-gradient(circle,rgba(129,199,132,0.12),transparent_70%)] blur-[60px] animate-float" style={{ animationDelay: '3s', animationDuration: '15s' }}></div>
        <div className="absolute top-[40%] right-[-3%] w-[280px] h-[280px] rounded-full bg-[radial-gradient(circle,rgba(165,214,167,0.15),transparent_70%)] blur-[60px] animate-float" style={{ animationDelay: '6s', animationDuration: '18s' }}></div>

        {/* ë°°ê²½ ë¬¼ë°©ì¸ ëí */}
        <div className="absolute top-[15%] left-[8%] w-14 h-16 rounded-droplet border border-wishes-accent/10 bg-wishes-accent/[0.04] animate-droplet-bob"></div>
        <div className="absolute top-[70%] left-[75%] w-9 h-11 rounded-droplet border border-wishes-light/10 bg-wishes-light/[0.04] animate-droplet-bob" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-[50%] left-[87%] w-[70px] h-[82px] rounded-droplet border border-wishes-accent/8 bg-wishes-accent/[0.03] animate-droplet-bob" style={{ animationDelay: '3s' }}></div>

        <div className="relative max-w-4xl mx-auto px-4 text-center space-y-10 animate-fade-in-up">
          <div className="space-y-7">
            {/* ë±ì§ */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/70 border border-wishes-secondary/8 backdrop-blur-lg shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-green-500 to-green-700 animate-pulse"></div>
              <p className="text-sm font-medium text-wishes-secondary tracking-wider">ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì° ìë¹ì¤</p>
            </div>

            {/* íì´í */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-wishes-text leading-[1.2] tracking-tight">
              ë¹ì ì ê¿,<br className="sm:hidden" /> ì°ë¦¬ì <span className="text-gradient">ì½ì</span>
            </h1>
          </div>

          {/* CTA ë²í¼ â ë¬¼ë°©ì¸ ë¥ê·¼ ì¤íì¼ */}
          <div className="flex flex-col sm:flex-row gap-3.5 justify-center pt-2">
            <Link
              href="/map"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-gradient-to-r from-wishes-secondary to-wishes-primary text-white font-bold text-base shadow-lg shadow-wishes-secondary/30 hover:shadow-xl hover:shadow-wishes-secondary/40 hover:-translate-y-1 transition-all duration-300 group"
            >
              <MapPin className="w-5 h-5" />
              ì§ë ê²ì
            </Link>
            <Link
              href="/listings"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-white/75 text-wishes-text font-bold text-base border border-wishes-secondary/10 hover:bg-white/90 hover:-translate-y-1 backdrop-blur-sm shadow-sm transition-all duration-300 group"
            >
              <Search className="w-5 h-5" />
              ë§¤ë¬¼ ë³´ê¸°
            </Link>
          </div>
        </div>

        {/* ë¹ ë¥¸ ê²ì */}
        <div className="mt-10 w-full max-w-3xl mx-auto">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl p-5 shadow-xl border border-wishes-green/10">
            <div className="flex flex-col sm:flex-row gap-3">
              <select className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm text-wishes-text bg-white focus:outline-none focus:ring-2 focus:ring-wishes-green/30" defaultValue="">
                <option value="" disabled>ê±°ëì í</option>
                <option value="monthly">ìì¸</option>
                <option value="jeonse">ì ì¸</option>
                <option value="sale">ë§¤ë§¤</option>
              </select>
              <select className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm text-wishes-text bg-white focus:outline-none focus:ring-2 focus:ring-wishes-green/30" defaultValue="">
                <option value="" disabled>ë§¤ë¬¼ì í</option>
                <option value="oneroom">ìë£¸/í¬ë£¸</option>
                <option value="officetel">ì¤í¼ì¤í</option>
                <option value="apartment">ìíí¸</option>
                <option value="commercial">ìê°/ì¬ë¬´ì¤</option>
              </select>
              <select className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm text-wishes-text bg-white focus:outline-none focus:ring-2 focus:ring-wishes-green/30" defaultValue="">
                <option value="" disabled>ì§ì­</option>
                <option value="gwanak">ê´ìêµ¬</option>
                <option value="gangnam">ê°ë¨êµ¬</option>
                <option value="yeongdeungpo">ìë±í¬êµ¬</option>
                <option value="suwon">ììì</option>
                <option value="seongnam">ì±ë¨ì</option>
              </select>
              <Link href="/listings" className="px-8 py-3 rounded-xl bg-wishes-green text-white text-sm font-semibold hover:bg-wishes-green/90 transition-colors text-center whitespace-nowrap">
                ê²ì
              </Link>
            </div>
          </div>
        </div>

        {/* íë¨ whisper */}
        <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-light tracking-[1.5px] text-wishes-secondary/[0.18] whitespace-nowrap pointer-events-none animate-fade-in" style={{ animationDelay: '3.5s' }}>
          May your wishes be the seeds that bloom into beautiful realities.
        </p>
      </section>

      {/* âââ ì ë¢° ë°°ì§ ì¹ì â ë¬¼ë°©ì¸ ìì´ì½ + íµíµ ë°ì´ì¤ âââ */}
      <section className="max-w-4xl mx-auto px-4 -mt-14 relative z-10 mb-20">
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {[
            { Icon: Droplets, label: 'ì ë¬¸ ìë´', desc: 'ê³ ê° ë§ì¶¤í', color: 'from-green-400 to-green-600', delay: '0s' },
            { Icon: ShieldCheck, label: 'ìì  ê±°ë', desc: 'ê³ì½ ë³´í¸', color: 'from-lime-400 to-lime-600', delay: '0.15s' },
            { Icon: Zap, label: 'ì ì ëì', desc: 'ì¤ìê° ìë´', color: 'from-teal-400 to-teal-600', delay: '0.3s' },
          ].map((badge) => (
            <div
              key={badge.label}
              className="flex flex-col items-center p-5 md:p-6 rounded-2xl bg-white border border-wishes-border/60 shadow-card hover:shadow-card-hover hover:border-wishes-accent/20 transition-all duration-300 animate-fade-in-up"
              style={{ animationDelay: badge.delay }}
            >
              <div className={`w-11 h-11 icon-droplet bg-gradient-to-br ${badge.color} flex items-center justify-center mb-3 shadow-droplet animate-bounce-soft`} style={{ animationDelay: badge.delay }}>
                <badge.Icon className="w-5 h-5 text-white" />
              </div>
              <p className="font-bold text-sm text-wishes-text">{badge.label}</p>
              <p className="text-xs text-wishes-muted mt-1">{badge.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* âââ ìµì  ë§¤ë¬¼ ì¹ì âââ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-10 animate-fade-in-up">
            <div>
              <p className="text-sm font-semibold text-wishes-accent tracking-wide mb-1.5">NEW LISTINGS</p>
              <h2 className="text-2xl md:text-3xl font-bold text-wishes-text">
                ìµì  ë§¤ë¬¼
              </h2>
              <p className="text-wishes-muted mt-2 text-sm">ìë¡ ë±ë¡ë ë§¤ë¬¼ì íì¸íì¸ì</p>
            </div>
            <Link
              href="/listings"
              className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-wishes-secondary border border-wishes-secondary/20 hover:bg-wishes-secondary/5 transition-all"
            >
              ì ì²´ë³´ê¸° <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {latestListings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in-up">
              {latestListings.map((listing: any, idx: number) => (
                <div key={listing.id} style={{ animationDelay: `${idx * 60}ms` }} className="animate-fade-in-up">
                  <HomeListingCard listing={listing} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-wishes-cream/50 rounded-2xl">
              <Building2 className="w-12 h-12 text-wishes-light mx-auto mb-3" />
              <p className="text-wishes-muted text-sm">ë±ë¡ë ë§¤ë¬¼ì´ ììµëë¤</p>
            </div>
          )}

          <div className="mt-10 text-center md:hidden">
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-wishes-secondary border border-wishes-secondary/20 hover:bg-wishes-secondary/5 transition-all"
            >
              ì ì²´ë³´ê¸° <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
