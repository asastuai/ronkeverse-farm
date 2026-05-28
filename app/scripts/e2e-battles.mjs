// E2E test del flow completo de RonkeBattles en Saigon.
// Juega deployer (player1) vs una wallet throwaway (player2), validando cada paso on-chain.
// Run: node --env-file=../contracts/.env scripts/e2e-battles.mjs
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  keccak256,
  encodeAbiParameters,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const saigon = {
  id: 202601,
  name: "Saigon",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: { default: { http: ["https://saigon-testnet.roninchain.com/rpc"] } },
};

const BATTLES = "0xd5480A57A5CF49A64c24b085C4F37bB062dE6586";
const NABABA = "0xeF78cC194cd2355e17684661A12F04e59376EDe3";
const TREASURY = "0x52F98F1a7509E0941e1Ce71a4e6dA93C96b41d37";

const abi = [
  { type: "function", name: "createMatch", stateMutability: "payable", inputs: [{ name: "token", type: "address" }, { name: "stake", type: "uint256" }, { name: "commit", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "joinMatch", stateMutability: "payable", inputs: [{ name: "matchId", type: "uint256" }, { name: "commit", type: "bytes32" }], outputs: [] },
  { type: "function", name: "reveal", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "moves", type: "uint8[5]" }, { name: "salt", type: "bytes32" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }], outputs: [] },
  { type: "function", name: "pending", stateMutability: "view", inputs: [{ name: "", type: "address" }, { name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getMatch", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "playerA", type: "address" }, { name: "playerB", type: "address" }, { name: "token", type: "address" }, { name: "stake", type: "uint256" }, { name: "status", type: "uint8" }, { name: "revealedA", type: "bool" }, { name: "revealedB", type: "bool" }, { name: "bothCommittedAt", type: "uint64" }] },
  { type: "event", name: "MatchCreated", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "playerA", type: "address", indexed: true }, { name: "token", type: "address", indexed: true }, { name: "stake", type: "uint256", indexed: false }] },
];
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }];

const NATIVE = "0x0000000000000000000000000000000000000000";
const STATUS = ["Open", "Joined", "Settled", "Cancelled"];

const pub = createPublicClient({ chain: saigon, transport: http() });

