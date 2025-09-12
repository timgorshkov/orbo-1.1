/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
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
  plugins: [],
}
