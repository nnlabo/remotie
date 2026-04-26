import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f12",
        panel: "#141a1f",
        line: "#263039",
        live: "#ff3b30",
        ready: "#20c997"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
