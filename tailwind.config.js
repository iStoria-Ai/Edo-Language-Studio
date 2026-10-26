/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FDFBF7',
          100: '#FAF7F0',
          200: '#F3EDE0',
          300: '#E6DEC8',
        },
        edo: {
          green: '#157A4C',
          greenDark: '#0E5836',
          greenLight: '#E6F4ED',
          blue: '#1D6CE0',
          blueDark: '#1552B0',
          blueLight: '#E8F1FD',
          yellow: '#F4C330',
          yellowDark: '#C99B10',
          yellowLight: '#FEF8E6',
          yellowText: '#261C00',
          purple: '#6E4BC3',
          purpleDark: '#52349B',
          purpleLight: '#F1ECFA',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      }
    },
  },
  plugins: [],
}
