import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
      },
      boxShadow: {
        '3d':    '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        '3d-md': '0 2px 4px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
        '3d-lg': '0 4px 8px rgba(0,0,0,0.05), 0 12px 32px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)',
        'glow-sm': '0 0 0 2px rgba(14,165,233,0.15), 0 0 12px rgba(14,165,233,0.12)',
        'glow':    '0 0 0 3px rgba(14,165,233,0.22), 0 0 20px rgba(14,165,233,0.16)',
        'glow-lg': '0 0 0 4px rgba(14,165,233,0.28), 0 0 32px rgba(14,165,233,0.20), 0 0 64px rgba(14,165,233,0.08)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(14,165,233,0.2)" },
          "50%":      { boxShadow: "0 0 20px rgba(14,165,233,0.4)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s ease-out",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
