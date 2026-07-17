/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Segoe UI Variable Display', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        acid: {
          DEFAULT: '#d8ff3e',
          hover: '#e2ff6a',
          muted: 'rgba(216,255,62,0.06)',
        },
        ink: '#0a0a0a',
        panel: '#141414',
        stage: '#0f0f0f',
        surface: '#111111',
        control: '#222222',
      },
      borderRadius: {
        control: '0.625rem',
        panel: '0.75rem',
      },
      boxShadow: {
        card: '0 24px 80px rgba(0,0,0,.32)',
        tab: '0 4px 18px rgba(216,255,62,.12)',
      },
    },
  },
  plugins: [],
}
