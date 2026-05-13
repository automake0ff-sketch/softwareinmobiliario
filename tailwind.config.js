/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { primary: '#0A0A0F', secondary: '#13131A', tertiary: '#1A1A24', card: '#13131A', hover: '#1C1C28', input: '#1A1A24' },
        border: { primary: '#1E1E2E', secondary: '#2A2A3E', accent: '#38385A' },
        text: { primary: '#F1F5F9', secondary: '#94A3B8', tertiary: '#64748B' },
        accent: { primary: '#6366F1', secondary: '#8B5CF6', light: '#818CF8' },
        green: '#10B981',
        amber: '#F59E0B',
        red: '#EF4444',
        slate: '#64748B',
        // Aliases for compatibility and semantic use
        surface: '#13131A',
        surface2: '#1A1A24',
        ink: '#F1F5F9',
        muted: '#94A3B8',
        muted2: '#64748B',
        ok: '#10B981',
        warn: '#F59E0B',
        err: '#EF4444',
        gold: {
          300: '#FDE047',
          400: '#FACC15',
        }
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Consolas', 'monospace'],
        syne: ['Syne', 'sans-serif'],
        dm: ['DM Sans', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '8px', lg: '12px', xl: '16px' },
      boxShadow: {
        card: '0 0 0 1px rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.3)',
        elevated: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.4)',
        glow: '0 0 20px rgba(99,102,241,0.15), 0 0 0 1px rgba(99,102,241,0.2)',
      },
      animation: {
        'fade-up': 'fadeUp .25s ease',
        'slide-in': 'slideIn .2s ease',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateX(10px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        pulseSoft: { '0%,100%': { opacity: '.6' }, '50%': { opacity: '1' } },
      },
    }
  },
  plugins: []
}

