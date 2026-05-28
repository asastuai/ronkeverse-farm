// Pre-carga seed commits en RonkeBattlesHouse (como owner). Corre cuando quedan pocos seeds.
// Run: node --env-file=../contracts/.env scripts/house-topup.mjs [count]
import { createPublicClient, createWalletClient, http, keccak256, encodeAbiParameters, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const saigon = { id: 202601, name: "Saigon", nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 }, rpcUrls: { default: { http: ["https://saigon-testnet.roninchain.com/rpc"] } } };
const HOUSE = "0x77962e527Cc01b78187677886432725503b1C3C7";
const MASTER = process.env.HOUSE_MASTER_SEED ?? "ronke-battles-house-master-seed-testnet-v1";

const abi = [
  { type: "function", name: "pushHouseCommits", stateMutability: "nonpayable", inputs: [{ name: "commits", type: "bytes32[]" }], outputs: [] },
  { type: "function", name: "nextSeedId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableSeeds", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const seedFor = (i) => keccak256(encodePacked(["string", "uint256"], [MASTER, BigInt(i)]));
const commitFor = (seed) => keccak256(encodeAbiParameters([{ type: "bytes32" }], [seed]));

const pub = createPublicClient({ chain: saigon, transport: http() });

async function main() {
  const total = Number(process.argv[2] ?? 200);
  const owner = privateKeyToAccount((process.env.PRIVATE_KEY.startsWith("0x") ? "" : "0x") + process.env.PRIVATE_KEY);
  const w = createWalletClient({ account: owner, chain: saigon, transport: http() });

  const startId = Number(await pub.readContract({ address: HOUSE, abi, functionName: "nextSeedId" }));
  console.log(`nextSeedId=${startId}, available=${await pub.readContract({ address: HOUSE, abi, functionName: "availableSeeds" })}`);
  console.log(`Pushing ${total} commits starting at seedId ${startId}…`);

  const BATCH = 100;
  for (let off = 0; off < total; off += BATCH) {
    const n = Math.min(BATCH, total - off);
    const commits = [];
    for (let k = 0; k < n; k++) commits.push(commitFor(seedFor(startId + off + k)));
    const gasPrice = await pub.getGasPrice();
    const hash = await w.writeContract({ address: HOUSE, abi, functionName: "pushHouseCommits", args: [commits], type: "legacy", gasPrice });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  pushed batch ${off}-${off + n - 1} (${hash.slice(0, 10)}…)`);
  }
  console.log(`✅ done. available now: ${await pub.readContract({ address: HOUSE, abi, functionName: "availableSeeds" })}`);
}
main().catch((e) => { console.error("❌", e.shortMessage ?? e.message); process.exit(1); });
