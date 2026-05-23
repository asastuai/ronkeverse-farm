/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["wagmi", "viem"],
  },
  webpack: (config) => {
    // Opcionales de wagmi/walletconnect/metamask que no usamos en web
    config.externals = [
      ...(config.externals ?? []),
      "pino-pretty",
      "lokijs",
      "encoding",
    ];
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
