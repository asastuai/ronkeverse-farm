"use client";

import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { RonkeCollage } from "@/components/RonkeCollage";
import { RonkeWorkScene } from "@/components/RonkeWorkScene";
import { FarmDashboard } from "@/components/farm/FarmDashboard";
import { DemoFarmDashboard } from "@/components/farm/DemoFarmDashboard";
import { contracts, erc20Abi, erc721Abi, isContractsDeployed } from "@/lib/contracts";
import { activeChain } from "@/lib/chains";
import { formatUnits } from "viem";

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function Home() {
  const { address, isConnected } = useAccount();

  const { data: nftBalance } = useReadContract({
    abi: erc721Abi,
    address: contracts.ronkeverseNFT,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: ronkeBalance } = useReadContract({
    abi: erc20Abi,
    address: contracts.ronkeToken,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* fondo: collage real de Ronkes */}
      <RonkeCollage />
      <div className="glow-blue pointer-events-none absolute inset-0" />
      <div className="glow-banana pointer-events-none absolute inset-0" />

      {/* bananas decorativas flotando */}
      <img
        src="/banana.svg"
        alt=""
        className="float-banana pointer-events-none absolute right-12 top-32 h-20 w-20 opacity-60"
      />
      <img
        src="/banana.svg"
        alt=""
        className="float-banana pointer-events-none absolute left-10 top-[55%] h-14 w-14 opacity-40"
        style={{ animationDelay: "2s" }}
      />
      <img
        src="/banana.svg"
        alt=""
        className="float-banana pointer-events-none absolute right-[30%] bottom-20 h-12 w-12 opacity-30"
        style={{ animationDelay: "4s" }}
      />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-6 sm:gap-12 sm:px-6 sm:py-10">
        {/* nav */}
        <nav className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src="/ronke.svg" alt="Ronke" className="h-8 w-8 sm:h-10 sm:w-10" />
            <span className="text-xs font-semibold tracking-wide text-ronke-blue/80 sm:text-sm">
              RONKEVERSE FARM
            </span>
          </div>
          <ConnectButton />
        </nav>

        {/* hero */}
        <header className="relative flex flex-col items-center gap-6 pt-12 text-center sm:pt-20">
          {/* decorative sparkles around hero */}
          <span className="sparkle" style={{ top: "12%", left: "8%", animationDelay: "0s" }} />
          <span className="sparkle" style={{ top: "8%", right: "12%", animationDelay: "1.2s" }} />
          <span className="sparkle" style={{ top: "55%", left: "4%", animationDelay: "2.5s" }} />
          <span className="sparkle" style={{ top: "70%", right: "6%", animationDelay: "0.8s" }} />
          <span className="sparkle" style={{ top: "30%", right: "18%", animationDelay: "3.2s" }} />

          <div className="pill reveal" style={{ animationDelay: "0.05s" }}>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ronke-banana" />
            <span>Season 0 · Coming soon to {activeChain.name}</span>
          </div>

          <h1
            className="hero-title reveal font-display text-5xl sm:text-8xl"
            style={{ animationDelay: "0.15s" }}
          >
            Banana
            <br />
            Plantations
          </h1>

          <p
            className="reveal max-w-xl text-balance text-base text-ronke-blue/85 sm:text-lg"
            style={{ animationDelay: "0.3s" }}
          >
            Stake your Ronkeverse and $Ronke. Plant. Harvest <span className="text-ronke-banana font-semibold">$NABABA</span>.
            <br />
            <span className="text-ronke-blue/55 italic">
              The sacred fruit of the Ronkeverse · banana in Monke language.
            </span>
          </p>

          {!isConnected && !isDemoMode && (
            <div className="reveal mt-2" style={{ animationDelay: "0.45s" }}>
              <ConnectButton />
            </div>
          )}
        </header>

        {/* RONKE WORK SCENE — circuito visual animado */}
        <section className="reveal" style={{ animationDelay: "0.55s" }}>
          <RonkeWorkScene />
        </section>

        {/* stats (solo si conectado) */}
        {isConnected && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard
              emoji="🐒"
              label="Ronkeverse"
              value={nftBalance?.toString() ?? "—"}
              suffix="NFTs"
            />
            <StatCard
              emoji="🪙"
              label="$Ronke"
              value={
                ronkeBalance !== undefined
                  ? Number(formatUnits(ronkeBalance, 18)).toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })
                  : "—"
              }
              suffix="RONKE"
            />
            <StatCard
              emoji="🍌"
              label="$NABABA"
              value="—"
              suffix="NABABA"
              hint={isContractsDeployed ? "see plantations below" : "Deploy pending"}
            />
          </section>
        )}

        {/* Demo Mode dashboard (NO requiere wallet) */}
        {isDemoMode && (
          <section>
            <h2 className="mb-4 text-xl font-bold text-ronke-banana">🌾 Your Farm</h2>
            <DemoFarmDashboard />
          </section>
        )}

        {/* Farm dashboard real (cuando contratos están deployados) */}
        {!isDemoMode && isConnected && isContractsDeployed && (
          <section>
            <h2 className="mb-4 text-xl font-bold text-ronke-banana">🌾 Your Farm</h2>
            <FarmDashboard />
          </section>
        )}

        {!isDemoMode && isConnected && !isContractsDeployed && (
          <section className="rounded-2xl border border-ronke-banana/30 bg-ronke-banana/5 p-6 text-sm text-ronke-banana/90 backdrop-blur">
            🚧 Contracts not deployed yet. Set <code className="rounded bg-ronke-deep px-1.5 py-0.5 text-xs">NEXT_PUBLIC_FARM_CORE</code> and <code className="rounded bg-ronke-deep px-1.5 py-0.5 text-xs">NEXT_PUBLIC_NABABA_TOKEN</code> in <code className="rounded bg-ronke-deep px-1.5 py-0.5 text-xs">.env.local</code> after Saigon deploy.
          </section>
        )}

        {/* feature cards */}
        <section>
          <div className="reveal mb-5 flex items-center gap-3" style={{ animationDelay: "0.7s" }}>
            <h2 className="text-2xl font-bold tracking-tight text-white/90">Core mechanics</h2>
            <div className="section-divider flex-1" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FeatureCard
              emoji="🌳"
              title="Plantations"
              body="Buy tiers with $Ronke. Higher tier, more workers, bigger share of the pool. Golden Plantations exclusive for Ronkeverse holders."
              delay="0.75s"
            />
            <FeatureCard
              emoji="👷"
              title="Workers + Stamina"
              body="Hire Workers that compete for the global $NABABA pool. Feed them with bananas to keep them alive."
              delay="0.85s"
            />
            <FeatureCard
              emoji="🔁"
              title="Auto-Restake"
              body="Claim + restake in one tx. Permanent APR boost while in restake mode. No wallet roundtrip."
              delay="0.95s"
            />
          </div>
        </section>

        {/* roadmap */}
        <section className="card reveal p-8" style={{ animationDelay: "1.05s" }}>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-bold text-ronke-banana">🗺️ Roadmap</h2>
            <div className="section-divider flex-1" />
          </div>
          <ul className="mt-5 space-y-2.5 text-sm">
            <RoadmapItem done>Repo bootstrap · Foundry + Next.js</RoadmapItem>
            <RoadmapItem done>$NABABA token (ERC-20 capped) · compiled</RoadmapItem>
            <RoadmapItem done>FarmCore monolith · pool-based emission · tests passing</RoadmapItem>
            <RoadmapItem active>
              Tokenomics RFC open to the community ·{" "}
              <span className="text-ronke-banana">docs/community-tokenomics-rfc.md</span>
            </RoadmapItem>
            <RoadmapItem>Deploy to Saigon testnet</RoadmapItem>
            <RoadmapItem>Full Farm UI · stake · claim · restake</RoadmapItem>
            <RoadmapItem>Mainnet launch · Season 1 (69 days)</RoadmapItem>
          </ul>
        </section>

        {/* footer */}
        <footer className="reveal mt-auto flex flex-col items-center gap-3 border-t border-ronke-blue/10 pt-8 text-xs text-ronke-blue/50" style={{ animationDelay: "1.2s" }}>
          <div className="flex items-center gap-4">
            <a
              href="https://ronkeverse.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ronke-banana"
            >
              ronkeverse.com
            </a>
            <span className="opacity-30">·</span>
            <a
              href="https://x.com/ronkeonron"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ronke-banana"
            >
              @RonkeOnRon
            </a>
            <span className="opacity-30">·</span>
            <a
              href="https://marketplace.roninchain.com/collections/0x810b6d1374ac7ba0e83612e7d49f49a13f1de019"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ronke-banana"
            >
              Marketplace
            </a>
          </div>
          <div className="opacity-60">
            🍌 Built with the Ronkeverse community · Banana Plantations · v0.0.1
          </div>
        </footer>
      </main>
    </div>
  );
}