function randomSalt() {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function commitOf(player, moves, salt) {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint8[5]" }, { type: "bytes32" }], [player, moves, salt]));
}
async function send(wallet, params) {
  const gasPrice = await pub.getGasPrice();
  const hash = await wallet.writeContract({ ...params, type: "legacy", gasPrice });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return r;
}
const ok = (c, m) => console.log(`${c ? "  ✅" : "  ❌"} ${m}`);

async function main() {
  const pk1 = process.env.PRIVATE_KEY;
  if (!pk1) throw new Error("PRIVATE_KEY no seteada (usar --env-file=../contracts/.env)");
  const p1 = privateKeyToAccount(pk1.startsWith("0x") ? pk1 : `0x${pk1}`);
  const pk2 = generatePrivateKey();
  const p2 = privateKeyToAccount(pk2);

  const w1 = createWalletClient({ account: p1, chain: saigon, transport: http() });
  const w2 = createWalletClient({ account: p2, chain: saigon, transport: http() });

  console.log("Player1 (deployer):", p1.address);
  console.log("Player2 (throwaway):", p2.address);

  const STAKE = parseEther("0.1");

  // 1. fondear player2 con 0.3 RON (stake + gas)
  console.log("\n[1] Funding player2 with 0.3 RON…");
  {
    const gasPrice = await pub.getGasPrice();
    const hash = await w1.sendTransaction({ to: p2.address, value: parseEther("0.3"), type: "legacy", gasPrice });
    await pub.waitForTransactionReceipt({ hash });
    ok((await pub.getBalance({ address: p2.address })) >= parseEther("0.29"), "player2 funded");
  }

  // 2. player1 crea match (Banana x5)
  console.log("\n[2] Player1 creates match (stake 0.1 RON, Banana x5)…");
  const movesA = [0, 0, 0, 0, 0];
  const saltA = randomSalt();
  const rc = await send(w1, { address: BATTLES, abi, functionName: "createMatch", args: [NATIVE, STAKE, commitOf(p1.address, movesA, saltA)], value: STAKE });
  // matchId del evento
  let matchId;
  for (const log of rc.logs) {
    try {
      const dec = (await import("viem")).decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (dec.eventName === "MatchCreated") { matchId = dec.args.matchId; break; }
    } catch {}
  }
  ok(matchId !== undefined, `match created → #${matchId}`);

  // 3. player2 joinea (Monke x5 → pierde contra Banana)
  console.log("\n[3] Player2 joins (Monke x5 → should lose)…");
  const movesB = [1, 1, 1, 1, 1];
  const saltB = randomSalt();
  await send(w2, { address: BATTLES, abi, functionName: "joinMatch", args: [matchId, commitOf(p2.address, movesB, saltB)], value: STAKE });
  let m = await pub.readContract({ address: BATTLES, abi, functionName: "getMatch", args: [matchId] });
  ok(STATUS[m[4]] === "Joined", `status = ${STATUS[m[4]]}`);

  // 4. ambos revelan
  console.log("\n[4] Both reveal…");
  await send(w1, { address: BATTLES, abi, functionName: "reveal", args: [matchId, movesA, saltA] });
  await send(w2, { address: BATTLES, abi, functionName: "reveal", args: [matchId, movesB, saltB] });
  m = await pub.readContract({ address: BATTLES, abi, functionName: "getMatch", args: [matchId] });
  ok(STATUS[m[4]] === "Settled", `status = ${STATUS[m[4]]}`);

  // 5. verificar payouts
  console.log("\n[5] Verifying payouts…");
  const pot = STAKE * 2n;
  const rake = (pot * 600n) / 10000n;
  const pendP1 = await pub.readContract({ address: BATTLES, abi, functionName: "pending", args: [NATIVE, p1.address] });
  const pendP2 = await pub.readContract({ address: BATTLES, abi, functionName: "pending", args: [NATIVE, p2.address] });
  const pendTreasury = await pub.readContract({ address: BATTLES, abi, functionName: "pending", args: [NATIVE, TREASURY] });
  ok(pendP1 === pot - rake, `winner pending = ${formatEther(pendP1)} RON (expected ${formatEther(pot - rake)})`);
  ok(pendP2 === 0n, `loser pending = ${formatEther(pendP2)} RON (expected 0)`);
  ok(pendTreasury === rake, `treasury rake = ${formatEther(pendTreasury)} RON (expected ${formatEther(rake)})`);

  // 6. verificar NABABA reward (60/40)
  console.log("\n[6] Verifying NABABA reward (60/40)…");
  const nabP1 = await pub.readContract({ address: NABABA, abi: erc20, functionName: "balanceOf", args: [p1.address] });
  const nabP2 = await pub.readContract({ address: NABABA, abi: erc20, functionName: "balanceOf", args: [p2.address] });
  ok(nabP1 === parseEther("60"), `winner NABABA = ${formatEther(nabP1)} (expected 60)`);
  ok(nabP2 === parseEther("40"), `loser NABABA = ${formatEther(nabP2)} (expected 40)`);

  // 7. winner withdraws
  console.log("\n[7] Winner withdraws…");
  const balBefore = await pub.getBalance({ address: p1.address });
  await send(w1, { address: BATTLES, abi, functionName: "withdraw", args: [NATIVE] });
  const balAfter = await pub.getBalance({ address: p1.address });
  ok(balAfter > balBefore, `RON balance up by ~${formatEther(balAfter - balBefore)} (minus gas)`);
  const pendAfter = await pub.readContract({ address: BATTLES, abi, functionName: "pending", args: [NATIVE, p1.address] });
  ok(pendAfter === 0n, "pending cleared after withdraw");

  console.log(`\n🎉 E2E PASSED. Match #${matchId} played, settled, paid out, withdrawn on Saigon.`);
  console.log(`   Treasury (${TREASURY.slice(0, 8)}…) earned ${formatEther(rake)} RON in rake.`);
}

main().catch((e) => { console.error("\n❌ E2E FAILED:", e.shortMessage ?? e.message); process.exit(1); });
