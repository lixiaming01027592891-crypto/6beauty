/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Time Beauty 配色系統
        'rose': {
          DEFAULT: '#B88072',
          light: '#D4A89A',
          dark: '#9E6B5E',
          deep: '#7A5348',
        },
        'cream': {
          DEFAULT: '#FAF6F3',
          dark: '#F5E6E0',
          deeper: '#E8D5CC',
        },
        'brown': {
          DEFAULT: '#4A3530',
          light: '#6B534D',
          muted: '#8C7B75',
        },
        'gold': '#C5A57E',
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', '"PingFang TC"', 'sans-serif'],
        serif: ['"Noto Serif TC"', '"Songti SC"', 'serif'],
      },
      letterSpacing: {
        'ultra-wide': '0.1em',
      },
      animation: {
        'fade-in': 'fadeIn 1s ease-out forwards',
        'slide-up': 'slideUp 0.8s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
