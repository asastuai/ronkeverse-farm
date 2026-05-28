"use client";

import { useState } from "react";
import Link from "next/link";
import { RonkeCollage } from "@/components/RonkeCollage";
import { ConnectButton } from "@/components/ConnectButton";
import { ChainGuard } from "@/components/ChainGuard";
import { BattleArena } from "@/components/battles/BattleArena";
import { HouseArena } from "@/components/battles/HouseArena";

type Mode = "house" | "pvp";

export default function BattlesPage() {
  const [mode, setMode] = useState<Mode>("house");
  return (
    <div className="relative min-h-screen overflow-hidden">
      <RonkeCollage />
      <div className="glow-blue pointer-events-none absolute inset-0" />
      <div className="glow-banana pointer-events-none absolute inset-0" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-10">
        {/* nav */}
        <nav className="flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <img src="/ronke.svg" alt="Ronke" className="h-8 w-8 sm:h-10 sm:w-10" />
            <span className="hidden text-xs font-semibold tracking-wide text-ronke-blue/80 sm:inline sm:text-sm">
              RONKEVERSE FARM
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/" className="btn-secondary">
              Home
            </Link>
            <ConnectButton />
          </div>
        </nav>

        {/* hero */}
        <header className="flex flex-col items-center gap-4 pt-8 text-center sm:pt-12">
          <div className="pill reveal">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ronke-banana" />
            <span>Live on Saigon testnet · play & earn $NABABA</span>
          </div>
          <h1 className="hero-title reveal font-display text-5xl sm:text-7xl" style={{ animationDelay: "0.1s" }}>
            Ronke Battles
          </h1>
          <p className="reveal max-w-xl text-balance text-base text-ronke-blue/85 sm:text-lg" style={{ animationDelay: "0.25s" }}>
            1v1 card duels. 🍌 beats 🐒 beats 🌴 beats 🍌. Stake <b>RON</b> or <b>USDC</b>, win the pot,
            <br />
            earn <span className="font-semibold text-ronke-banana">$NABABA</span> just for playing.
          </p>
          <p className="reveal max-w-lg text-xs text-ronke-blue/45" style={{ animationDelay: "0.35s" }}>
            Pure skill — your NFT is cosmetic, never a combat advantage. Fair ~50/50. Self-audited contract.
          </p>
        </header>

        <ChainGuard />

        {/* mode toggle: vs House (PvE) o PvP */}
        <div className="reveal flex justify-center" style={{ animationDelay: "0.4s" }}>
          <div className="flex gap-1 rounded-2xl border border-ronke-blue/20 bg-ronke-deep/60 p-1.5">
            <button
              onClick={() => setMode("house")}
              className={`rounded-xl px-5 py-2 text-sm font-bold transition ${mode === "house" ? "bg-ronke-banana text-ronke-deep" : "text-ronke-blue/70 hover:text-white"}`}
            >
              🎰 vs House
            </button>
            <button
              onClick={() => setMode("pvp")}
              className={`rounded-xl px-5 py-2 text-sm font-bold transition ${mode === "pvp" ? "bg-ronke-banana text-ronke-deep" : "text-ronke-blue/70 hover:text-white"}`}
            >
              ⚔️ PvP
            </button>
          </div>
        </div>

        <section className="reveal" style={{ animationDelay: "0.45s" }}>
          {mode === "house" ? <HouseArena /> : <BattleArena />}
        </section>

        {/* how it works */}
        <section className="card reveal p-6" style={{ animationDelay: "0.6s" }}>
          <h2 className="mb-3 font-display text-lg text-ronke-banana">How a duel works</h2>
          <ol className="space-y-2 text-sm text-ronke-blue/80">
            <li><b className="text-white/90">1.</b> Pick your 5 cards (your hand stays secret — committed as a hash).</li>
            <li><b className="text-white/90">2.</b> Create a match with a stake, or join an open one.</li>
            <li><b className="text-white/90">3.</b> Both players reveal. Cards clash round by round, best of 5.</li>
            <li><b className="text-white/90">4.</b> Winner claims the pot minus 6%. Both earn $NABABA.</li>
          </ol>
          <p className="mt-3 text-[11px] text-ronke-blue/45">
            Async &amp; trustless: no need to be online at the same time. If your opponent ghosts the reveal, you win by forfeit.
          </p>
        </section>

        <footer className="reveal mt-auto flex flex-col items-center gap-2 border-t border-ronke-blue/10 pt-6 text-xs text-ronke-blue/50">
          <span>Ronke Battles · Banana Plantations · built with the Ronkeverse 🐒</span>
        </footer>
      </main>
    </div>
  );
}
