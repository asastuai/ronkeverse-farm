"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import {
  contracts,
  ronkeBattlesHouseAbi,
  erc20Abi,
  nababaTokenAbi,
  NATIVE_TOKEN,
} from "@/lib/contracts";
import { activeChain } from "@/lib/chains";
import { CARDS, ROUNDS, roundWinner, saveReveal } from "@/lib/battles";
import { keccak256, encodeAbiParameters } from "viem";

const RON_TIERS = ["0.05", "0.1"] as const;
const USDC_TIERS = ["1", "5"] as const;
const MAX_SCAN = 30;
const STATUS = ["None", "Pending", "Settled", "Refunded"] as const;

type Currency = "RON" | "USDC";

export function HouseArena() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [moves, setMoves] = useState<number[]>([0, 1, 2, 0, 1]);
  const [currency, setCurrency] = useState<Currency>("RON");
  const [tier, setTier] = useState<string>("0.05");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [nonce, setNonce] = useState(0);
  const [lastPlayed, setLastPlayed] = useState<{ id: number; moves: number[] } | null>(null);

  const tokenAddr: Address = currency === "RON" ? NATIVE_TOKEN : contracts.testUsdc;
  const stakeWei = parseEther(tier);
  const onWrongChain = isConnected && chainId !== activeChain.id;

  const { data: ronBal } = useBalance({ address, query: { enabled: !!address } });
  const { data: nababaBal } = useReadContract({
    abi: nababaTokenAbi, address: contracts.nababaToken, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: pendingRon } = useReadContract({
    abi: ronkeBattlesHouseAbi, address: contracts.ronkeBattlesHouse, functionName: "pending",
    args: address ? [NATIVE_TOKEN, address] : undefined, query: { enabled: !!address, refetchInterval: 6000 },
  });
  const { data: pendingUsdc } = useReadContract({
    abi: ronkeBattlesHouseAbi, address: contracts.ronkeBattlesHouse, functionName: "pending",
    args: address ? [contracts.testUsdc, address] : undefined, query: { enabled: !!address, refetchInterval: 6000 },
  });
  const { data: availSeeds } = useReadContract({
    abi: ronkeBattlesHouseAbi, address: contracts.ronkeBattlesHouse, functionName: "availableSeeds",
    query: { refetchInterval: 10000 },
  });
  const { data: nextId } = useReadContract({
    abi: ronkeBattlesHouseAbi, address: contracts.ronkeBattlesHouse, functionName: "nextGameId",
    query: { refetchInterval: 6000 },
  });

  const idRange = useMemo(() => {
    const n = nextId ? Number(nextId) : 1;
    const ids: number[] = [];
    for (let i = Math.max(1, n - MAX_SCAN); i < n; i++) ids.push(i);
    return ids.reverse();
  }, [nextId, nonce]);

  const { data: gameData } = useReadContracts({
    contracts: idRange.map((id) => ({
      abi: ronkeBattlesHouseAbi as never,
      address: contracts.ronkeBattlesHouse,
      functionName: "getGame",
      args: [BigInt(id)],
    })),
    query: { enabled: idRange.length > 0, refetchInterval: 6000 },
  });

  const myGames = useMemo(() => {
    if (!gameData) return [];
    const me = address?.toLowerCase();
    return idRange
      .map((id, i) => {
        const r = gameData[i];
        if (!r || r.status !== "success") return null;
        const v = r.result as readonly [Address, Address, bigint, bigint, number, bigint];
        return { id, player: v[0], token: v[1], stake: v[2], status: v[4] };
      })
      .filter((g) => g && g.player.toLowerCase() === me) as Array<{
      id: number; player: Address; token: Address; stake: bigint; status: number;
    }>;
  }, [gameData, idRange, address]);

  const refresh = () => setNonce((n) => n + 1);

  function cycleCard(idx: number) {
    setMoves((m) => m.map((c, i) => (i === idx ? (c + 1) % 3 : c)));
  }
  function randomizeMoves() {
    const r = new Uint8Array(ROUNDS);
    crypto.getRandomValues(r);
    setMoves(Array.from(r).map((x) => x % 3));
  }

  async function ensureAllowance(token: Address, amount: bigint) {
    if (token === NATIVE_TOKEN || !publicClient) return;
    let allowance = 0n;
    try {
      allowance = (await publicClient.readContract({
        abi: erc20Abi, address: token, functionName: "allowance",
        args: [address as Address, contracts.ronkeBattlesHouse],
      })) as bigint;
    } catch { /* assume 0 */ }
    if (allowance >= amount) return;
    setMsg("Approving USDC…");
    const hash = await writeContractAsync({
      abi: erc20Abi, address: token, functionName: "approve",
      args: [contracts.ronkeBattlesHouse, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function handlePlay() {
    if (!address) return;
    setBusy(true); setMsg("");
    try {
      await ensureAllowance(tokenAddr, stakeWei);
      setMsg("Playing vs House…");
      const hash = await writeContractAsync({
        abi: ronkeBattlesHouseAbi, address: contracts.ronkeBattlesHouse, functionName: "play",
        args: [tokenAddr, stakeWei, moves as never],
        value: currency === "RON" ? stakeWei : 0n,
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      // averiguar el gameId recién creado y pinguear al keeper para settle inmediato
      const playedId = Number(await publicClient!.readContract({
        abi: ronkeBattlesHouseAbi, address: contracts.ronkeBattlesHouse, functionName: "nextGameId",
      })) - 1;
      void receipt;
      saveReveal(playedId, moves, "0x" as never); // guardamos las jugadas para el reveal
      setLastPlayed({ id: playedId, moves: [...moves] });
      setMsg("🎲 Played! The house is revealing your result…");
      fetch(`/api/keeper?gameId=${playedId}`).catch(() => {}); // best-effort; el cron es backstop
      setTimeout(refresh, 4000);
      refresh();
    } catch (e) {
      setMsg(`❌ ${friendlyError(e)}`);
    } finally { setBusy(false); }
  }

  async function handleWithdraw(token: Address) {
    setBusy(true); setMsg("");
    try {
      const hash = await writeContractAsync({
        abi: ronkeBattlesHouseAbi, address: contracts.ronkeBattlesHouse, functionName: "withdraw", args: [token],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg("✅ Withdrawn."); refresh();
    } catch (e) { setMsg(`❌ ${friendlyError(e)}`); } finally { setBusy(false); }
  }

  if (!isConnected) {
    return <div className="card p-8 text-center text-ronke-blue/70">Connect your wallet to challenge the house. 🐒</div>;
  }

  const noSeeds = availSeeds !== undefined && Number(availSeeds) === 0;

  return (
    <div className="flex flex-col gap-6">
      {onWrongChain && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          Wrong network — switch to {activeChain.name} to play.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Balance label="RON" value={ronBal ? trim(formatEther(ronBal.value)) : "—"} emoji="💎" />
        <Balance label="$NABABA" value={nababaBal !== undefined ? trim(formatEther(nababaBal as bigint)) : "—"} emoji="🍌" />
        <Balance label="House ready" value={availSeeds !== undefined ? `${Number(availSeeds)} games` : "—"} emoji="🎲" />
      </div>

      {(((pendingRon as bigint) ?? 0n) > 0n || ((pendingUsdc as bigint) ?? 0n) > 0n) && (
        <div className="card border-ronke-banana/40 bg-ronke-banana/5 p-4">
          <div className="mb-2 text-sm font-semibold text-ronke-banana">🏆 Winnings to claim</div>
          <div className="flex flex-wrap gap-3">
            {((pendingRon as bigint) ?? 0n) > 0n && (
              <button disabled={busy} onClick={() => handleWithdraw(NATIVE_TOKEN)} className="btn-primary">
                Withdraw {trim(formatEther(pendingRon as bigint))} RON
              </button>
            )}
            {((pendingUsdc as bigint) ?? 0n) > 0n && (
              <button disabled={busy} onClick={() => handleWithdraw(contracts.testUsdc)} className="btn-primary">
                Withdraw {trim(formatEther(pendingUsdc as bigint))} USDC
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h3 className="mb-1 font-display text-lg text-ronke-banana">Challenge the House</h3>
        <p className="mb-4 text-xs text-ronke-blue/60">
          Pick your 5 cards, stake, and play instantly — no opponent needed. Win → <b>2x</b>. Provably-fair: the house commits its cards before you play.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {moves.map((c, i) => (
            <button key={i} onClick={() => cycleCard(i)} disabled={busy}
              className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-ronke-blue/20 bg-ronke-deep/60 text-3xl transition hover:border-ronke-banana hover:scale-105"
              title={CARDS[c].name}>
              {CARDS[c].emoji}
              <span className="mt-0.5 text-[9px] uppercase tracking-wide text-ronke-blue/50">R{i + 1}</span>
            </button>
          ))}
          <button onClick={randomizeMoves} disabled={busy} className="btn-secondary ml-1 text-xs">🎲 Random</button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-ronke-blue/50">Currency</label>
            <div className="flex gap-1 rounded-lg border border-ronke-blue/20 p-1">
              {(["RON", "USDC"] as Currency[]).map((c) => (
                <button key={c} onClick={() => { setCurrency(c); setTier(c === "RON" ? "0.05" : "1"); }}
                  className={`rounded px-3 py-1 text-sm font-semibold transition ${currency === c ? "bg-ronke-banana text-ronke-deep" : "text-ronke-blue/70 hover:text-white"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-ronke-blue/50">Stake</label>
            <div className="flex gap-1 rounded-lg border border-ronke-blue/20 p-1">
              {(currency === "RON" ? RON_TIERS : USDC_TIERS).map((t) => (
                <button key={t} onClick={() => setTier(t)}
                  className={`rounded px-3 py-1 text-sm font-semibold transition ${tier === t ? "bg-ronke-blue text-white" : "text-ronke-blue/70 hover:text-white"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handlePlay} disabled={busy || onWrongChain || noSeeds} className="btn-primary w-full sm:w-auto">
          {busy ? "…" : noSeeds ? "House warming up…" : `🎰 Play vs House · ${tier} ${currency}`}
        </button>
        <p className="mt-2 text-[11px] text-ronke-blue/50">
          Win pays 2x · ~6% house edge funds the ecosystem · ties refund · you earn $NABABA every game.
        </p>
      </div>

      {msg && (
        <div className="rounded-xl border border-ronke-blue/20 bg-ronke-deep/60 p-3 text-sm text-ronke-blue/90">{msg}</div>
      )}

      {lastPlayed && (
        <ResultReveal
          gameId={lastPlayed.id}
          playerMoves={lastPlayed.moves}
          onClose={() => setLastPlayed(null)}
        />
      )}

      <div>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="font-display text-lg text-white/90">Your games</h3>
          <div className="section-divider flex-1" />
          <button onClick={refresh} className="btn-secondary text-xs">↻ Refresh</button>
        </div>
        {myGames.length === 0 ? (
          <p className="text-sm text-ronke-blue/50">No games yet. Challenge the house above. 🎰</p>
        ) : (
          <div className="flex flex-col gap-2">
            {myGames.map((g) => (
              <div key={g.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm">
                  <span className="font-semibold text-ronke-banana">#{g.id}</span>{" "}
                  <span className="text-ronke-blue/70">
                    {trim(formatEther(g.stake))} {g.token === NATIVE_TOKEN ? "RON" : "USDC"}
                  </span>
                </div>
                <span className={`text-xs font-semibold ${g.status === 1 ? "text-ronke-blue/60" : "text-ronke-banana"}`}>
                  {g.status === 1 ? "⏳ House revealing…" : STATUS[g.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Reveal turno por turno de la partida vs casa. Una vez settleada, deriva las cartas de la casa
 * del seed revelado (provably-fair) y las muestra ronda a ronda en secuencia dentro de un recuadro,
 * con el score corriendo y el veredicto final al cerrar. Hace "sentir vivo" el duelo.
 */
function ResultReveal({ gameId, playerMoves, onClose }: { gameId: number; playerMoves: number[]; onClose: () => void }) {
  const publicClient = usePublicClient();
  const [houseMoves, setHouseMoves] = useState<number[] | null>(null);
  const [result, setResult] = useState<number | null>(null); // 1 you / 2 house / 0 tie
  const [shown, setShown] = useState(0); // rondas reveladas (0..5)

  const { data: game } = useReadContract({
    abi: ronkeBattlesHouseAbi, address: contracts.ronkeBattlesHouse, functionName: "getGame",
    args: [BigInt(gameId)], query: { refetchInterval: 3000 },
  });
  const status = game ? Number((game as unknown[])[4]) : 1;

  // 1) cuando settlea, traer el seed de la tx de settle y derivar las cartas de la casa
  useEffect(() => {
    if (status !== 2 || houseMoves || !publicClient) return;
    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        const fromBlock = latest > 5000n ? latest - 5000n : 0n;
        const logs = await publicClient.getContractEvents({
          address: contracts.ronkeBattlesHouse, abi: ronkeBattlesHouseAbi as never,
          eventName: "Settled", args: { gameId: BigInt(gameId) }, fromBlock,
        });
        if (!logs.length) return;
        const txHash = (logs[0] as { transactionHash: `0x${string}` }).transactionHash;
        const tx = await publicClient.getTransaction({ hash: txHash });
        const seed = ("0x" + tx.input.slice(-64)) as `0x${string}`;
        const h = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [seed, BigInt(gameId)]));
        const hex = h.slice(2);
        const hm: number[] = [];
        for (let i = 0; i < 5; i++) hm.push(parseInt(hex.slice(i * 2, i * 2 + 2), 16) % 3);
        setResult(Number((logs[0] as { args: { result: number } }).args.result));
        setHouseMoves(hm);
      } catch { /* best-effort */ }
    })();
  }, [status, houseMoves, publicClient, gameId]);

  // 2) revelar las rondas en secuencia, una por una
  useEffect(() => {
    if (!houseMoves || shown >= ROUNDS) return;
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 350 : 950);
    return () => clearTimeout(t);
  }, [houseMoves, shown]);

  // score corriendo sobre las rondas ya reveladas
  let pw = 0, hw = 0;
  if (houseMoves) {
    for (let i = 0; i < shown; i++) {
      const r = roundWinner(playerMoves[i], houseMoves[i]);
      if (r === 1) pw++; else if (r === 2) hw++;
    }
  }
  const done = shown >= ROUNDS;
  const verdict = result === 1 ? "🎉 You won!" : result === 2 ? "😿 House won" : "🤝 Tie — refunded";

  return (
    <div className="card border-ronke-banana/40 bg-ronke-banana/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-base text-ronke-banana">Game #{gameId} · the duel</span>
        <button onClick={onClose} className="text-xs text-ronke-blue/50 hover:text-white">dismiss ✕</button>
      </div>

      {status !== 2 || !houseMoves ? (
        <div className="flex items-center gap-2 py-3 text-sm text-ronke-blue/70">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-ronke-banana" />
          The house is revealing your cards…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* recuadro de la secuencia ronda por ronda */}
          <div className="rounded-xl border border-ronke-blue/15 bg-ronke-deep/50 p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-ronke-blue/40">
              <span>You</span><span>Round</span><span>House</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: ROUNDS }).map((_, i) => {
                const revealed = i < shown;
                const r = revealed ? roundWinner(playerMoves[i], houseMoves[i]) : -1;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg px-2 py-1.5 transition-all duration-300 ${
                      revealed ? "bg-ronke-deep/60 opacity-100" : "opacity-30"
                    } ${r === 1 ? "ring-1 ring-green-400/50" : r === 2 ? "ring-1 ring-red-400/40" : ""}`}
                  >
                    <Card c={revealed ? playerMoves[i] : -1} highlight={r === 1} />
                    <span className="text-[11px] font-semibold text-ronke-blue/50">
                      {revealed ? (r === 1 ? "◀ win" : r === 2 ? "lose ▶" : "tie") : `R${i + 1}`}
                    </span>
                    <Card c={revealed ? houseMoves[i] : -1} highlight={r === 2} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* score corriendo */}
          <div className="flex items-center justify-center gap-3 text-sm">
            <span className="font-bold text-white">You {pw}</span>
            <span className="text-ronke-blue/40">—</span>
            <span className="font-bold text-white">{hw} House</span>
          </div>

          {/* veredicto al terminar la secuencia */}
          {done && result !== null && (
            <div className="reveal text-center text-lg font-bold text-ronke-banana">{verdict}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ c, highlight }: { c: number; highlight?: boolean }) {
  return (
    <div className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 bg-ronke-deep/70 text-2xl transition ${
      highlight ? "border-green-400/70 scale-105" : "border-ronke-blue/20"
    }`}>
      {c >= 0 ? CARDS[c].emoji : "?"}
    </div>
  );
}

function Balance({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <span className="text-2xl">{emoji}</span>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ronke-blue/50">{label}</div>
        <div className="font-semibold text-white/90">{value}</div>
      </div>
    </div>
  );
}

function trim(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function friendlyError(e: unknown): string {
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Transaction failed";
  if (m.includes("User rejected") || m.includes("denied")) return "Cancelled.";
  return m.length > 120 ? m.slice(0, 120) + "…" : m;
}
