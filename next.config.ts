import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: '/rsus', // <-- ESTA LINHA CONSERTA A RENDERIZAÇÃO NA SUBPASTA
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Agora o Next sabe que a API dele responde na subpasta de API
        destination: 'https://crztech.com.br/api-rsus/:path*', 
      },
    ];
  },
};

export default nextConfig;