// Demo store en memoria + localStorage. Mock del comportamiento de FarmCore (modelo POOL FLAT).
// Se usa cuando NEXT_PUBLIC_DEMO_MODE=true.
//
// MODELO:
// - Pool global emite POOL_EMISSION_PER_SEC NABABA/s
// - Se divide entre TODOS los workers activos globalmente (con stamina viva)
// - Tu output = (tus workers activos / total workers activos del sistema) × pool × (1 + boosts)
// - Boosts: NFT (4% c/u, cap 10 NFTs = 40%), Token (configurable), Restake (+20%)
// - Workers necesitan feed cada 6h, cuestan 500 NABABA por worker por cycle

export type Plantation = {
  id: number;
  tierId: number;
  createdAt: number;       // unix s
  lastSettleAt: number;    // unix s
  workers: number;
  staminaUntil: number;    // unix s
  accruedNababa: number;
  restakeMode: boolean;
};

export type DemoState = {
  ronkeBalance: number;
  nababaBalance: number;
  nftBalance: number;
  ownedNftIds: number[];
  ronkeStaked: number;
  stakedNftIds: number[];
  plantations: Plantation[];
  nextPlantId: number;
  /** Workers que "otros farmers" tienen activos en el pool. Solo demo, para simular competencia. */
  otherWorkersActive: number;
};

export const TIER_NAMES = ["Sapling", "Tree", "Forest", "Golden"] as const;

export const TIERS = [
  { name: "Sapling", ronkeCost: 50,   maxWorkers: 3,  requiredNFTs: 0 },
  { name: "Tree",    ronkeCost: 250,  maxWorkers: 5,  requiredNFTs: 0 },
  { name: "Forest",  ronkeCost: 1000, maxWorkers: 10, requiredNFTs: 0 },
  { name: "Golden",  ronkeCost: 0,    maxWorkers: 15, requiredNFTs: 3 },
] as const;

// Pool emission
export const POOL_EMISSION_PER_HOUR = 1000;
export const POOL_EMISSION_PER_SEC = POOL_EMISSION_PER_HOUR / 3600;

// Workers
export const WORKER_HIRE_COST = 10;      // $Ronke
export const WORKER_STAMINA_SECONDS = 6 * 3600;  // 6h
export const FEED_COST_PER_WORKER = 500; // $NABABA por worker por cycle de 6h

// Boosts
export const NFT_BOOST_PER_NFT_BPS = 400;   // 4%
export const NFT_BOOST_MAX_NFTS = 10;       // cap 10 NFTs → 40%
export const NFT_BOOST_MAX_BPS = NFT_BOOST_PER_NFT_BPS * NFT_BOOST_MAX_NFTS;

export const TOKEN_BOOST_PER_1K_BPS = 100;  // +1% por cada 1k Ronke staked
export const TOKEN_BOOST_MAX_BPS = 3000;    // cap +30%

export const RESTAKE_FEE_BPS = 200;
export const RESTAKE_APR_BOOST_BPS = 2000;

export const JAIL_CURVE: [number, number][] = [
  [7 * 86400, 5000],
  [30 * 86400, 2500],
  [69 * 86400, 1000],
];

// ─────────────────────────────────────────────────────────────────────────
//                              INITIAL STATE
// ─────────────────────────────────────────────────────────────────────────

export function initialState(): DemoState {
  return {
    ronkeBalance: 1_000_000,
    nababaBalance: 5_000,            // un poco pre-cargado para que puedas feed inicialmente
    nftBalance: 10,
    ownedNftIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ronkeStaked: 0,
    stakedNftIds: [],
    plantations: [],
    nextPlantId: 0,
    otherWorkersActive: 20,          // simulación: 20 workers de otros farmers compitiendo
  };
}

// ─────────────────────────────────────────────────────────────────────────
//                              BUSINESS LOGIC
// ─────────────────────────────────────────────────────────────────────────

/** Cantidad de workers DEL USUARIO con stamina viva (cuentan al pool). */
export function userActiveWorkers(state: DemoState, now: number): number {
  return state.plantations.reduce((sum, p) => {
    if (p.workers > 0 && p.staminaUntil > now) return sum + p.workers;
    return sum;
  }, 0);
}

/** Total workers activos en el sistema (vos + otros simulados). */
export function totalActiveWorkers(state: DemoState, now: number): number {
  return userActiveWorkers(state, now) + state.otherWorkersActive;
}

/** Boost total del user en bps (acumulado de NFT + token + restake si aplica). */
export function userBoostBps(state: DemoState, restakeMode: boolean): number {
  const nftCount = Math.min(state.stakedNftIds.length, NFT_BOOST_MAX_NFTS);
  const nftBoost = nftCount * NFT_BOOST_PER_NFT_BPS;

  const tokenUnits = Math.floor(state.ronkeStaked / 1000);
  let tokenBoost = tokenUnits * TOKEN_BOOST_PER_1K_BPS;
  if (tokenBoost > TOKEN_BOOST_MAX_BPS) tokenBoost = TOKEN_BOOST_MAX_BPS;

  const restakeBoost = restakeMode ? RESTAKE_APR_BOOST_BPS : 0;

  return nftBoost + tokenBoost + restakeBoost;
}

