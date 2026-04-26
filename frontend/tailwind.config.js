/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '700' }],
        'headline': ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.015em', fontWeight: '600' }],
        'title': ['1rem', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'label': ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' }],
        'caption': ['0.6875rem', { lineHeight: '1.4', fontWeight: '400' }],
      },
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        surface: {
          primary: '#ffffff',
          secondary: '#fafafa',
          tertiary: '#f5f5f5',
          hover: '#f8f8f8',
          active: '#f0f0f0',
        },
        border: {
          DEFAULT: '#e8e8e8',
          subtle: '#f0f0f0',
          strong: '#d4d4d4',
        },
        fg: {
          DEFAULT: '#171717',
          secondary: '#737373',
          muted: '#a3a3a3',
          faint: '#d4d4d4',
        },
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(0,0,0,0.03)',
        'sm': '0 1px 3px rgba(0,0,0,0.04)',
        'md': '0 2px 8px rgba(0,0,0,0.05)',
        'lg': '0 4px 16px rgba(0,0,0,0.06)',
        'xl': '0 8px 32px rgba(0,0,0,0.08)',
        'ring': '0 0 0 2px rgba(99,102,241,0.15)',
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '8px',
        'lg': '10px',
        'xl': '12px',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-out': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
        },
        'spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.25s ease-out forwards',
        'fade-in': 'fade-in 0.15s ease-out forwards',
        'toast-in': 'toast-in 0.25s ease-out forwards',
        'toast-out': 'toast-out 0.15s ease-in forwards',
        'spin': 'spin 0.8s linear infinite',
      },
    },
  },
  plugins: [],
}
