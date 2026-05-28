// Debug: simulate stakeNFTs from Juan's address to see why tx is being dropped.
import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem";

const saigon = {
  id: 202601,
  name: "Saigon",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: { default: { http: ["https://saigon-testnet.roninchain.com/rpc"] } },
};

const FARM_CORE = "0x8ceDcaCaAB6a7CEc4902C74a495d4C757Cd21aEA";
const JUAN = "0x52f98f1a7509e0941e1ce71a4e6da93c96b41d37";

const farmAbi = parseAbi([
  "function stakeNFTs(uint256[] tokenIds)",
]);

const client = createPublicClient({ chain: saigon, transport: http() });

console.log("Simulating stakeNFTs([26, 27, 28]) from Juan's wallet...");
try {
  const result = await client.simulateContract({
    address: FARM_CORE,
    abi: farmAbi,
    functionName: "stakeNFTs",
    args: [[26n, 27n, 28n]],
    account: JUAN,
  });
  console.log("✓ Simulation OK. gasEstimate:", result.request.gas);
} catch (err) {
  console.error("✗ Simulation FAILED:");
  console.error("  shortMessage:", err.shortMessage);
  console.error("  cause:", err.cause?.shortMessage ?? err.cause?.message);
  console.error("  details:", err.details);
}

// Also try with just 1 NFT
console.log("\nSimulating stakeNFTs([26]) only...");
try {
  const result = await client.simulateContract({
    address: FARM_CORE,
    abi: farmAbi,
    functionName: "stakeNFTs",
    args: [[26n]],
    account: JUAN,
  });
  console.log("✓ Simulation OK. gasEstimate:", result.request.gas);
} catch (err) {
  console.error("✗ Simulation FAILED:");
  console.error("  shortMessage:", err.shortMessage);
  console.error("  cause:", err.cause?.shortMessage ?? err.cause?.message);
}
