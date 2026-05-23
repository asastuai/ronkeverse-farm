"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import {
  contracts,
  farmCoreAbi,
  erc20Abi,
  erc721Abi,
} from "@/lib/contracts";

// ─────────────────────────────────────────────────────────────────────────
//                              SHARED UI
// ─────────────────────────────────────────────────────────────────────────

function Card({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-glow relative rounded-2xl border border-ronke-blue/15 bg-ronke-deep/60 p-6 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-xl">{emoji}</span>
        <h3 className="text-base font-bold text-ronke-banana">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  pending,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || pending}
      className="w-full rounded-xl bg-ronke-blue px-4 py-2.5 text-sm font-semibold text-ronke-deep transition hover:bg-ronke-banana disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Confirming…" : children}
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
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-ronke-blue/30 bg-ronke-deep/40 px-3 py-1.5 text-xs font-medium text-ronke-blue/90 transition hover:bg-ronke-blue/10 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//                              SECTION: Stake $Ronke
// ─────────────────────────────────────────────────────────────────────────

function StakeRonkeCard({ user }: { user: Address }) {
  const [amount, setAmount] = useState("");

  const { data: ronkeBalance } = useReadContract({
    abi: erc20Abi,
    address: contracts.ronkeToken,
    functionName: "balanceOf",
    args: [user],
  });

  const { data: staked, refetch: refetchStaked } = useReadContract({
    abi: farmCoreAbi,
    address: contracts.farmCore,
    functionName: "ronkeStakedOf",
    args: [user],
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: contracts.ronkeToken,
    functionName: "allowance",
    args: [user, contracts.farmCore],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  const amountWei = amount && !isNaN(Number(amount)) ? parseUnits(amount, 18) : 0n;
  const needsApprove = (allowance as bigint | undefined) !== undefined && (allowance as bigint) < amountWei;

  const onApprove = () => {
    writeContract(
      {
        abi: erc20Abi,
        address: contracts.ronkeToken,
        functionName: "approve",
        args: [contracts.farmCore, amountWei],
      },
      { onSuccess: () => setTimeout(() => refetchAllowance(), 1500) }
    );
  };

  const onStake = () => {
    writeContract(
      {
        abi: farmCoreAbi,
        address: contracts.farmCore,
        functionName: "stakeRonke",
        args: [amountWei],
      },
      {
        onSuccess: () => {
          setAmount("");
          setTimeout(() => refetchStaked(), 1500);
        },
      }
    );
  };

  const onUnstake = () => {
    writeContract(
      {
        abi: farmCoreAbi,
        address: contracts.farmCore,
        functionName: "unstakeRonke",
        args: [amountWei],
      },
      {
        onSuccess: () => {
          setAmount("");
          setTimeout(() => refetchStaked(), 1500);
        },
      }
    );
  };

  return (
    <Card title="Stake $Ronke" emoji="🪙">
      <div className="grid grid-cols-2 gap-2 text-xs text-ronke-blue/70">
        <div>
          <div className="opacity-60">Wallet</div>
          <div className="font-semibold text-ronke-banana">
            {ronkeBalance !== undefined
              ? Number(formatUnits(ronkeBalance as bigint, 18)).toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })
              : "—"}
          </div>
        </div>
        <div>
          <div className="opacity-60">Staked</div>
          <div className="font-semibold text-ronke-banana">
            {staked !== undefined
              ? Number(formatUnits(staked as bigint, 18)).toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })
              : "—"}
          </div>
        </div>
      </div>

      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        type="number"
        placeholder="amount"
        className="w-full rounded-lg border border-ronke-blue/20 bg-ronke-deep/60 px-3 py-2 text-sm outline-none focus:border-ronke-blue/60"
      />

      {needsApprove ? (
        <PrimaryButton onClick={onApprove} pending={isPending || isMining} disabled={!amount}>
          Approve $Ronke
        </PrimaryButton>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton onClick={onStake} pending={isPending || isMining} disabled={!amount}>
            Stake
          </PrimaryButton>
          <SecondaryButton onClick={onUnstake} disabled={!amount || isPending}>
            Unstake
          </SecondaryButton>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//                              SECTION: Stake NFTs
// ─────────────────────────────────────────────────────────────────────────

function StakeNFTsCard({ user }: { user: Address }) {
  const [tokenIdInput, setTokenIdInput] = useState("");

  const { data: nftBalance } = useReadContract({
    abi: erc721Abi,
    address: contracts.ronkeverseNFT,
    functionName: "balanceOf",
    args: [user],
  });

  const { data: stakedNFTs, refetch: refetchStakedNFTs } = useReadContract({
    abi: farmCoreAbi,
    address: contracts.farmCore,
    functionName: "stakedNFTsOf",
    args: [user, 0n],
    query: { enabled: false }, // array reads del FarmCore son por índice; usamos otra view
  });

  const { data: approved, refetch: refetchApproved } = useReadContract({
    abi: erc721Abi,
    address: contracts.ronkeverseNFT,
    functionName: "isApprovedForAll",
    args: [user, contracts.farmCore],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining } = useWaitForTransactionReceipt({ hash: txHash });

  const ids = tokenIdInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s));

  const onApprove = () => {
    writeContract(
      {
        abi: erc721Abi,
        address: contracts.ronkeverseNFT,
        functionName: "setApprovalForAll",
        args: [contracts.farmCore, true],
      },
      { onSuccess: () => setTimeout(() => refetchApproved(), 1500) }
    );
  };

  const onStake = () => {
    if (ids.length === 0) return;
    writeContract(
      {
        abi: farmCoreAbi,
        address: contracts.farmCore,
        functionName: "stakeNFTs",
        args: [ids],
      },
      {
        onSuccess: () => {
          setTokenIdInput("");
          setTimeout(() => refetchStakedNFTs(), 1500);
        },
      }
    );
  };

  const onUnstake = () => {
    if (ids.length === 0) return;
    writeContract({
      abi: farmCoreAbi,
      address: contracts.farmCore,
      functionName: "unstakeNFTs",
      args: [ids],
    });
  };

  return (
    <Card title="Stake Ronkeverse NFTs" emoji="🐒">
      <div className="text-xs text-ronke-blue/70">
        Wallet:{" "}
        <span className="font-semibold text-ronke-banana">
          {nftBalance?.toString() ?? "—"}
        </span>{" "}
        NFTs
      </div>

      <input
        value={tokenIdInput}
        onChange={(e) => setTokenIdInput(e.target.value)}
        placeholder="token IDs, e.g.: 12, 345, 1023"
        className="w-full rounded-lg border border-ronke-blue/20 bg-ronke-deep/60 px-3 py-2 text-sm outline-none focus:border-ronke-blue/60"
      />

      {!approved ? (
        <PrimaryButton onClick={onApprove} pending={isPending || isMining}>
          Approve all Ronkeverse
        </PrimaryButton>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton onClick={onStake} pending={isPending || isMining} disabled={ids.length === 0}>
            Stake {ids.length > 0 && `(${ids.length})`}
          </PrimaryButton>
          <SecondaryButton onClick={onUnstake} disabled={ids.length === 0 || isPending}>
            Unstake
          </SecondaryButton>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//                              SECTION: Buy Plantation
// ─────────────────────────────────────────────────────────────────────────

function BuyPlantationCard({ user }: { user: Address }) {
  const [tierId, setTierId] = useState<number>(0);

  const { data: tierCount } = useReadContract({
    abi: farmCoreAbi,
    address: contracts.farmCore,
    functionName: "tierCount",
  });

  const { data: tierData } = useReadContract({
    abi: farmCoreAbi,
    address: contracts.farmCore,
    functionName: "tiers",
    args: [BigInt(tierId)],
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: contracts.ronkeToken,
    functionName: "allowance",
    args: [user, contracts.farmCore],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining } = useWaitForTransactionReceipt({ hash: txHash });

  // tierData es [ronkeCost, baseYieldPerSecond, requiredNFTs, enabled]
  const tier = tierData as readonly [bigint, bigint, number, boolean] | undefined;
  const cost = tier?.[0] ?? 0n;
  const yieldPerSec = tier?.[1] ?? 0n;
  const reqNFTs = tier?.[2] ?? 0;

  const tierLabels = ["Sapling", "Tree", "Forest", "Golden"];

  const needsApprove = (allowance as bigint | undefined) !== undefined && (allowance as bigint) < cost;

  const onApprove = () => {
    writeContract(
      {
        abi: erc20Abi,
        address: contracts.ronkeToken,
        functionName: "approve",
        args: [contracts.farmCore, cost > 0n ? cost : 2n ** 255n],
      },
      { onSuccess: () => setTimeout(() => refetchAllowance(), 1500) }
    );
  };

  const onBuy = () => {
    writeContract({
      abi: farmCoreAbi,
      address: contracts.farmCore,
      functionName: "buyPlantation",
      args: [tierId],
    });
  };

  return (
    <Card title="Buy Plantation" emoji="🌳">
      <div className="flex gap-1.5">
        {Array.from({ length: Number(tierCount ?? 0n) }, (_, i) => i).map((i) => (
          <button
            key={i}
            onClick={() => setTierId(i)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
              tierId === i
                ? "border-ronke-banana bg-ronke-banana/15 text-ronke-banana"
                : "border-ronke-blue/20 bg-ronke-deep/40 text-ronke-blue/70 hover:bg-ronke-blue/10"
            }`}
          >
            {tierLabels[i] ?? `T${i}`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-ronke-blue/70">
        <div>
          <div className="opacity-60">Cost</div>
          <div className="font-semibold text-ronke-banana">
            {Number(formatUnits(cost, 18)).toLocaleString()} $Ronke
          </div>
        </div>
        <div>
          <div className="opacity-60">Base yield</div>
          <div className="font-semibold text-ronke-banana">
            {(Number(formatUnits(yieldPerSec, 18)) * 86400).toFixed(2)} $NABABA/day
          </div>
        </div>
      </div>

      {reqNFTs > 0 && (
        <div className="rounded-lg border border-ronke-banana/30 bg-ronke-banana/5 px-3 py-1.5 text-xs text-ronke-banana/80">
          🐒 Requires {reqNFTs} Ronkeverse NFTs staked
        </div>
      )}

      {needsApprove ? (
        <PrimaryButton onClick={onApprove} pending={isPending || isMining}>
          Approve $Ronke
        </PrimaryButton>
      ) : (
        <PrimaryButton onClick={onBuy} pending={isPending || isMining}>
          Buy {tierLabels[tierId] ?? `T${tierId}`}
        </PrimaryButton>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//                              SECTION: My Plantations
// ─────────────────────────────────────────────────────────────────────────

type Plantation = {
  tierId: number;
  createdAt: bigint;
  lastSettleAt: bigint;
  workers: bigint;
  staminaUntil: bigint;
  accruedNababa: bigint;
  restakeMode: boolean;
};

function PlantationsList({ user }: { user: Address }) {
  const { data: plantations, refetch } = useReadContract({
    abi: farmCoreAbi,
    address: contracts.farmCore,
    functionName: "plantationsOf",
    args: [user],
  });

  const list = (plantations as Plantation[] | undefined) ?? [];

  if (list.length === 0) {
    return (
      <Card title="Your Plantations" emoji="🌱">
        <div className="text-sm text-ronke-blue/60">
          No Plantations yet. Buy one above to start.
        </div>
      </Card>
    );
  }

  return (
    <Card title="Your Plantations" emoji="🌱">
      <div className="space-y-3">
        {list.map((p, i) => (
          <PlantationRow key={i} plantId={i} p={p} user={user} onChange={() => refetch()} />
        ))}
      </div>
    </Card>
  );
}

const TIER_NAMES = ["Sapling", "Tree", "Forest", "Golden"];

function PlantationRow({
  plantId,
  p,
  user,
  onChange,
}: {
  plantId: number;
  p: Plantation;
  user: Address;
  onChange: () => void;
}) {
  const { data: pending, refetch: refetchPending } = useReadContract({
    abi: farmCoreAbi,
    address: contracts.farmCore,
    functionName: "pendingRewards",
    args: [user, BigInt(plantId)],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining } = useWaitForTransactionReceipt({ hash: txHash });

  const handleAction = (fn: string, args: unknown[]) => {
    writeContract(
      {
        abi: farmCoreAbi,
        address: contracts.farmCore,
        functionName: fn,
        args,
      },
      {
        onSuccess: () => {
          setTimeout(() => {
            refetchPending();
            onChange();
          }, 1500);
        },
      }
    );
  };

  const staminaActive = Number(p.staminaUntil) > Date.now() / 1000;
  const staminaHoursLeft = staminaActive
    ? ((Number(p.staminaUntil) - Date.now() / 1000) / 3600).toFixed(1)
    : "0";

  return (
    <div className="rounded-xl border border-ronke-blue/15 bg-ronke-deep/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-ronke-banana">
            #{plantId} · {TIER_NAMES[p.tierId] ?? `T${p.tierId}`}
          </span>
          {p.restakeMode && (
            <span className="rounded-md bg-ronke-banana/20 px-1.5 py-0.5 text-[10px] font-semibold text-ronke-banana">
              RESTAKE MODE
            </span>
          )}
        </div>
        <div className="text-xs text-ronke-blue/60">
          {staminaActive ? `⚡ ${staminaHoursLeft}h stamina` : "💤 needs feed"}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="opacity-60">Workers</div>
          <div className="font-semibold">{p.workers.toString()}</div>
        </div>
        <div>
          <div className="opacity-60">Pending</div>
          <div className="font-semibold text-ronke-banana">
            {pending !== undefined
              ? Number(formatUnits(pending as bigint, 18)).toFixed(4)
              : "—"}{" "}
            🍌
          </div>
        </div>
        <div>
          <div className="opacity-60">Age</div>
          <div className="font-semibold">
            {((Date.now() / 1000 - Number(p.createdAt)) / 86400).toFixed(1)}d
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <SecondaryButton
          onClick={() => handleAction("hireWorkers", [BigInt(plantId), 1n])}
          disabled={isPending || isMining}
        >
          +1 Worker
        </SecondaryButton>
        <SecondaryButton
          onClick={() => handleAction("feedWorkers", [BigInt(plantId)])}
          disabled={isPending || isMining || p.workers === 0n}
        >
          🍌 Feed
        </SecondaryButton>
        <SecondaryButton
          onClick={() => handleAction("claim", [BigInt(plantId)])}
          disabled={isPending || isMining}
        >
          💰 Claim
        </SecondaryButton>
        <SecondaryButton
          onClick={() => handleAction("restake", [BigInt(plantId)])}
          disabled={isPending || isMining}
        >
          🔁 Restake
        </SecondaryButton>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//                              ROOT
// ─────────────────────────────────────────────────────────────────────────

export function FarmDashboard() {
  const { address } = useAccount();
  if (!address) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <StakeRonkeCard user={address} />
      <StakeNFTsCard user={address} />
      <BuyPlantationCard user={address} />
      <div className="md:col-span-2 lg:col-span-3">
        <PlantationsList user={address} />
      </div>
    </div>
  );
}
