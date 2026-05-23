import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        ronke: {
          blue: "#3aa3ff",
          deep: "#0b1d3a",
          deeper: "#06122a",
          banana: "#ffd83a",
          bananaSoft: "#fff08a",
          jungle: "#1b6e3a",
          dirt: "#3d2618",
        },
      },
      boxShadow: {
        glow: "0 0 24px rgba(58, 163, 255, 0.4)",
        banana: "0 0 24px rgba(255, 216, 58, 0.45)",
        inner: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
      },
      animation: {
        "fade-up": "fadeUp 0.6s cubic-bezier(0.21, 1, 0.32, 1) both",
        "fade-in": "fadeIn 0.5s ease both",
        "pulse-glow": "pulseGlow 2.4s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 rgba(255, 216, 58, 0.4)" },
          "50%": { boxShadow: "0 0 28px rgba(255, 216, 58, 0.7)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
