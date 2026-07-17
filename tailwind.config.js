/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: { acid: '#d8ff3e', ink: '#0d0d0f', panel: '#171719' },
    },
  },
  plugins: [],
}
