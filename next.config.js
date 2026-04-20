/** @type {import('next').NextConfig} */
const nextConfig = {
  // OpenLayers et extensions : transpilation explicite nécessaire
  transpilePackages: [
    'ol',
    'geopf-extensions-openlayers',
    'geoportal-access-lib',
  ],

  // Turbopack (activé par défaut Next 15+ / Vercel)
  // resolveAlias remplace webpack resolve.fallback pour les modules Node
  turbopack: {
    resolveAlias: {
      fs: { browser: false },
      path: { browser: false },
      crypto: { browser: false },
    },
  },

  // webpack conservé uniquement pour `next build --no-turbopack` (local)
  // Vercel ignore ce bloc si Turbopack est actif
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
