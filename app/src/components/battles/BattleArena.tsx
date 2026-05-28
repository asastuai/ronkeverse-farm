"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { decodeEventLog, formatEther, parseEther, type Address, type Hex } from "viem";
import {
  contracts,
  ronkeBattlesAbi,
  erc20Abi,
  nababaTokenAbi,
  NATIVE_TOKEN,
} from "@/lib/contracts";
import { activeChain } from "@/lib/chains";
import { CARDS, ROUNDS, STATUS, computeCommit, randomSalt, saveReveal, loadReveal } from "@/lib/battles";

const RON_TIERS = ["0.1", "0.5", "1"] as const;
const USDC_TIERS = ["1", "5", "10"] as const;
const MAX_SCAN = 40; // últimos N matches a escanear en el browser

type Currency = "RON" | "USDC";

export function BattleArena() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [moves, setMoves] = useState<number[]>([0, 1, 2, 0, 1]);
  const [currency, setCurrency] = useState<Currency>("RON");
  const [tier, setTier] = useState<string>("0.1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [nonce, setNonce] = useState(0); // bump para refrescar lecturas

  const tokenAddr: Address = currency === "RON" ? NATIVE_TOKEN : contracts.testUsdc;
  const stakeWei = parseEther(tier);
  const onWrongChain = isConnected && chainId !== activeChain.id;

  // ── Balances ──
  const { data: ronBal } = useBalance({ address, query: { enabled: !!address } });
  const { data: usdcBal } = useReadContract({
    abi: erc20Abi,
    address: contracts.testUsdc,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: nababaBal } = useReadContract({
    abi: nababaTokenAbi,
    address: contracts.nababaToken,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // ── Pending withdrawals ──
  const { data: pendingRon } = useReadContract({
    abi: ronkeBattlesAbi,
    address: contracts.ronkeBattles,
    functionName: "pending",
    args: address ? [NATIVE_TOKEN, address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });
  const { data: pendingUsdc } = useReadContract({
    abi: ronkeBattlesAbi,
    address: contracts.ronkeBattles,
    functionName: "pending",
    args: address ? [contracts.testUsdc, address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });

  // ── Match list ──
  const { data: nextId } = useReadContract({
    abi: ronkeBattlesAbi,
    address: contracts.ronkeBattles,
    functionName: "nextMatchId",
    query: { refetchInterval: 8000 },
  });

  const idRange = useMemo(() => {
    const n = nextId ? Number(nextId) : 1;
    const ids: number[] = [];
    for (let i = Math.max(1, n - MAX_SCAN); i < n; i++) ids.push(i);
    return ids.reverse(); // más nuevos primero
  }, [nextId, nonce]);

  const { data: matchData } = useReadContracts({
    contracts: idRange.map((id) => ({
      abi: ronkeBattlesAbi as never,
      address: contracts.ronkeBattles,
      functionName: "getMatch",
      args: [BigInt(id)],
    })),
    query: { enabled: idRange.length > 0, refetchInterval: 8000 },
  });

  const matches = useMemo(() => {
    if (!matchData) return [];
    return idRange
      .map((id, i) => {
        const r = matchData[i];
        if (!r || r.status !== "success") return null;
        const v = r.result as readonly [Address, Address, Address, bigint, number, boolean, boolean, bigint];
        return {
          id,
          playerA: v[0],
          playerB: v[1],
          token: v[2],
          stake: v[3],
          status: v[4],
          revealedA: v[5],
          revealedB: v[6],
          bothCommittedAt: v[7],
        };
      })
      .filter(Boolean) as Array<{
      id: number;
      playerA: Address;
      playerB: Address;
      token: Address;
      stake: bigint;
      status: number;
      revealedA: boolean;
      revealedB: boolean;
      bothCommittedAt: bigint;
    }>;
  }, [matchData, idRange]);

  const me = address?.toLowerCase();
  const openMatches = matches.filter((m) => m.status === 0 && m.playerA.toLowerCase() !== me);
  const myMatches = matches.filter(
    (m) =>
      (m.playerA.toLowerCase() === me || m.playerB.toLowerCase() === me) &&
      (m.status === 0 || m.status === 1),
  );

  const refresh = () => setNonce((n) => n + 1);

  // ── Helpers de tx ──
  async function ensureAllowance(token: Address, amount: bigint) {
    if (token === NATIVE_TOKEN || !publicClient) return;
    let allowance = 0n;
    try {
      allowance = (await publicClient.readContract({
        abi: erc20Abi,
        address: token,
        functionName: "allowance",
        args: [address as Address, contracts.ronkeBattles],
      })) as bigint;
    } catch {
      /* assume 0 */
    }
    if (allowance >= amount) return;
    setMsg("Approving USDC…");
    const hash = await writeContractAsync({
      abi: erc20Abi,
      address: token,
      functionName: "approve",
      args: [contracts.ronkeBattles, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  function cycleCard(idx: number) {
    setMoves((m) => m.map((c, i) => (i === idx ? (c + 1) % 3 : c)));
  }

  function randomizeMoves() {
    const r = new Uint8Array(ROUNDS);
    crypto.getRandomValues(r);
    setMoves(Array.from(r).map((x) => x % 3));
  }

  // ── Create ──
  async function handleCreate() {
    if (!address) return;
    setBusy(true);
    setMsg("");
    try {
      const salt = randomSalt();
      const commit = computeCommit(address, moves, salt);
      await ensureAllowance(tokenAddr, stakeWei);
      setMsg("Creating match…");
      const hash = await writeContractAsync({
        abi: ronkeBattlesAbi,
        address: contracts.ronkeBattles,
        functionName: "createMatch",
        args: [tokenAddr, stakeWei, commit],
        value: currency === "RON" ? stakeWei : 0n,
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      // decodificar matchId del evento MatchCreated y guardar el reveal
      let matchId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: ronkeBattlesAbi as never, data: log.data, topics: log.topics }) as unknown as {
            eventName?: string;
            args?: { matchId?: bigint };
          };
          if (ev.eventName === "MatchCreated" && ev.args?.matchId !== undefined) {
            matchId = ev.args.matchId;
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (matchId !== null) saveReveal(matchId, moves, salt);
      setMsg(`✅ Match #${matchId?.toString() ?? "?"} created. Share it — waiting for an opponent.`);
      refresh();
    } catch (e) {
      setMsg(`❌ ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // ── Join ──
  async function handleJoin(m: { id: number; token: Address; stake: bigint }) {
    if (!address) return;
    setBusy(true);
    setMsg("");
    try {
      const salt = randomSalt();
      const commit = computeCommit(address, moves, salt);
      // guardar ANTES de la tx — el matchId ya se conoce
      saveReveal(m.id, moves, salt);
      await ensureAllowance(m.token, m.stake);
      setMsg(`Joining match #${m.id}…`);
      const hash = await writeContractAsync({
        abi: ronkeBattlesAbi,
        address: contracts.ronkeBattles,
        functionName: "joinMatch",
        args: [BigInt(m.id), commit],
        value: m.token === NATIVE_TOKEN ? m.stake : 0n,
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg(`✅ Joined #${m.id}. Now reveal your cards before the window closes.`);
      refresh();
    } catch (e) {
      setMsg(`❌ ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // ── Reveal ──
  async function handleReveal(matchId: number) {
    setBusy(true);
    setMsg("");
    try {
      const data = loadReveal(matchId);
      if (!data) {
        setMsg(`❌ No saved cards for match #${matchId} on this device. Reveal must be done from the device you played on.`);
        return;
      }
      setMsg(`Revealing match #${matchId}…`);
      const hash = await writeContractAsync({
        abi: ronkeBattlesAbi,
        address: contracts.ronkeBattles,
        functionName: "reveal",
        args: [BigInt(matchId), data.moves as never, data.salt as Hex],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg(`✅ Revealed #${matchId}. If both revealed, it's settled — check your winnings.`);
      refresh();
    } catch (e) {
      setMsg(`❌ ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // ── Claim timeout ──
  async function handleClaimTimeout(matchId: number) {
    setBusy(true);
    setMsg("");
    try {
      const hash = await writeContractAsync({
        abi: ronkeBattlesAbi,
        address: contracts.ronkeBattles,
        functionName: "claimTimeout",
        args: [BigInt(matchId)],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg(`✅ Timeout claimed on #${matchId}.`);
      refresh();
    } catch (e) {
      setMsg(`❌ ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // ── Withdraw ──
  async function handleWithdraw(token: Address) {
    setBusy(true);
    setMsg("");
    try {
      const hash = await writeContractAsync({
        abi: ronkeBattlesAbi,
        address: contracts.ronkeBattles,
        functionName: "withdraw",
        args: [token],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg("✅ Withdrawn.");
      refresh();
    } catch (e) {
      setMsg(`❌ ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="card p-8 text-center text-ronke-blue/70">
        Connect your wallet to enter the arena. 🐒
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {onWrongChain && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          Wrong network — switch to {activeChain.name} to play.
        </div>
      )}

      {/* Balances + pending */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Balance label="RON" value={ronBal ? trim(formatEther(ronBal.value)) : "—"} emoji="💎" />
        <Balance label="USDC (test)" value={usdcBal !== undefined ? trim(formatEther(usdcBal as bigint)) : "—"} emoji="💵" />
        <Balance label="$NABABA" value={nababaBal !== undefined ? trim(formatEther(nababaBal as bigint)) : "—"} emoji="🍌" />
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

      {/* Create / play panel */}
      <div className="card p-6">
        <h3 className="mb-1 font-display text-lg text-ronke-banana">Pick your 5 cards</h3>
        <p className="mb-4 text-xs text-ronke-blue/60">
          Tap to cycle. 🍌 beats 🐒 · 🐒 beats 🌴 · 🌴 beats 🍌. Best of {ROUNDS}. Same hand is used when you create or join.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {moves.map((c, i) => (
            <button
              key={i}
              onClick={() => cycleCard(i)}
              disabled={busy}
              className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-ronke-blue/20 bg-ronke-deep/60 text-3xl transition hover:border-ronke-banana hover:scale-105"
              title={CARDS[c].name}
            >
              {CARDS[c].emoji}
              <span className="mt-0.5 text-[9px] uppercase tracking-wide text-ronke-blue/50">R{i + 1}</span>
            </button>
          ))}
          <button onClick={randomizeMoves} disabled={busy} className="btn-secondary ml-1 text-xs">
            🎲 Random
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-ronke-blue/50">Currency</label>
            <div className="flex gap-1 rounded-lg border border-ronke-blue/20 p-1">
              {(["RON", "USDC"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCurrency(c);
                    setTier(c === "RON" ? "0.1" : "1");
                  }}
                  className={`rounded px-3 py-1 text-sm font-semibold transition ${
                    currency === c ? "bg-ronke-banana text-ronke-deep" : "text-ronke-blue/70 hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-ronke-blue/50">Stake (per player)</label>
            <div className="flex gap-1 rounded-lg border border-ronke-blue/20 p-1">
              {(currency === "RON" ? RON_TIERS : USDC_TIERS).map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={`rounded px-3 py-1 text-sm font-semibold transition ${
                    tier === t ? "bg-ronke-blue text-white" : "text-ronke-blue/70 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleCreate} disabled={busy || onWrongChain} className="btn-primary w-full sm:w-auto">
          {busy ? "…" : `⚔️ Create match · ${tier} ${currency}`}
        </button>
        <p className="mt-2 text-[11px] text-ronke-blue/50">
          Winner takes the pot minus 6% rake. Both players earn $NABABA just for playing.
        </p>
      </div>

      {msg && (
        <div className="rounded-xl border border-ronke-blue/20 bg-ronke-deep/60 p-3 text-sm text-ronke-blue/90">
          {msg}
        </div>
      )}

      {/* My matches */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="font-display text-lg text-white/90">Your matches</h3>
          <div className="section-divider flex-1" />
          <button onClick={refresh} className="btn-secondary text-xs">↻ Refresh</button>
        </div>
        {myMatches.length === 0 ? (
          <p className="text-sm text-ronke-blue/50">No active matches. Create one above. 🐒</p>
        ) : (
          <div className="flex flex-col gap-2">
            {myMatches.map((m) => {
              const iAmA = m.playerA.toLowerCase() === me;
              const iRevealed = iAmA ? m.revealedA : m.revealedB;
              const canReveal = m.status === 1 && !iRevealed;
              const hasSaved = !!loadReveal(m.id);
              return (
                <div key={m.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="text-sm">
                    <span className="font-semibold text-ronke-banana">#{m.id}</span>{" "}
                    <span className="text-ronke-blue/70">
                      {trim(formatEther(m.stake))} {m.token === NATIVE_TOKEN ? "RON" : "USDC"} · {STATUS[m.status]}
                    </span>
                    {m.status === 1 && (
                      <span className="ml-2 text-xs text-ronke-blue/50">
                        {m.revealedA ? "A✓" : "A…"} {m.revealedB ? "B✓" : "B…"}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {m.status === 0 && iAmA && (
                      <span className="text-xs text-ronke-blue/50">Waiting for opponent…</span>
                    )}
                    {canReveal && (
                      <button
                        disabled={busy || !hasSaved}
                        onClick={() => handleReveal(m.id)}
                        className="btn-primary text-sm"
                        title={hasSaved ? "" : "Cards not on this device"}
                      >
                        Reveal
                      </button>
                    )}
                    {m.status === 1 && (
                      <button disabled={busy} onClick={() => handleClaimTimeout(m.id)} className="btn-secondary text-sm">
                        Claim timeout
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Open matches to join */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="font-display text-lg text-white/90">Open challenges</h3>
          <div className="section-divider flex-1" />
        </div>
        {openMatches.length === 0 ? (
          <p className="text-sm text-ronke-blue/50">No open matches right now. Be the first to create one. ⚔️</p>
        ) : (
          <div className="flex flex-col gap-2">
            {openMatches.map((m) => (
              <div key={m.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm">
                  <span className="font-semibold text-ronke-banana">#{m.id}</span>{" "}
                  <span className="text-ronke-blue/70">
                    {trim(formatEther(m.stake))} {m.token === NATIVE_TOKEN ? "RON" : "USDC"}
                  </span>{" "}
                  <span className="text-xs text-ronke-blue/40">
                    by {m.playerA.slice(0, 6)}…{m.playerA.slice(-4)}
                  </span>
                </div>
                <button
                  disabled={busy || onWrongChain}
                  onClick={() => handleJoin(m)}
                  className="btn-primary text-sm"
                >
                  Join with your hand
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
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
