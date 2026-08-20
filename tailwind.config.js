/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        road: {
          dark: '#1f242d',
          line: '#facc15',
          white: '#f8fafc',
        }
      }
    },
  },
  plugins: [],
}
