/** @type {import('tailwindcss').Config} */
// PromptStudio design tokens.
// - slate is re-tuned to an ink-navy scale: every page uses slate for its surfaces and text.
// - brand is highlighter yellow: primary actions, focus rings and the [placeholder] highlights.
// - emerald (good / done), rose (weak / error) and amber (needs work) stay as status colours.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#F4F6FB',
          100: '#E8ECF4',
          200: '#D2D9E6',
          300: '#AEB8CC',
          400: '#8D99B1',
          500: '#6B7891',
          600: '#4E5A71',
          700: '#364156',
          800: '#232D41',
          900: '#161E30',
          950: '#0C1322',
        },
        brand: {
          50: '#FFFBE8',
          100: '#FFF4C2',
          200: '#FFEA8F',
          300: '#FFDF5C',
          400: '#F7D038',
          500: '#E3B812',
          600: '#BF9900',
          700: '#957700',
          800: '#6B5600',
          900: '#453700',
          950: '#2A2200',
        },
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mark: ['Kalam', '"Schibsted Grotesk"', 'cursive'],
      },
    },
  },
  plugins: [],
};