/** Yield rate por segundo de una plantation, dado el state global. */
export function plantationRate(p: Plantation, state: DemoState, now: number): number {
  if (p.workers === 0) return 0;
  if (p.staminaUntil <= now) return 0;

  const total = totalActiveWorkers(state, now);
  if (total === 0) return 0;

  const baseShare = (p.workers / total) * POOL_EMISSION_PER_SEC;
  const boost = userBoostBps(state, p.restakeMode);
  return baseShare * (1 + boost / 10_000);
}

export function jailPenaltyBps(ageSeconds: number): number {
  for (const [threshold, penalty] of JAIL_CURVE) {
    if (ageSeconds < threshold) return penalty;
  }
  return 0;
}

export function calcAccrued(p: Plantation, state: DemoState, now: number): number {
  let endTime = p.staminaUntil < now ? p.staminaUntil : now;
  if (endTime <= p.lastSettleAt) return 0;
  if (p.workers === 0) return 0;

  const elapsed = endTime - p.lastSettleAt;
  const rate = plantationRate(p, state, p.staminaUntil < now ? p.staminaUntil : now);
  return rate * elapsed;
}

export function pendingRewards(p: Plantation, state: DemoState, now: number): number {
  return p.accruedNababa + calcAccrued(p, state, now);
}

export function settle(p: Plantation, state: DemoState, now: number): Plantation {
  const accrued = calcAccrued(p, state, now);
  return {
    ...p,
    accruedNababa: p.accruedNababa + accrued,
    lastSettleAt: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────
//                              VALIDATION (sin throws en setState)
// ─────────────────────────────────────────────────────────────────────────

export function validateBuyPlantation(state: DemoState, tierId: number): string | null {
  const tier = TIERS[tierId];
  if (!tier) return "Tier does not exist";
  if (tier.requiredNFTs > 0 && state.stakedNftIds.length < tier.requiredNFTs) {
    return `Need ${tier.requiredNFTs} Ronkeverse staked (you have ${state.stakedNftIds.length})`;
  }
  if (state.ronkeBalance < tier.ronkeCost) return "Not enough $Ronke";
  return null;
}

export function validateHireWorkers(state: DemoState, plantId: number, count: number): string | null {
  if (count <= 0) return "Invalid amount";
  const p = state.plantations.find((x) => x.id === plantId);
  if (!p) return "Plantation not found";
  const tier = TIERS[p.tierId];
  if (p.workers + count > tier.maxWorkers) {
    return `Max ${tier.maxWorkers} workers for tier ${tier.name}`;
  }
  const cost = WORKER_HIRE_COST * count;
  if (state.ronkeBalance < cost) return "Not enough $Ronke";
  return null;
}

export function validateFeedWorkers(state: DemoState, plantId: number): string | null {
  const p = state.plantations.find((x) => x.id === plantId);
  if (!p) return "Plantation not found";
  if (p.workers === 0) return "No workers to feed";
  const cost = FEED_COST_PER_WORKER * p.workers;
  if (state.nababaBalance < cost) return `Need ${cost} $NABABA (you have ${state.nababaBalance.toFixed(2)})`;
  return null;
}

export function validateStakeRonke(state: DemoState, amount: number): string | null {
  if (amount <= 0) return "Invalid amount";
  if (state.ronkeBalance < amount) return "Not enough $Ronke";
  return null;
}

export function validateUnstakeRonke(state: DemoState, amount: number): string | null {
  if (amount <= 0) return "Invalid amount";
  if (state.ronkeStaked < amount) return "Not that much staked";
  return null;
}

export function validateStakeNFTs(state: DemoState, ids: number[]): string | null {
  if (ids.length === 0) return "No IDs provided";
  for (const id of ids) {
    if (!state.ownedNftIds.includes(id)) return `NFT #${id} not in your wallet`;
  }
  return null;
}

export function validateUnstakeNFTs(state: DemoState, ids: number[]): string | null {
  if (ids.length === 0) return "No IDs provided";
  for (const id of ids) {
    if (!state.stakedNftIds.includes(id)) return `NFT #${id} not staked`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
//                              LOCALSTORAGE
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ronkeverse-farm-demo-v2";

export function loadState(): DemoState {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as DemoState;
    // safety: si schema cambió, reset
    if (typeof parsed.otherWorkersActive !== "number") return initialState();
    return parsed;
  } catch {
    return initialState();
  }
}

export function saveState(state: DemoState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
