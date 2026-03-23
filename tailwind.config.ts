import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wishes: {
          primary: '#1a365d',
          secondary: '#2b6cb0',
          accent: '#e53e3e',
          gold: '#d69e2e',
          bg: '#f7fafc',
          text: '#2d3748',
        },
      },
    },
  },
  plugins: [],
};

export default config;
