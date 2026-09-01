/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./sidepanel.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0F172A', // Slate 900
        foreground: '#F8FAFC', // Slate 50
        card: '#1E293B',       // Slate 800
        'card-foreground': '#F8FAFC',
        muted: '#272F42',
        'muted-foreground': '#94A3B8',
        border: '#334155',
        primary: '#3B82F6',     // Blue 500
        'primary-hover': '#2563EB',
        accent: '#22C55E',      // Green 500
        destructive: '#EF4444', // Red 500
        warning: '#F59E0B'      // Amber 500
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['IBM Plex Sans', 'Inter', 'sans-serif']
      }
    },
  },
  plugins: [],
}
