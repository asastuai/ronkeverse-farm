"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function shorten(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button onClick={() => disconnect()} className="btn-secondary">
        <span className="font-mono">{shorten(address)}</span>
        <span className="ml-2 opacity-60">· disconnect</span>
      </button>
    );
  }

  const connector = connectors[0];
  return (
    <button
      onClick={() => connector && connect({ connector })}
      disabled={isPending || !connector}
      className="btn-primary"
    >
      {isPending ? "Connecting…" : "Connect Ronin Wallet"}
    </button>
  );
}
