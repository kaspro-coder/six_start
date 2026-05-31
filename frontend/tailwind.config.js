/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Light-red brand accent + a near-black ink for text/dark surfaces.
        // Greys come from Tailwind's built-in `neutral` scale.
        six: {
          DEFAULT: '#F2555A',
          dark: '#D83C45',
          light: '#FDECEC',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          light: '#333333',
        },
        // Warm-neutral paper for the app canvas — harmonises with the warm SIX
        // red better than a flat cool grey, without reading as "beige".
        canvas: '#F7F5F3',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
        // Hanken Grotesk for confident, institutional display headlines;
        // JetBrains Mono for reference-data values (ISINs, citations, IDs).
        display: ['Hanken Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // Deliberate two-step depth scale: `card` for quiet panels, `elevated`
      // for the one hero surface per view. Hierarchy from depth, not colour.
      boxShadow: {
        card: '0 1px 2px rgba(26,26,26,0.04), 0 1px 3px rgba(26,26,26,0.05)',
        elevated:
          '0 2px 4px -2px rgba(26,26,26,0.05), 0 12px 28px -8px rgba(26,26,26,0.12)',
        'six-glow': '0 6px 20px -6px rgba(242,85,90,0.40)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        reveal: {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.55' },
          '70%': { transform: 'scale(2.4)', opacity: '0' },
          '100%': { opacity: '0' },
        },
        'count-pop': {
          '0%': { transform: 'translateY(4px) scale(0.9)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.3s ease both',
        reveal: 'reveal 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.22,1,0.36,1) infinite',
        'count-pop': 'count-pop 0.35s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
}
