/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          page: 'var(--bg-page)',
          card: 'var(--bg-card)',
          inner: 'var(--bg-card-inner)',
          border: 'var(--border-base)',
          text: 'var(--text-base)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
          ring: 'var(--ring-color)'
        }
      }
    },
  },
  plugins: [],
}
