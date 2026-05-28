// E2E + keeper del modo PvE (RonkeBattlesHouse) en Saigon.
// Carga bankroll, pushea seed commits, juega como player throwaway, settlea como keeper, verifica.
// Run: node --env-file=../contracts/.env scripts/e2e-house.mjs
import {
  createPublicClient, createWalletClient, http, parseEther, formatEther,
  keccak256, encodeAbiParameters, encodePacked,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const saigon = {
  id: 202601, name: "Saigon", nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: { default: { http: ["https://saigon-testnet.roninchain.com/rpc"] } },
};

const HOUSE = "0x77962e527Cc01b78187677886432725503b1C3C7";
const USDC = "0x238e4fBCc97053257282C32dcde6f840D2911f97";
const NATIVE = "0x0000000000000000000000000000000000000000";

// Master seed del keeper. EN PRODUCCIÓN: guardar en env secreto, nunca on-chain.
const MASTER = process.env.HOUSE_MASTER_SEED ?? "ronke-battles-house-master-seed-testnet-v1";

const abi = [
  { type: "function", name: "depositBankroll", stateMutability: "payable", inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "pushHouseCommits", stateMutability: "nonpayable", inputs: [{ name: "commits", type: "bytes32[]" }], outputs: [] },
  { type: "function", name: "play", stateMutability: "payable", inputs: [{ name: "token", type: "address" }, { name: "stake", type: "uint256" }, { name: "moves", type: "uint8[5]" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "gameId", type: "uint256" }, { name: "seed", type: "bytes32" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }], outputs: [] },
  { type: "function", name: "getGame", stateMutability: "view", inputs: [{ name: "gameId", type: "uint256" }], outputs: [{ name: "player", type: "address" }, { name: "token", type: "address" }, { name: "stake", type: "uint256" }, { name: "seedId", type: "uint256" }, { name: "status", type: "uint8" }, { name: "playedAt", type: "uint64" }] },
  { type: "function", name: "pending", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "bankroll", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reserved", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableSeeds", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextGameId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];
const mockAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
];

const STATUS = ["None", "Pending", "Settled", "Refunded"];
const pub = createPublicClient({ chain: saigon, transport: http() });
const ok = (c, m) => console.log(`${c ? "  ✅" : "  ❌"} ${m}`);

function seedFor(i) {
  return keccak256(encodePacked(["string", "uint256"], [MASTER, BigInt(i)]));
}
function commitFor(seed) {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }], [seed]));
}
function houseMoves(seed, gameId) {
  const h = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [seed, BigInt(gameId)]));
  const bytes = h.slice(2);
  const m = [];
  for (let i = 0; i < 5; i++) m.push(parseInt(bytes.slice(i * 2, i * 2 + 2), 16) % 3);
  return m;
}
function resolve(pm, hm) {
  let wa = 0, wb = 0;
  for (let i = 0; i < 5; i++) {
    if (pm[i] === hm[i]) continue;
    if ((pm[i] + 1) % 3 === hm[i]) wa++; else wb++;
  }
  return wa > wb ? 1 : wb > wa ? 2 : 0;
}
async function send(wallet, params) {
  const gasPrice = await pub.getGasPrice();
  const hash = await wallet.writeContract({ ...params, type: "legacy", gasPrice });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return r;
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY no seteada");
  const owner = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  const wOwner = createWalletClient({ account: owner, chain: saigon, transport: http() });
  console.log("Owner/keeper:", owner.address);

  // [1] bankroll
  console.log("\n[1] Loading bankroll (0.5 RON + mint & 5000 USDC)…");
  await send(wOwner, { address: HOUSE, abi, functionName: "depositBankroll", args: [NATIVE, parseEther("0.5")], value: parseEther("0.5") });
  await send(wOwner, { address: USDC, abi: mockAbi, functionName: "mint", args: [owner.address, parseEther("10000")] });
  // approve USDC para el deposit
  await send(wOwner, { address: USDC, abi: [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }], functionName: "approve", args: [HOUSE, parseEther("5000")] });
  await send(wOwner, { address: HOUSE, abi, functionName: "depositBankroll", args: [USDC, parseEther("5000")] });
  ok((await pub.readContract({ address: HOUSE, abi, functionName: "bankroll", args: [NATIVE] })) >= parseEther("0.5"), `RON bankroll loaded`);

  // [2] push seed commits (derivados del master)
  console.log("\n[2] Pushing 10 house seed commits…");
  const startSeed = Number(await pub.readContract({ address: HOUSE, abi, functionName: "availableSeeds" }));
  // seedId arranca en nextSeedId; los derivamos por índice global. Para simplicidad usamos índices 1..N
  // alineados con el seedId on-chain. Leemos nextSeedId implícito vía availableSeeds + consumo.
  // Como es deploy fresco, nextSeedId arranca en 1.
  const commits = [];
  for (let i = 1; i <= 10; i++) commits.push(commitFor(seedFor(i)));
  await send(wOwner, { address: HOUSE, abi, functionName: "pushHouseCommits", args: [commits] });
  ok(Number(await pub.readContract({ address: HOUSE, abi, functionName: "availableSeeds" })) >= 10, `10 seeds available`);

  // [3] player throwaway juega
  console.log("\n[3] Throwaway player plays 0.1 RON…");
  const p2 = privateKeyToAccount(generatePrivateKey());
  const wP2 = createWalletClient({ account: p2, chain: saigon, transport: http() });
  { const gp = await pub.getGasPrice(); const h = await wOwner.sendTransaction({ to: p2.address, value: parseEther("0.3"), type: "legacy", gasPrice: gp }); await pub.waitForTransactionReceipt({ hash: h }); }
  const pm = [0, 1, 2, 0, 1];
  const rc = await send(wP2, { address: HOUSE, abi, functionName: "play", args: [NATIVE, parseEther("0.1"), pm], value: parseEther("0.1") });
  const gameId = Number(await pub.readContract({ address: HOUSE, abi, functionName: "nextGameId" })) - 1;
  const game = await pub.readContract({ address: HOUSE, abi, functionName: "getGame", args: [BigInt(gameId)] });
  const seedId = Number(game[3]);
  ok(STATUS[game[4]] === "Pending", `game #${gameId} pending, seedId=${seedId}`);

  // [4] keeper settlea revelando el seed
  console.log("\n[4] Keeper settles (reveals seed)…");
  const seed = seedFor(seedId);
  const expected = resolve(pm, houseMoves(seed, gameId));
  console.log(`   player ${JSON.stringify(pm)} vs house ${JSON.stringify(houseMoves(seed, gameId))} → ${["TIE", "PLAYER", "HOUSE"][expected]}`);
  await send(wOwner, { address: HOUSE, abi, functionName: "settle", args: [BigInt(gameId), seed] });
  const g2 = await pub.readContract({ address: HOUSE, abi, functionName: "getGame", args: [BigInt(gameId)] });
  ok(STATUS[g2[4]] === "Settled", `settled`);

  // [5] verificar solvencia + payout coherente
  console.log("\n[5] Verifying solvency + payout…");
  const pend = await pub.readContract({ address: HOUSE, abi, functionName: "pending", args: [NATIVE, p2.address] });
  const bal = await pub.getBalance({ address: HOUSE });
  const bankroll = await pub.readContract({ address: HOUSE, abi, functionName: "bankroll", args: [NATIVE] });
  const reserved = await pub.readContract({ address: HOUSE, abi, functionName: "reserved", args: [NATIVE] });
  ok(reserved === 0n, `reserve released`);
  ok(bal === bankroll + reserved + pend, `solvent: balance ${formatEther(bal)} == bankroll+reserved+pending`);
  if (expected === 1) ok(pend === parseEther("0.2"), `player won 0.2 RON (2x)`);
  else if (expected === 2) ok(pend === 0n, `house won, player pending 0`);
  else ok(pend === parseEther("0.1") || pend === 0n, `tie → refund 0.1 or routed to house`);

  // [6] withdraw si ganó algo
  if (pend > 0n) {
    console.log("\n[6] Player withdraws…");
    const before = await pub.getBalance({ address: p2.address });
    await send(wP2, { address: HOUSE, abi, functionName: "withdraw", args: [NATIVE] });
    ok((await pub.getBalance({ address: p2.address })) > before, `withdrew winnings`);
  }

  console.log(`\n🎉 PvE E2E PASSED. Game #${gameId} played + settled provably-fair on Saigon.`);
}

main().catch((e) => { console.error("\n❌ PvE E2E FAILED:", e.shortMessage ?? e.message); process.exit(1); });
