import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '_site/', 'data/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Lo que va dentro de page.evaluate() corre en el navegador.
    files: ['tests/e2e/**/*.mjs', 'scripts/screenshot.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
];
