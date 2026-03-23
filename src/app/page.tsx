import Link from 'next/link';
import { MapPin, Search, Phone, ArrowRight, Building2, Shield, Users } from 'lucide-react';
import { db } from '@/db';
import { listings } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ListingCard } from '@/components/ListingCard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // ìµì  ë§¤ë¬¼ 6ê±´ ì¡°í
  const latestListings = await db
    .select()
    .from(listings)
    .where(eq(listings.status, 'ê°ì©'))
    .orderBy(desc(listings.createdAt))
    .limit(6);

  return (
    <div className="pt-16">
      {/* âââ íì´ë¡ ì¹ì âââ */}
      <section className="relative bg-gradient-to-br from-wishes-primary via-wishes-secondary to-blue-700 text-white py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold leading-tight">
            ìì¸ ê´ìêµ¬<br className="md:hidden" /> ë¶ëì°ì ìë¡ì´ ê¸°ì¤
          </h1>
          <p className="mt-4 text-lg text-blue-200 max-w-2xl mx-auto">
            ì ë¦¼ëÂ·ë´ì²ë ì§ì­ ì ë¬¸ ììì¤ë¶ëì°ì´<br />
            ê³ ê°ëì ìì¤í ë³´ê¸ìë¦¬ë¥¼ ì°¾ìëë¦½ëë¤
          </p>

          {/* ë¹ ë¥¸ ê²ì */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto">
            <Link
              href="/map"
              className="flex items-center justify-center gap-2 bg-white text-wishes-primary px-6 py-3 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              <MapPin className="w-5 h-5" />
              ì§ëë¡ ë§¤ë¬¼ ê²ì
            </Link>
            <Link
              href="/listings"
              className="flex items-center justify-center gap-2 bg-white/20 text-white px-6 py-3 rounded-xl font-bold text-lg border border-white/30 hover:bg-white/30 transition-all"
            >
              <Search className="w-5 h-5" />
              ì ì²´ ë§¤ë¬¼ ë³´ê¸°
            </Link>
          </div>

          {/* íµê³ */}
          <div className="mt-12 flex justify-center gap-8 md:gap-16 text-center">
            {[
              { label: 'ë±ë¡ ë§¤ë¬¼', value: `${latestListings.length}+`, icon: Building2 },
              { label: 'ì ë¬¸ ìë´ì¬', value: '5ëª', icon: Users },
              { label: 'ê³ ê° ë§ì¡±ë', value: '98%', icon: Shield },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <stat.icon className="w-6 h-6 text-blue-300 mb-1" />
                <span className="text-2xl md:text-3xl font-bold">{stat.value}</span>
                <span className="text-xs text-blue-300 mt-1">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* íë¨ ì¨ì´ë¸ */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" className="w-full h-12 md:h-16 text-wishes-bg">
            <path fill="currentColor" d="M0,40 C360,80 1080,0 1440,40 L1440,60 L0,60 Z" />
          </svg>
        </div>
      </section>

      {/* âââ ìµì  ë§¤ë¬¼ ì¹ì âââ */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-wishes-primary">ìµì  ë§¤ë¬¼</h2>
            <p className="text-sm text-gray-500 mt-1">ê´ìêµ¬ ì ë¦¼ëÂ·ë´ì²ë ì§ì­ ìµì  ë§¤ë¬¼ìëë¤</p>
          </div>
          <Link
            href="/listings"
            className="flex items-center gap-1 text-sm font-medium text-wishes-secondary hover:underline"
          >
            ì ì²´ë³´ê¸° <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {latestListings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {latestListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing as any} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">ë±ë¡ë ë§¤ë¬¼ì´ ììµëë¤</p>
            <p className="text-sm text-gray-400 mt-1">ê³§ ìë¡ì´ ë§¤ë¬¼ì´ ë±ë¡ë©ëë¤</p>
          </div>
        )}
      </section>

      {/* âââ ìë¹ì¤ í¹ì§ âââ */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-wishes-primary text-center mb-12">
            ììì¤ë¶ëì°ì ì íí´ì¼ íë ì´ì 
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: 'ì§ë ê¸°ë° ë§¤ë¬¼ ê²ì',
                desc: 'ì¹´ì¹´ì¤ë§µìì ìíë ìì¹ì ë§¤ë¬¼ì ì¤ìê°ì¼ë¡ íì¸íì¸ì. ì§ëë¥¼ ì´ëíë©´ í´ë¹ ì§ì­ì ë§¤ë¬¼ì´ ìëì¼ë¡ íìë©ëë¤.',
                icon: MapPin,
              },
              {
                title: 'ì§ì­ ì ë¬¸ ìë´',
                desc: 'ê´ìêµ¬ ì ë¦¼ëÂ·ë´ì²ë ì§ì­ì ëí ê¹ì ì´í´ë¥¼ ë°íì¼ë¡ ìµì ì ë§¤ë¬¼ì ì¶ì²í´ëë¦½ëë¤.',
                icon: Users,
              },
              {
                title: 'ìì í ê±°ë',
                desc: 'ê³µì¸ì¤ê°ì¬ê° ì§ì  ê±°ëë¥¼ ì§ííë©°, ëª¨ë  ê³ì½ ê³¼ì ìì ê³ ê°ëì ê¶ë¦¬ë¥¼ ë³´í¸í©ëë¤.',
                icon: Shield,
              },
            ].map((feature) => (
              <div key={feature.title} className="text-center p-6">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-7 h-7 text-wishes-secondary" />
                </div>
                <h3 className="text-lg font-bold text-wishes-primary mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* âââ CTA ì¹ì âââ */}
      <section className="bg-gradient-to-r from-wishes-primary to-wishes-secondary text-white py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            ìíë ë§¤ë¬¼ì ëª» ì°¾ì¼ì¨ëì?
          </h2>
          <p className="text-blue-200 mb-8">
            ì ë¬¸ ìë´ì¬ê° ê³ ê°ëì ì¡°ê±´ì ë§ë ë§¤ë¬¼ì ì§ì  ì°¾ìëë¦½ëë¤
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:1533-9580"
              className="flex items-center justify-center gap-2 bg-white text-wishes-primary px-8 py-3 rounded-xl font-bold hover:shadow-lg transition-all"
            >
              <Phone className="w-5 h-5" />
              ì í ìë´ 1533-9580
            </a>
            <Link
              href="/contact"
              className="flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-3 rounded-xl font-bold hover:bg-white/10 transition-all"
            >
              ì¨ë¼ì¸ ìë´ ì ì²­
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
