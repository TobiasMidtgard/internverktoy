/** Statisk Tailwind-bygg for tasks.html (erstatter cdn.tailwindcss.com-kompilatoren).
 *  Regenerer med:  npx tailwindcss@3.4.17 -c tailwind.config.js -i tw-input.css -o tailwind.css --minify
 *  (kjør etter endringer i tasks.html som bruker NYE utility-klasser)               */
module.exports = {
  content: ['./tasks.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        thansen: {
          50: '#f0f6fc', 100: '#e1edf9', 400: '#5b9bd5', 500: '#004595',
          600: '#003573', 700: '#002552', yellow: '#ffcc00', red: '#e30613',
        },
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
    },
  },
};
