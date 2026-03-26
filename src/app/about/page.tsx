import { MapPin, Phone, Mail, Clock, Award, Users, Shield, Building2 } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'íì¬ìê°',
  description: 'ììì¤ë¶ëì°ì¤ê°ë²ì¸ íì¬ìê° - ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì°',
};

export default function AboutPage() {
  return (
    <div className="pt-16 min-h-screen">
      {/* íì´ë¡ */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold">íì¬ ìê°</h1>
          <p className="mt-3 text-white/80">
            ìì¸Â·ê²½ê¸° ì¢í©ë¶ëì°, ììì¤ë¶ëì°ì¤ê°ë²ì¸
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">

        {/* ì·¨ê¸ ë§¤ë¬¼ */}
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-wishes-primary mb-6 flex items-center gap-2">
            <Award className="w-6 h-6" />
            ì·¨ê¸ ë§¤ë¬¼
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['ìë£¸', 'í¬ë£¸', 'ì°ë¦¬ë£¸', 'ì¤í¼ì¤í', 'ìíí¸', 'ìê°', 'ì¬ë¬´ì¤'].map((type) => (
              <div key={type} className="text-center p-4 bg-blue-50 rounded-xl">
                <Building2 className="w-8 h-8 text-wishes-secondary mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-700">{type}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ê°ì  */}
        <section>
          <h2 className="text-xl font-bold text-wishes-primary mb-6 text-center">
            ììì¤ë¶ëì°ì ê°ì 
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: MapPin,
                title: 'ì§ì­ ì ë¬¸ì±',
                desc: 'ìì¸Â·ê²½ê¸° ì  ì§ì­ì ëí ê¹ì ì´í´ì íë¶í ë§¤ë¬¼ ë°ì´í°ë¥¼ ë³´ì íê³  ììµëë¤.',
              },
              {
                icon: Users,
                title: 'ì ë¬¸ ìë´í',
                desc: 'ê³µì¸ì¤ê°ì¬ ìê²©ì ê°ì¶ ì ë¬¸ ìë´íì´ ê³ ê° ë§ì¶¤í ìë¹ì¤ë¥¼ ì ê³µí©ëë¤.',
              },
              {
                icon: Shield,
                title: 'ìì í ê±°ë',
                desc: 'ëª¨ë  ê±°ë ê³¼ì ìì ê³ ê°ì ê¶ë¦¬ë¥¼ ìµì°ì ì¼ë¡ ë³´í¸íë ìì í ì¤ê° ìë¹ì¤ë¥¼ ì ê³µí©ëë¤.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-6">
                <item.icon className="w-10 h-10 text-wishes-secondary mb-4" />
                <h3 className="text-lg font-bold text-wishes-primary mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ì¤ìë ê¸¸ */}
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-wishes-primary mb-6 flex items-center gap-2">
            <MapPin className="w-6 h-6" />
            ì¤ìë ê¸¸
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5 text-wishes-secondary shrink-0" />
                <span>ìì¸í¹ë³ì ê´ìêµ¬ ì ë¦¼ë¡64ê¸¸ 23, 8ì¸µ(ì ë¦¼ë)</span>
              </div>
              <div className="flex items-center gap-3">
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-wishes-secondary shrink-0" />
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-wishes-secondary shrink-0" />
              </div>
            </div>
            {/* ì¹´ì¹´ì¤ë§µ */}
            <div className="aspect-[16/10] rounded-lg overflow-hidden">
              <iframe
                src="https://maps.google.com/maps?q=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C+%EA%B4%80%EC%95%85%EA%B5%AC+%EC%8B%A0%EB%A6%BC%EB%A1%9C64%EA%B8%B8+23&t=&z=17&ie=UTF8&iwloc=B&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="ììì¤ë¶ëì° ìì¹"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
