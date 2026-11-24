// Lighthouse CI: mide la app servida desde la carpeta del proyecto, con
// emulación de celular (configuración por defecto de Lighthouse).
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node scripts/serve.mjs 4174',
      startServerReadyPattern: 'Moviliz en',
      url: ['http://localhost:4174/'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reportes' },
  },
};
