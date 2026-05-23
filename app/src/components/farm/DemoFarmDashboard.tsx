"use client";

import { useState } from "react";
import { useDemoFarm } from "@/lib/useDemoFarm";
import { GlobalStats } from "./GlobalStats";
import {
  TIER_NAMES,
  TIERS,
  POOL_EMISSION_PER_HOUR,
  FEED_COST_PER_WORKER,
  NFT_BOOST_PER_NFT_BPS,
  NFT_BOOST_MAX_NFTS,
  userActiveWorkers,
  totalActiveWorkers,
  userBoostBps,
  pendingRewards as calcPending,
} from "@/lib/demoFarmStore";

function Card({
  title,
  emoji,
  children,
  action,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <h3 className="font-display text-base font-bold text-ronke-banana">{title}</h3>
        </div>
        {action}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-primary w-full">
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-secondary">
      {children}
    </button>
  );
}

function fmtNum(n: number, max = 2) {
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
}

// safe wrapper: si la action tira ActionError, mostramos toast amistoso.
function safeCall(fn: () => void, onError?: (msg: string) => void) {
  try {
    fn();
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e));
  }
}

// ─────────────────────────────────────────────────────────────────────────

export function DemoFarmDashboard() {
  const { state, actions } = useDemoFarm();
  const [err, setErr] = useState<string | null>(null);
  const [ronkeAmount, setRonkeAmount] = useState("");
  const [nftIds, setNftIds] = useState("");
  const [tierId, setTierId] = useState(0);

  const now = Math.floor(Date.now() / 1000);
  const myWorkers = userActiveWorkers(state, now);
  const totalWorkers = totalActiveWorkers(state, now);
  const myShare = totalWorkers > 0 ? myWorkers / totalWorkers : 0;
  const myBoost = userBoostBps(state, false); // sin restake bonus (varía por plantation)
  const estHourly = myShare * POOL_EMISSION_PER_HOUR * (1 + myBoost / 10_000);

  const ronkeAmtNum = Number(ronkeAmount) || 0;
  const parseIds = (s: string) =>
    s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);

  const showError = (msg: string) => {
    setErr(msg);
    setTimeout(() => setErr(null), 4000);
  };

  return (
    <div className="space-y-4">
      {/* header demo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-ronke-banana/40 bg-ronke-banana/10 px-3 py-1 text-xs font-medium text-ronke-banana">
          🎮 DEMO MODE · state persisted in your browser, no chain
        </div>
        <button
          onClick={() => {
            if (confirm("Reset all demo progress?")) actions.reset();
          }}
          className="rounded-lg border border-ronke-blue/30 px-3 py-1 text-xs text-ronke-blue/70 hover:bg-ronke-blue/10"
        >
          Reset demo
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          ❌ {err}
        </div>
      )}

      {/* Global stats + leaderboard */}
      <GlobalStats />

      {/* POOL info */}
      <div className="card relative overflow-hidden p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ronke-banana">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ronke-banana shadow-banana" />
          🌊 Global Pool
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase text-ronke-blue/60">Emission</div>
            <div className="font-bold text-ronke-banana">{POOL_EMISSION_PER_HOUR} 🍌/h</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ronke-blue/60">Total workers</div>
            <div className="font-bold text-ronke-banana">
              {totalWorkers} <span className="text-xs text-ronke-blue/60">({myWorkers} yours)</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ronke-blue/60">Your share</div>
            <div className="font-bold text-ronke-banana">{(myShare * 100).toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ronke-blue/60">Estimate /hour</div>
            <div className="font-bold text-ronke-banana">{fmtNum(estHourly, 2)} 🍌</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[10px] uppercase text-ronke-blue/60">Other farmers (sim)</span>
          <input
            type="range"
            min="0"
            max="200"
            value={state.otherWorkersActive}
            onChange={(e) => actions.setOtherWorkers(Number(e.target.value))}
            className="flex-1 accent-ronke-blue"
          />
          <span className="w-12 text-right text-xs font-semibold text-ronke-blue/80">
            {state.otherWorkersActive} W
          </span>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          emoji="🐒"
          label="Ronkeverse"
          value={`${state.nftBalance} owned`}
          sub={`${state.stakedNftIds.length} staked · +${Math.min(state.stakedNftIds.length, NFT_BOOST_MAX_NFTS) * NFT_BOOST_PER_NFT_BPS / 100}% boost`}
        />
        <Stat
          emoji="🪙"
          label="$Ronke"
          value={fmtNum(state.ronkeBalance)}
          sub={`${fmtNum(state.ronkeStaked)} staked`}
        />
        <Stat emoji="🍌" label="$NABABA" value={fmtNum(state.nababaBalance, 2)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Stake Ronke */}
        <Card title="Stake $Ronke" emoji="🪙">
          <input
            value={ronkeAmount}
            onChange={(e) => setRonkeAmount(e.target.value)}
            type="number"
            placeholder="amount"
            className="input-primary"
          />
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton
              onClick={() => safeCall(() => actions.stakeRonke(ronkeAmtNum), showError)}
              disabled={!ronkeAmtNum}
            >
              Stake
            </PrimaryButton>
            <SecondaryButton
              onClick={() => safeCall(() => actions.unstakeRonke(ronkeAmtNum), showError)}
              disabled={!ronkeAmtNum}
            >
              Unstake
            </SecondaryButton>
          </div>
        </Card>

        {/* Stake NFTs */}
        <Card title="Stake Ronkeverse" emoji="🐒">
          <div className="text-xs text-ronke-blue/70">
            Owned: <span className="font-semibold text-ronke-banana">{state.ownedNftIds.join(", ") || "—"}</span>
            <br />
            Staked: <span className="font-semibold text-ronke-banana">{state.stakedNftIds.join(", ") || "—"}</span>
          </div>
          <input
            value={nftIds}
            onChange={(e) => setNftIds(e.target.value)}
            placeholder="IDs, e.g.: 1, 2, 3"
            className="input-primary"
          />
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton
              onClick={() => safeCall(() => actions.stakeNFTs(parseIds(nftIds)), showError)}
              disabled={!nftIds}
            >
              Stake
            </PrimaryButton>
            <SecondaryButton
              onClick={() => safeCall(() => actions.unstakeNFTs(parseIds(nftIds)), showError)}
              disabled={!nftIds}
            >
              Unstake
            </SecondaryButton>
          </div>
          <div className="text-[10px] text-ronke-blue/50">
            +{NFT_BOOST_PER_NFT_BPS / 100}% per NFT, cap {NFT_BOOST_MAX_NFTS} NFTs (={NFT_BOOST_MAX_NFTS * NFT_BOOST_PER_NFT_BPS / 100}%)
          </div>
        </Card>

        {/* Buy Plantation */}
        <Card title="Buy Plantation" emoji="🌳">
          <div className="flex gap-1.5">
            {TIERS.map((t, i) => (
              <button
                key={i}
                onClick={() => setTierId(i)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                  tierId === i
                    ? "border-ronke-banana bg-ronke-banana/15 text-ronke-banana"
                    : "border-ronke-blue/20 bg-ronke-deep/40 text-ronke-blue/70 hover:bg-ronke-blue/10"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-ronke-blue/70">
            <div>
              <div className="opacity-60">Cost</div>
              <div className="font-semibold text-ronke-banana">{fmtNum(TIERS[tierId].ronkeCost)} $Ronke</div>
            </div>
            <div>
              <div className="opacity-60">Max workers</div>
              <div className="font-semibold text-ronke-banana">{TIERS[tierId].maxWorkers}</div>
            </div>
          </div>
          {TIERS[tierId].requiredNFTs > 0 && (
            <div className="rounded-lg border border-ronke-banana/30 bg-ronke-banana/5 px-3 py-1.5 text-xs text-ronke-banana/80">
              🐒 Requires {TIERS[tierId].requiredNFTs} Ronkeverse NFTs staked
            </div>
          )}
          <PrimaryButton onClick={() => safeCall(() => actions.buyPlantation(tierId), showError)}>
            Buy {TIERS[tierId].name}
          </PrimaryButton>
        </Card>
      </div>

      {/* Plantations list */}
      <Card title="Your Plantations" emoji="🌱">
        {state.plantations.length === 0 ? (
          <div className="text-sm text-ronke-blue/60">No Plantations yet. Buy one above to start.</div>
        ) : (
          <div className="space-y-3">
            {state.plantations.map((p) => {
              const pending = calcPending(p, state, now);
              const staminaActive = p.staminaUntil > now;
              const staminaH = staminaActive ? ((p.staminaUntil - now) / 3600).toFixed(1) : "0";
              const ageDays = ((now - p.createdAt) / 86400).toFixed(2);
              const tier = TIERS[p.tierId];
              const feedCost = p.workers * FEED_COST_PER_WORKER;

              return (
                <div key={p.id} className="rounded-xl border border-ronke-blue/15 bg-ronke-deep/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-ronke-banana">
                        #{p.id} · {TIER_NAMES[p.tierId]}
                      </span>
                      {p.restakeMode && (
                        <span className="rounded-md bg-ronke-banana/20 px-1.5 py-0.5 text-[10px] font-semibold text-ronke-banana">
                          RESTAKE MODE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ronke-blue/60">
                      {staminaActive ? `⚡ ${staminaH}h stamina` : "💤 needs feed"}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div>
                      <div className="opacity-60">Workers</div>
                      <div className="font-semibold">
                        {p.workers} / {tier.maxWorkers}
                      </div>
                    </div>
                    <div>
                      <div className="opacity-60">Pending</div>
                      <div className="font-semibold text-ronke-banana">{fmtNum(pending, 4)} 🍌</div>
                    </div>
                    <div>
                      <div className="opacity-60">Feed cost</div>
                      <div className="font-semibold">{fmtNum(feedCost, 0)} 🍌</div>
                    </div>
                    <div>
                      <div className="opacity-60">Age</div>
                      <div className="font-semibold">{ageDays}d</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <SecondaryButton
                      onClick={() => safeCall(() => actions.hireWorkers(p.id, 1), showError)}
                      disabled={p.workers >= tier.maxWorkers}
                    >
                      +1 Worker
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() => safeCall(() => actions.feedWorkers(p.id), showError)}
                      disabled={p.workers === 0}
                    >
                      🍌 Feed ({feedCost})
                    </SecondaryButton>
                    <SecondaryButton onClick={() => safeCall(() => actions.claim(p.id), showError)}>
                      💰 Claim
                    </SecondaryButton>
                    <SecondaryButton onClick={() => safeCall(() => actions.restake(p.id), showError)}>
                      🔁 Restake
                    </SecondaryButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  emoji,
  label,
  value,
  sub,
}: {
  emoji: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-ronke-blue/15 bg-ronke-deep/40 p-4 backdrop-blur">
      <div className="text-xs uppercase tracking-wider text-ronke-blue/70">
        {emoji} {label}
      </div>
      <div className="mt-1 text-lg font-bold text-ronke-banana">{value}</div>
      {sub && <div className="text-[10px] text-ronke-blue/50">{sub}</div>}
    </div>
  );
}
