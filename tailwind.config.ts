import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcd8ff',
          300: '#8ebfff',
          400: '#599bff',
          500: '#3478ff',
          600: '#1f58ef',
          700: '#1944d1',
          800: '#1a3aa8',
          900: '#1b3585',
        },
      },
    },
  },
  plugins: [],
};

export default config;
