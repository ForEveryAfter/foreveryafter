import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F7F5F0",
        primary: {
          50: "#F2F4F2",
          100: "#E6E9E6",
          200: "#D1D8D2",
          300: "#B8C2B8",
          400: "#8E9E8E",
          500: "#4A5E52", // Default Sage
          600: "#3F5045",
          700: "#344239",
          800: "#29342D",
          900: "#1F2722",
          DEFAULT: "#4A5E52",
          hover: "#607A6A",
        },
        sage: {
          light: "#E8EDEA",
          medium: "#A7B6AD",
          dark: "#4A5E52",
        },
        terracotta: {
          DEFAULT: "#D15339",
          hover: "#B9452E",
        },
        navy: "#1A2B3D",
        gold: "#C9954C",
        success: {
          DEFAULT: "#EEFOE8",
          text: "#3D5247",
          badge: "#E8EDEA",
        },
      },
      fontFamily: {
        playfair: ["var(--font-playfair)"],
        inter: ["var(--font-inter)"],
      },
    },
  },
  plugins: [],
};
export default config;
