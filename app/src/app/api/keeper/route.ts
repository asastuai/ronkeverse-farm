import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodeAbiParameters,
  encodePacked,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { contracts } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Keeper del modo PvE (vs House). Revela los seeds committeados y settlea las partidas Pending.
 *
 * - GET /api/keeper?gameId=N  → settlea esa partida si está Pending (público, idempotente,
 *   solo gasta gas en partidas legítimamente pendientes). Lo pinguea el frontend tras jugar.
 * - GET /api/keeper           → escanea las últimas N partidas y settlea las Pending (backstop).
 *   Protegido con CRON_SECRET (Authorization: Bearer ...). Lo llama el cron de Vercel.
 *
 * Secretos (Vercel env, server-side, nunca al cliente):
 *   KEEPER_PRIVATE_KEY  — wallet que firma los settle (paga gas)
 *   HOUSE_MASTER_SEED   — del que se derivan los seeds. CRÍTICO: si se filtra, se puede predecir la casa.
 *   CRON_SECRET         — protege el escaneo masivo.
 */

const saigon = {
  id: 202601,
  name: "Saigon",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: { default: { http: ["https://saigon-testnet.roninchain.com/rpc"] } },
} as const;

const SCAN = 60; // últimas N partidas a revisar en el backstop

const abi = [
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "gameId", type: "uint256" }, { name: "seed", type: "bytes32" }], outputs: [] },
  { type: "function", name: "getGame", stateMutability: "view", inputs: [{ name: "gameId", type: "uint256" }], outputs: [{ name: "player", type: "address" }, { name: "token", type: "address" }, { name: "stake", type: "uint256" }, { name: "seedId", type: "uint256" }, { name: "status", type: "uint8" }, { name: "playedAt", type: "uint64" }] },
  { type: "function", name: "nextGameId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const seedFor = (master: string, i: bigint): Hex =>
  keccak256(encodePacked(["string", "uint256"], [master, i]));

function clients() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  const master = process.env.HOUSE_MASTER_SEED;
  if (!pk || !master) throw new Error("keeper not configured");
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  const pub = createPublicClient({ chain: saigon, transport: http() });
  const wallet = createWalletClient({ account, chain: saigon, transport: http() });
  return { pub, wallet, master };
}

async function settleGame(
  pub: ReturnType<typeof createPublicClient>,
  wallet: ReturnType<typeof createWalletClient>,
  master: string,
  gameId: bigint,
): Promise<"settled" | "skipped"> {
  const g = (await pub.readContract({
    address: contracts.ronkeBattlesHouse,
    abi,
    functionName: "getGame",
    args: [gameId],
  })) as readonly [string, string, bigint, bigint, number, bigint];
  if (g[4] !== 1) return "skipped"; // no Pending
  const seed = seedFor(master, g[3]); // seedId
  const gasPrice = await pub.getGasPrice();
  const hash = await wallet.writeContract({
    address: contracts.ronkeBattlesHouse,
    abi,
    functionName: "settle",
    args: [gameId, seed],
    type: "legacy",
    gasPrice,
    chain: saigon,
    account: wallet.account!,
  });
  await pub.waitForTransactionReceipt({ hash });
  return "settled";
}

export async function GET(req: NextRequest) {
  let pub, wallet, master;
  try {
    ({ pub, wallet, master } = clients());
  } catch {
    return NextResponse.json({ error: "keeper not configured" }, { status: 503 });
  }

  const gameIdParam = req.nextUrl.searchParams.get("gameId");

  // Settle puntual (lo pinguea el frontend). Idempotente: solo toca partidas Pending.
  if (gameIdParam) {
    const id = BigInt(gameIdParam);
    try {
      const r = await settleGame(pub, wallet, master, id);
      return NextResponse.json({ gameId: gameIdParam, result: r });
    } catch (e) {
      return NextResponse.json({ gameId: gameIdParam, error: errMsg(e) }, { status: 500 });
    }
  }

  // Escaneo masivo (backstop, cron). Protegido.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const next = Number(await pub.readContract({ address: contracts.ronkeBattlesHouse, abi, functionName: "nextGameId" }));
    const from = Math.max(1, next - SCAN);
    const settled: number[] = [];
    for (let id = from; id < next; id++) {
      const r = await settleGame(pub, wallet, master, BigInt(id));
      if (r === "settled") settled.push(id);
    }
    return NextResponse.json({ scanned: next - from, settled });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

function errMsg(e: unknown): string {
  return (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "error";
}
