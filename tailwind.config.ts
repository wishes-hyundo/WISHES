import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // L-ux5-4 (2026-04-22): /map 2026 UI 는 src/features/map-2026/ 밑에 분리되어
    //   있어 기본 glob 이 이를 스캔하지 않았다. 결과로 SmartChips/CategoryTabs/
    //   ResidenceChips/HeroPin/ListPanel/MapControls/MiniCard 등 14개 파일이
    //   쓰는 bg-neutral-*, bg-rose-*, bg-emerald-* 류 색상 클래스가 생성되지 않아
    //   "전체" 칩을 포함한 모든 active 버튼이 투명 배경으로 렌더되던 버그.
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wishes: {
          primary: '#1b5e20',
          secondary: '#2e7d32',
          accent: '#66bb6a',
          light: '#a5d6a7',
          cream: '#f1f8e9',
          bg: '#f4f9f4',
          text: '#1b3a24',
          muted: '#3f5d47',
          card: '#ffffff',
          border: '#c8e6c9',
          dark: '#0a2e12',
          'dark-light': '#133a1b',
          // Phase 2 (2026-04-28): 옛날 /search 픽셀 색상 (content.js + styles.css 분석)
          'search-primary': '#2D5A27',
          'search-primary-dark': '#1a3d18',
          'search-primary-pale': '#E8F5E9',
          'search-card-hover': '#fafff9',
          'search-card-selected': '#f0fdf4',
          'search-deal-bg': '#FFF3E0',
          'search-deal-fg': '#E65100',
        },
      },
      fontFamily: {
        sans: ['GmarketSans', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Helvetica Neue', 'Apple SD Gothic Neo', 'sans-serif'],
        display: ['GmarketSans', 'Pretendard', 'sans-serif'],
        body: ['GmarketSans', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 8px rgba(30,90,50,0.04), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 12px 32px rgba(46,125,50,0.1), 0 4px 8px rgba(0,0,0,0.04)',
        'premium': '0 24px 48px rgba(46,125,50,0.14), 0 8px 16px rgba(0,0,0,0.06)',
        'glass': '0 8px 32px rgba(30,90,50,0.06)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.15)',
        'soft': '0 1px 3px rgba(0,0,0,0.03)',
        'droplet': '0 8px 24px rgba(46,125,50,0.15), 0 2px 6px rgba(46,125,50,0.08)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        'droplet': '50% 50% 50% 50% / 60% 60% 40% 40%',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-premium': 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #1b5e20 100%)',
        'gradient-accent': 'linear-gradient(135deg, #43a047 0%, #66bb6a 50%, #81c784 100%)',
        'gradient-warm': 'linear-gradient(135deg, #f4f9f4 0%, #e8f5e9 100%)',
        'gradient-dark': 'linear-gradient(180deg, #0a2e12 0%, #133a1b 100%)',
        'gradient-hero': 'linear-gradient(170deg, #f4f9f4 0%, #eaf5ea 35%, #e2f0e0 100%)',
        'hero-pattern': 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%234caf50\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in-down': 'fadeInDown 0.5s ease-out forwards',
        'slide-in-right': 'slideInRight 0.5s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.5s ease-out forwards',
        'scale-in': 'scaleIn 0.4s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        'count-up': 'countUp 0.3s ease-out',
        'bounce-soft': 'bounceSoft 3s ease-in-out infinite',
        'droplet-bob': 'dropletBob 4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(24px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeInDown: { '0%': { opacity: '0', transform: 'translateY(-16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(24px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        slideInLeft: { '0%': { opacity: '0', transform: 'translateX(-24px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.7' } },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '30%': { transform: 'translateY(-4px) scale(1.03, 0.97)' },
          '50%': { transform: 'translateY(2px) scale(0.97, 1.03)' },
          '70%': { transform: 'translateY(-2px) scale(1.01, 0.99)' },
        },
        dropletBob: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      spacing: { '18': '4.5rem', '88': '22rem', '112': '28rem', '128': '32rem' },
      transitionDuration: { '400': '400ms' },
    },
  },
  plugins: [
    // L-bob-A (2026-04-28): shadcn UI 애니메이션 utility (data-state, animate-in 등).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('tailwindcss-animate'),
  ],
};

export default config;
