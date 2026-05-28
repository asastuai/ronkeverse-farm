"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { activeChain } from "@/lib/chains";

/**
 * Shows a warning banner + switch button when the connected wallet is on the wrong chain.
 * Prevents users from accidentally transacting on mainnet when the app expects Saigon (or vice versa).
 */
export function ChainGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) return null;
  if (chainId === activeChain.id) return null;

  return (
    <div className="reveal rounded-2xl border-2 border-red-500/50 bg-red-500/10 p-4 backdrop-blur">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="text-sm">
            <div className="font-bold text-red-300">Wrong network</div>
            <div className="mt-1 text-red-200/80">
              Your wallet is on chain <code className="rounded bg-red-950/40 px-1.5 py-0.5">{chainId}</code>.
              This dApp lives on <b>{activeChain.name}</b> (chain {activeChain.id}). Switch to keep playing.
            </div>
          </div>
        </div>
        <button
          onClick={() => switchChain({ chainId: activeChain.id })}
          disabled={isPending}
          className="btn-primary"
        >
          {isPending ? "Switching…" : `Switch to ${activeChain.name}`}
        </button>
      </div>
    </div>
  );
}
