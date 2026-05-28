// One-shot: mint Mock $Ronke + Mock Ronkeverse NFTs to a tester address on Saigon.
// Usage: node scripts/mint-for-tester.mjs <target_address>
import { createWalletClient, createPublicClient, http, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const target = process.argv[2];
if (!target || !target.startsWith("0x") || target.length !== 42) {
  console.error("Usage: node mint-for-tester.mjs 0x...");
  process.exit(1);
}

// Load deployer PK from contracts/.env
const envText = await readFile(resolve(__dirname, "../../contracts/.env"), "utf8");
const pkMatch = envText.match(/^PRIVATE_KEY=(0x[a-fA-F0-9]+)/m);
if (!pkMatch) throw new Error("PRIVATE_KEY not found in contracts/.env");
const pk = pkMatch[1];

const account = privateKeyToAccount(pk);
console.log("Deployer:", account.address);
console.log("Target:  ", target);

const saigon = {
  id: 202601,
  name: "Saigon",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: { default: { http: ["https://saigon-testnet.roninchain.com/rpc"] } },
};

const wallet = createWalletClient({ account, chain: saigon, transport: http() });
const publicClient = createPublicClient({ chain: saigon, transport: http() });

const MOCK_RONKE = "0x80D5a4a5E24B3ECee063704120e28d6a147045E3";
const MOCK_RONKEVERSE = "0x1a6577254F814328FEd82381E9Db1DAC8ddF5D6F";

const mockAbi = parseAbi(["function mint(address to, uint256 amount)"]);

// Helper: send tx, wait for receipt
async function sendAndWait(label, args) {
  const { request } = await publicClient.simulateContract(args).catch(() => ({ request: null }));
  const hash = request
    ? await wallet.writeContract(request)
    : await wallet.writeContract(args);
  console.log(`  ${label}: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  console.log(`    ✓ confirmed (block ${receipt.blockNumber})`);
}

// 1. Mint 100,000 Mock $Ronke
console.log("\nMinting 100,000 Mock $Ronke...");
await sendAndWait("ronke.mint", {
  address: MOCK_RONKE,
  abi: mockAbi,
  functionName: "mint",
  args: [target, parseEther("100000")],
});

// 2. Mint 5 Mock Ronkeverse NFTs (IDs 26..30)
console.log("\nMinting 5 Mock Ronkeverse NFTs (IDs 26..30)...");
for (const id of [26, 27, 28, 29, 30]) {
  await sendAndWait(`ronkeverse.mint(#${id})`, {
    address: MOCK_RONKEVERSE,
    abi: mockAbi,
    functionName: "mint",
    args: [target, BigInt(id)],
  });
}

console.log("\n✓ All done. Tester wallet ready to play.");
