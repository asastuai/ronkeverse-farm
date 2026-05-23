import { defineChain } from "viem";

export const ronin = defineChain({
  id: 2020,
  name: "Ronin",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.roninchain.com/rpc"] },
  },
  blockExplorers: {
    default: { name: "Ronin Explorer", url: "https://app.roninchain.com" },
  },
});

export const saigon = defineChain({
  id: 2021,
  name: "Saigon Testnet",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://saigon-testnet.roninchain.com/rpc"] },
  },
  blockExplorers: {
    default: { name: "Saigon Explorer", url: "https://saigon-app.roninchain.com" },
  },
  testnet: true,
});

export const anvil = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://localhost:8545"] },
  },
  testnet: true,
});

const mode = process.env.NEXT_PUBLIC_CHAIN_MODE ?? "saigon";
export const activeChain =
  mode === "ronin" ? ronin : mode === "anvil" ? anvil : saigon;
