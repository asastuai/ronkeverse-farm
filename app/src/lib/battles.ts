import { keccak256, encodeAbiParameters, type Address, type Hex } from "viem";

// ───────────────────────── Cartas ──
// Banana(0) > Monke(1) > Tree(2) > Banana(0)
export const CARDS = [
  { id: 0, name: "Banana", emoji: "🍌", beats: 1 },
  { id: 1, name: "Monke", emoji: "🐒", beats: 2 },
  { id: 2, name: "Tree", emoji: "🌴", beats: 0 },
] as const;

export const ROUNDS = 5;

/// a vence a b si (a+1)%3 == b
export function roundWinner(a: number, b: number): 0 | 1 | 2 {
  if (a === b) return 0; // empate
  return (a + 1) % 3 === b ? 1 : 2;
}

/// Resuelve best-of-5: devuelve 1 (A gana), 2 (B gana), 0 (empate)
export function resolveMatch(movesA: number[], movesB: number[]): 0 | 1 | 2 {
  let wa = 0;
  let wb = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const r = roundWinner(movesA[i], movesB[i]);
    if (r === 1) wa++;
    else if (r === 2) wb++;
  }
  if (wa > wb) return 1;
  if (wb > wa) return 2;
  return 0;
}

// ───────────────────────── Commit-reveal ──

/// Salt aleatorio de 32 bytes
export function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex;
}

/// commit = keccak256(abi.encode(player, moves, salt)) — debe matchear el contrato exacto
export function computeCommit(player: Address, moves: number[], salt: Hex): Hex {
  const encoded = encodeAbiParameters(
    [{ type: "address" }, { type: "uint8[5]" }, { type: "bytes32" }],
    [player, moves.map((m) => m) as [number, number, number, number, number], salt],
  );
  return keccak256(encoded);
}

// ───────────────────────── Persistencia (localStorage) ──
// Guardamos {moves, salt} por matchId para poder revelar más tarde.
// Para join el matchId se conoce de entrada; para create se obtiene del evento
// MatchCreated en el receipt de la tx.

type RevealData = { moves: number[]; salt: Hex };

const key = (matchId: bigint | number | string) => `rb:match:${matchId.toString()}`;

export function saveReveal(matchId: bigint | number | string, moves: number[], salt: Hex): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(matchId), JSON.stringify({ moves, salt }));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function loadReveal(matchId: bigint | number | string): RevealData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(matchId));
    return raw ? (JSON.parse(raw) as RevealData) : null;
  } catch {
    return null;
  }
}

export function clearReveal(matchId: bigint | number | string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(matchId));
  } catch {
    /* ignore */
  }
}

// ───────────────────────── Status ──
export const STATUS = ["Open", "Joined", "Settled", "Cancelled"] as const;
export type MatchStatus = (typeof STATUS)[number];
