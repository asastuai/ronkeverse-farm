// Prueba el keeper en PRODUCCIÓN: juega una partida y llama al endpoint /api/keeper para settlear.
// Run: node --env-file=../contracts/.env scripts/e2e-keeper.mjs
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const saigon = { id: 202601, name: "Saigon", nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 }, rpcUrls: { default: { http: ["https://saigon-testnet.roninchain.com/rpc"] } } };
const HOUSE = "0x77962e527Cc01b78187677886432725503b1C3C7";
const NATIVE = "0x0000000000000000000000000000000000000000";
const APP = process.env.APP_URL ?? "https://app-delta-hazel-18.vercel.app";

const abi = [
  { type: "function", name: "play", stateMutability: "payable", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint8[5]" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getGame", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint8" }, { type: "uint64" }] },
  { type: "function", name: "nextGameId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pending", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
];
const STATUS = ["None", "Pending", "Settled", "Refunded"];
const pub = createPublicClient({ chain: saigon, transport: http() });
const ok = (c, m) => console.log(`${c ? "  ✅" : "  ❌"} ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const owner = privateKeyToAccount((process.env.PRIVATE_KEY.startsWith("0x") ? "" : "0x") + process.env.PRIVATE_KEY);
  const wOwner = createWalletClient({ account: owner, chain: saigon, transport: http() });
  const p = privateKeyToAccount(generatePrivateKey());
  const wP = createWalletClient({ account: p, chain: saigon, transport: http() });

  console.log("Funding throwaway player…");
  { const gp = await pub.getGasPrice(); const h = await wOwner.sendTransaction({ to: p.address, value: parseEther("0.2"), type: "legacy", gasPrice: gp }); await pub.waitForTransactionReceipt({ hash: h }); }

  console.log("Player plays 0.05 RON vs House…");
  { const gp = await pub.getGasPrice(); const h = await wP.writeContract({ address: HOUSE, abi, functionName: "play", args: [NATIVE, parseEther("0.05"), [0, 1, 2, 0, 1]], value: parseEther("0.05"), type: "legacy", gasPrice: gp }); await pub.waitForTransactionReceipt({ hash: h }); }
  const gameId = Number(await pub.readContract({ address: HOUSE, abi, functionName: "nextGameId" })) - 1;
  let g = await pub.readContract({ address: HOUSE, abi, functionName: "getGame", args: [BigInt(gameId)] });
  ok(STATUS[g[4]] === "Pending", `game #${gameId} is Pending`);

  console.log(`Calling LIVE keeper: ${APP}/api/keeper?gameId=${gameId} …`);
  const res = await fetch(`${APP}/api/keeper?gameId=${gameId}`);
  const json = await res.json().catch(() => ({}));
  console.log("  keeper response:", JSON.stringify(json));

  // esperar a que la tx de settle del keeper se mine
  for (let i = 0; i < 15; i++) {
    g = await pub.readContract({ address: HOUSE, abi, functionName: "getGame", args: [BigInt(gameId)] });
    if (STATUS[g[4]] === "Settled") break;
    await sleep(2000);
  }
  ok(STATUS[g[4]] === "Settled", `game #${gameId} settled by LIVE keeper → ${STATUS[g[4]]}`);
  const pend = await pub.readContract({ address: HOUSE, abi, functionName: "pending", args: [NATIVE, p.address] });
  console.log(`  player pending: ${formatEther(pend)} RON`);
  console.log(STATUS[g[4]] === "Settled" ? "\n🎉 LIVE KEEPER WORKS — PvE settles autonomously via the deployed endpoint." : "\n⚠️ not settled yet (cron backstop will catch it, or check keeper logs)");
}
main().catch((e) => { console.error("❌", e.shortMessage ?? e.message); process.exit(1); });
