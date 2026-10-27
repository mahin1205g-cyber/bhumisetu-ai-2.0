/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        'bhumisetu-bg': '#FFFFFF',
        'bhumisetu-sub': '#F7FAF8',
        'bhumisetu-emerald': '#047857',
        'bhumisetu-deep': '#065F46',
        'bhumisetu-mint': '#D1FAE5',
        'bhumisetu-text': '#17212B',
        'bhumisetu-muted': '#64748B',
        'bhumisetu-border': '#E2E8F0',
        'bhumisetu-gold': '#F5B544',
        // Legacy compatibility
        'gov-green': '#047857',
        'gov-green-dark': '#065F46',
        'gov-gold': '#F5B544',
      }
    },
  },
  plugins: [],
}
