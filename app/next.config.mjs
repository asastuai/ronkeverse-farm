/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Public env hardcoded at build time. These point to the Saigon testnet deploy.
  // To switch to demo mode locally, override via .env.local.
  env: {
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE || "false",
    NEXT_PUBLIC_CHAIN_MODE: process.env.NEXT_PUBLIC_CHAIN_MODE || "saigon",
    NEXT_PUBLIC_RONKEVERSE_NFT:
      process.env.NEXT_PUBLIC_RONKEVERSE_NFT ||
      "0x1a6577254F814328FEd82381E9Db1DAC8ddF5D6F",
    NEXT_PUBLIC_RONKE_TOKEN:
      process.env.NEXT_PUBLIC_RONKE_TOKEN ||
      "0x80D5a4a5E24B3ECee063704120e28d6a147045E3",
    NEXT_PUBLIC_NABABA_TOKEN:
      process.env.NEXT_PUBLIC_NABABA_TOKEN ||
      "0xeF78cC194cd2355e17684661A12F04e59376EDe3",
    NEXT_PUBLIC_FARM_CORE:
      process.env.NEXT_PUBLIC_FARM_CORE ||
      "0x8ceDcaCaAB6a7CEc4902C74a495d4C757Cd21aEA",
  },
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
