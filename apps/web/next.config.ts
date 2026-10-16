import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared workspace package is authored in TypeScript with `.js` ESM import
  // specifiers. Transpile it and alias `.js` → `.ts` so webpack resolves it.
  transpilePackages: ["@workpay/shared"],
  experimental: {
    typedRoutes: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
