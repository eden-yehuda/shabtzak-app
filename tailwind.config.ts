import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'sans-serif'],
      },
      colors: {
        navy: { DEFAULT: '#1e3a5f', light: '#2a4f80' },
      },
    },
  },
  plugins: [],
}

export default config
