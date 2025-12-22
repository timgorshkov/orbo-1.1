/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)'],
      },
      borderRadius: {
        '2xl': '1.5rem',
      },
      backgroundColor: {
        'white/70': 'rgba(255, 255, 255, 0.7)',
        'white/60': 'rgba(255, 255, 255, 0.6)',
        'black/5': 'rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
  // Убедитесь, что Tailwind может справиться с динамическими классами
  safelist: [
    'bg-white',
    'text-black',
    'hover:bg-black/5',
    'border-black/10',
  ],
}
