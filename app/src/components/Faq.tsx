"use client";

import { useState } from "react";

type FaqItem = {
  q: string;
  a: React.ReactNode;
};

const FAQS: FaqItem[] = [
  {
    q: "What is Banana Plantations?",
    a: (
      <>
        A farm game on the Ronin blockchain, native to the Ronkeverse universe.
        Players stake their Ronkeverse NFT and $Ronke, plant Plantations, hire
        Workers, and harvest <b>$NABABA</b> — the sacred fruit of the Ronkeverse
        (banana in Monke language).
      </>
    ),
  },
  {
    q: "How does the pool emission work?",
    a: (
      <>
        Every farm globally shares one pool of $NABABA emission per second.
        Your share = (your active workers / total active workers) × pool rate ×
        (1 + your boosts). More farmers entering means each one gets a smaller
        slice. Early farmers earn the most.
      </>
    ),
  },
  {
    q: "Do I need a Ronkeverse NFT to play?",
    a: (
      <>
        No, anyone with $Ronke can play. But staking Ronkeverse NFTs gives you
        a linear bonus: <b>+4% per staked NFT</b>, capped at 10 NFTs (=
        +40%). It also unlocks the exclusive Golden Plantation tier (requires
        3+ staked).
      </>
    ),
  },
  {
    q: "What's $NABABA?",
    a: (
      <>
        $NABABA is the reward token of the farm. ERC-20, capped at 100M total
        supply, only mintable by the FarmCore contract. Used to feed workers,
        pay restake fees, and earned through farming. Palindrome on purpose
        (because we like the joke).
      </>
    ),
  },
  {
    q: "What are Workers and Stamina?",
    a: (
      <>
        Workers are your farm hands. They produce $NABABA but also eat it —
        each Worker needs to be fed ~25% of its output to stay alive. Stamina
        lasts 6 hours per cycle. No feed, no work, no rewards. This creates a
        real economic loop.
      </>
    ),
  },
  {
    q: "How is this different from Ronke Rice Farmers?",
    a: (
      <>
        Same spirit (it's a farm game for the Ronkeverse), but the mechanics go
        deeper. The 3 new layers:
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>
            <b>Auto-restake on-chain</b>: claim + restake in one tx with a
            permanent APR boost
          </li>
          <li>
            <b>Golden Plantations</b>: NFT-gated tier with the highest worker
            cap, exclusive to Ronkeverse holders
          </li>
          <li>
            <b>Pool emission model</b>: shared global pool instead of
            per-plantation APR — more strategic, more competitive
          </li>
        </ul>
      </>
    ),
  },
  {
    q: "How are tokenomics decided?",
    a: (
      <>
        By the community. Numbers (pool emission size, feed ratio, stamina
        length, jail penalty curve, OG airdrop) are decided through a public
        RFC + Snapshot vote before mainnet deploy. Anything we set on day 1 can
        still be adjusted via community proposal — the contracts are designed
        to be parameter-adjustable.
      </>
    ),
  },
  {
    q: "What's the Jeet Jail?",
    a: (
      <>
        An anti-paperhand mechanic. If you claim early (less than 7 days from
        when your plantation was created), 50% of your claim is confiscated.
        7–30 days: 25%. 30–69 days: 10%. After 69 days: zero penalty. The
        confiscated portion goes to the faithful-farmer pool. Or you skip the
        penalty entirely by entering restake mode.
      </>
    ),
  },
  {
    q: "Will the contracts be audited?",
    a: (
      <>
        Yes, before mainnet launch. For Saigon testnet (where we'll do the
        community playtests), we'll run the existing test suite (7/7 passing
        currently) and invite community review. The code is public on{" "}
        <a
          href="https://github.com/asastuai/ronkeverse-farm"
          target="_blank"
          rel="noreferrer"
          className="text-ronke-banana underline hover:text-ronke-bananaSoft"
        >
          GitHub
        </a>{" "}
        — open audit at any time.
      </>
    ),
  },
  {
    q: "When does it launch?",
    a: (
      <>
        Depends on the community. Roadmap:
        <ol className="mt-2 ml-4 list-decimal space-y-1">
          <li>Tokenomics RFC discussion + Snapshot vote</li>
          <li>Saigon testnet deploy (playtest with the community)</li>
          <li>Final adjustments + audit pass</li>
          <li>Mainnet launch · Season 1 (69 days)</li>
        </ol>
        No date pressure. We launch when it's right.
      </>
    ),
  },
  {
    q: "How can I contribute?",
    a: (
      <>
        Several ways: comment on the tokenomics RFC, play the demo and share
        feedback, contribute code on{" "}
        <a
          href="https://github.com/asastuai/ronkeverse-farm"
          target="_blank"
          rel="noreferrer"
          className="text-ronke-banana underline hover:text-ronke-bananaSoft"
        >
          GitHub
        </a>
        , help with art/animation if you have skills, or just spread the word.
        This is by us, for us.
      </>
    ),
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      {FAQS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className="card overflow-hidden p-0 transition"
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-ronke-blue/5"
            >
              <span className="font-display text-sm font-bold text-ronke-banana sm:text-base">
                {item.q}
              </span>
              <span
                className={`text-xl text-ronke-blue/60 transition-transform ${
                  isOpen ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-ronke-blue/10 px-5 py-4 text-sm leading-relaxed text-ronke-blue/85">
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