function StatCard({
  emoji,
  label,
  value,
  suffix,
  hint,
}: {
  emoji: string;
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ronke-blue/70">
          {label}
        </span>
        <span className="text-2xl">{emoji}</span>
      </div>
      <div className="mt-3 font-display text-3xl font-black text-ronke-banana">
        {value}
        {suffix && <span className="ml-2 text-sm font-medium text-ronke-blue/60">{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-ronke-blue/50">{hint}</div>}
    </div>
  );
}

function FeatureCard({
  emoji,
  title,
  body,
  delay = "0s",
}: {
  emoji: string;
  title: string;
  body: string;
  delay?: string;
}) {
  return (
    <div className="card reveal p-6" style={{ animationDelay: delay }}>
      <div className="text-3xl">{emoji}</div>
      <h3 className="mt-3 font-display text-lg font-bold text-ronke-banana">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ronke-blue/70">{body}</p>
    </div>
  );
}

function RoadmapItem({
  children,
  done,
  active,
}: {
  children: React.ReactNode;
  done?: boolean;
  active?: boolean;
}) {
  const icon = done ? "✅" : active ? "⧗" : "○";
  const color = done
    ? "text-ronke-blue/60"
    : active
      ? "text-ronke-banana"
      : "text-ronke-blue/40";
  return (
    <li className={`flex items-start gap-3 ${color}`}>
      <span className="mt-0.5 text-base">{icon}</span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
