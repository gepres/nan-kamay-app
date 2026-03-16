/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/presentation/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Design tokens del diseño Pencil (trek-kamay.pen)
        "bg-primary": "#0D1B12",
        "bg-card": "#1A2E1F",
        "bg-input": "#152219",
        "accent": "#22C55E",
        "accent-dark": "#16A34A",
        "text-primary": "#E8F5E9",
        "text-secondary": "#6B8F71",
        "border": "#2D6A4F",
        "success": "#22C55E",
        // Dificultad
        "easy": "#4ADE80",
        "moderate": "#F59E0B",
        "hard": "#EF4444",
      },
      fontFamily: {
        sans: ["Inter", "system-ui"],
      },
    },
  },
  plugins: [],
};
