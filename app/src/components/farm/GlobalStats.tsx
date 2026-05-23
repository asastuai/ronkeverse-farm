"use client";

import { useEffect, useState, useRef } from "react";

// Fake leaderboard — monke + crypto themed
const FAKE_FARMERS: { name: string; nababa: number; nfts: number }[] = [
  { name: "monke_lord.eth",     nababa: 12450, nfts: 21 },
  { name: "banana_baron",       nababa: 9870,  nfts: 14 },
  { name: "deep_blue_ape",      nababa: 8210,  nfts: 12 },
  { name: "jungle_king.ron",    nababa: 7440,  nfts: 8  },
  { name: "papa_monke",         nababa: 6890,  nfts: 5  },
];

function fmt(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.floor(n).toLocaleString();
}

/** Counter that counts up from 0 to `value` over `duration` ms on mount. */
function useCountUp(value: number, duration = 1200) {
  const [displayed, setDisplayed] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const toRef = useRef(value);

  useEffect(() => {
    fromRef.current = displayed;
    toRef.current = value;
    startRef.current = null;

    let raf = 0;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = fromRef.current + (toRef.current - fromRef.current) * eased;
      setDisplayed(current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return displayed;
}

export function GlobalStats() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, []);

  const activePlayers = 234 + Math.floor(tick * 0.7);
  const totalFarmed = 47200 + tick * 38;
  const activePlantations = 12 + (tick % 5);

  return (
    <div className="space-y-3">
      {/* Top banner — global stats */}
      <div className="card grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
        <StatPill emoji="👥" label="Active this week" value={activePlayers} />
        <StatPill emoji="🍌" label="$NABABA farmed today" value={totalFarmed} />
        <StatPill emoji="🌱" label="Plantations live" value={activePlantations} />
      </div>

      {/* Leaderboard */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-ronke-banana">
            🏆 Top Farmers · Season 0
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-ronke-blue/50">
            live · updates every 4s
          </span>
        </div>
        <div className="space-y-1.5">
          {FAKE_FARMERS.map((farmer, i) => (
            <LeaderRow key={farmer.name} rank={i + 1} {...farmer} />
          ))}
          <div className="mt-3 flex items-center justify-between rounded-lg border border-ronke-banana/40 bg-gradient-to-r from-ronke-banana/10 to-ronke-banana/5 px-3 py-2.5 text-xs shadow-banana">
            <span className="flex items-center gap-2 font-semibold text-ronke-banana">
              <span className="text-base">👤</span>
              <span>you</span>
            </span>
            <span className="text-ronke-banana/80">
              keep farming to climb the ranks ↑
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: number;
}) {
  const counted = useCountUp(value);
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl">{emoji}</span>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ronke-blue/60">
          {label}
        </div>
        <div className="font-display text-lg font-bold tabular-nums text-ronke-banana">
          {fmt(counted)}
        </div>
      </div>
    </div>
  );
}

function LeaderRow({
  rank,
  name,
  nababa,
  nfts,
}: {
  rank: number;
  name: string;
  nababa: number;
  nfts: number;
}) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="group flex items-center justify-between rounded-lg border border-ronke-blue/10 bg-ronke-deeper/40 px-3 py-2 text-xs transition hover:border-ronke-blue/30 hover:bg-ronke-deep/50">
      <div className="flex items-center gap-2">
        <span className="w-6 text-center text-base">{medals[rank - 1] ?? `#${rank}`}</span>
        <span className="font-mono font-semibold text-ronke-blue/90 group-hover:text-white">
          {name}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-ronke-blue/60">
        <span className="flex items-center gap-1">🐒 {nfts}</span>
        <span className="font-bold tabular-nums text-ronke-banana">
          {fmt(nababa)} 🍌
        </span>
      </div>
    </div>
  );
}
