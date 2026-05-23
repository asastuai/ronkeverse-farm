import Link from "next/link";
import { RonkeCollage } from "@/components/RonkeCollage";
import { Faq } from "@/components/Faq";

export const metadata = {
  title: "About — Banana Plantations",
  description:
    "Banana Plantations is a community-built farm game on Ronin, native to the Ronkeverse universe. Read our story, the model, the FAQ.",
};

export default function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <RonkeCollage />
      <div className="glow-blue pointer-events-none absolute inset-0" />
      <div className="glow-banana pointer-events-none absolute inset-0" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col gap-12 px-4 py-8 sm:gap-16 sm:px-6 sm:py-12">
        {/* nav */}
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <img src="/ronke.svg" alt="Ronke" className="h-8 w-8 sm:h-10 sm:w-10" />
            <span className="text-xs font-semibold tracking-wide text-ronke-blue/80 sm:text-sm">
              RONKEVERSE FARM
            </span>
          </Link>
          <Link href="/" className="btn-secondary">
            ← back to farm
          </Link>
        </nav>

        {/* hero */}
        <header className="reveal text-center" style={{ animationDelay: "0.05s" }}>
          <div className="pill mx-auto inline-flex">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ronke-banana" />
            <span>About the project</span>
          </div>
          <h1
            className="hero-title reveal mx-auto mt-6 font-display text-4xl sm:text-6xl"
            style={{ animationDelay: "0.15s" }}
          >
            With the Ronkeverse,
            <br />
            for the Ronkeverse.
          </h1>
          <p
            className="reveal mx-auto mt-6 max-w-2xl text-balance text-base text-ronke-blue/80 sm:text-lg"
            style={{ animationDelay: "0.3s" }}
          >
            Banana Plantations is a farm game built natively for the Ronkeverse
            community on Ronin. The mechanics are real, the brand is ours, the
            tokenomics are decided together.
          </p>
        </header>

        {/* The Spirit */}
        <section className="reveal" style={{ animationDelay: "0.45s" }}>
          <SectionTitle emoji="🐒" title="The spirit" />
          <div className="card space-y-4 p-6 text-sm leading-relaxed text-ronke-blue/85 sm:text-base sm:p-8">
            <p>
              The Ronkeverse is a small, tight community. <b>18 active NFT holders.</b>
              {" "}
              <b>56 token holders.</b>{" "}
              That's the whole magic of it. We're not chasing volume — we're building
              something the original Ronke fam can actually feel proud of.
            </p>
            <p>
              Ronke Rice Farmers was the first farm game for this community. It planted
              the seed (literally). Banana Plantations is the next chapter — same
              spirit, deeper mechanics, brand we want to take care of.
            </p>
            <p>
              No corporate roadmap, no fake KOL hype, no rushed launch. We launch when
              it's right. Until then, we cook in public.
            </p>
          </div>
        </section>

        {/* The Game */}
        <section className="reveal" style={{ animationDelay: "0.55s" }}>
          <SectionTitle emoji="🍌" title="The game in 30 seconds" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Step
              num="1"
              title="Stake"
              body="Lock your Ronkeverse NFTs + $Ronke. Both compound into a per-user boost on your output."
            />
            <Step
              num="2"
              title="Plant + Hire"
              body="Buy a Plantation tier with $Ronke. Hire Workers. They compete in a global $NABABA pool."
            />
            <Step
              num="3"
              title="Harvest"
              body="Feed workers, claim rewards, restake to compound. Skip the jeet jail by playing long."
            />
          </div>
        </section>

        {/* The Tokenomics */}
        <section className="reveal" style={{ animationDelay: "0.65s" }}>
          <SectionTitle emoji="📊" title="The tokenomics (community-decided)" />
          <div className="card p-6 sm:p-8">
            <p className="text-sm leading-relaxed text-ronke-blue/85 sm:text-base">
              Numbers are decided by the community. The current model + open
              questions live in the public RFC. Final values get a Snapshot vote
              before mainnet, and the contracts are parameter-adjustable post-launch.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Bullet>
                Pool emission rate (placeholder: 1,000 $NABABA/hour)
              </Bullet>
              <Bullet>NFT boost curve (linear +4%, cap 10 NFTs)</Bullet>
              <Bullet>Worker stamina + feed economics</Bullet>
              <Bullet>Jeet jail penalty curve</Bullet>
              <Bullet>Season duration (69 days, the 6969 meme)</Bullet>
              <Bullet>OG airdrop to current holders</Bullet>
            </div>
            <div className="mt-6">
              <a
                href="https://github.com/asastuai/ronkeverse-farm/blob/main/docs/community-tokenomics-rfc.md"
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
              >
                Read the full RFC →
              </a>
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section className="reveal" style={{ animationDelay: "0.75s" }}>
          <SectionTitle emoji="🗺️" title="Roadmap" />
          <div className="card p-6 sm:p-8">
            <ul className="space-y-3 text-sm leading-relaxed sm:text-base">
              <Phase done label="Phase 0 · Foundation">
                Smart contracts written + tested (7/7 passing). dApp scaffolded.
                Demo live in browser. Tokenomics RFC opened to the community.
              </Phase>
              <Phase active label="Phase 1 · Community input">
                Tokenomics discussion in Discord. Snapshot vote on key
                parameters. Visual artist onboarding for character animations.
              </Phase>
              <Phase label="Phase 2 · Testnet">
                Deploy to Saigon testnet. Public playtest with the Ronkeverse
                fam. Iterate on feedback.
              </Phase>
              <Phase label="Phase 3 · Audit">
                Final code freeze + audit (community + external). OG airdrop
                snapshot.
              </Phase>
              <Phase label="Phase 4 · Mainnet · Season 1">
                Launch on Ronin mainnet. 69-day Season 1. Leaderboard rewards
                + Banana Bonanza events throughout the season.
              </Phase>
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="reveal" style={{ animationDelay: "0.85s" }}>
          <SectionTitle emoji="❓" title="Frequently asked questions" />
          <Faq />
        </section>

        {/* Contribute / Build */}
        <section className="reveal" style={{ animationDelay: "0.95s" }}>
          <SectionTitle emoji="🛠️" title="Built in public" />
          <div className="card p-6 sm:p-8">
            <p className="text-sm leading-relaxed text-ronke-blue/85 sm:text-base">
              Code, RFC, and demo all open. No closed Discord, no privileged
              KOL allocations, no hidden roadmap. If you want to jump in:
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="https://github.com/asastuai/ronkeverse-farm"
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
              >
                ⭐ GitHub
              </a>
              <a
                href="https://ronkeverse.com"
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                Ronkeverse.com
              </a>
              <a
                href="https://marketplace.roninchain.com/collections/0x810b6d1374ac7ba0e83612e7d49f49a13f1de019"
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                Mint a Ronke
              </a>
              <a
                href="https://x.com/ronkeonron"
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                @RonkeOnRon
              </a>
            </div>
          </div>
        </section>

        {/* footer */}
        <footer className="reveal mt-auto flex flex-col items-center gap-3 border-t border-ronke-blue/10 pt-8 text-xs text-ronke-blue/50" style={{ animationDelay: "1.05s" }}>
          <div className="opacity-60">
            🍌 Built with the Ronkeverse community · Banana Plantations · v0.0.1
          </div>
        </footer>
      </main>
    </div>
  );
}

function SectionTitle({ emoji, title }: { emoji: string; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="text-2xl">{emoji}</span>
      <h2 className="font-display text-2xl font-bold tracking-tight text-white/95">
        {title}
      </h2>
      <div className="section-divider flex-1" />
    </div>
  );
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3">
        <span className="font-display text-3xl font-black text-ronke-banana">
          {num}
        </span>
        <h3 className="font-display text-lg font-bold text-white/95">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ronke-blue/75">{body}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-ronke-blue/15 bg-ronke-deeper/40 px-3 py-2 text-xs text-ronke-blue/80 sm:text-sm">
      <span className="text-ronke-banana">▸</span>
      <span>{children}</span>
    </div>
  );
}

function Phase({
  done,
  active,
  label,
  children,
}: {
  done?: boolean;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const icon = done ? "✅" : active ? "⧗" : "○";
  const labelColor = done
    ? "text-ronke-blue/70"
    : active
      ? "text-ronke-banana"
      : "text-ronke-blue/50";
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 text-lg">{icon}</span>
      <div className="flex-1">
        <div className={`font-display font-bold ${labelColor}`}>{label}</div>
        <div className="mt-0.5 text-ronke-blue/70">{children}</div>
      </div>
    </li>
  );
}
