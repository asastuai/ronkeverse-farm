# Ronkeverse Farm — Banana Plantations

Farm game on-chain en Ronin para la comunidad Ronkeverse. Inputs: NFT Ronkeverse + $Ronke. Output: $NABABA (el fruto sagrado del Ronkeverse — banana en idioma Monke).

## Activos existentes en Ronin mainnet

| Asset | Address | Tipo | Supply |
|---|---|---|---|
| Ronkeverse NFT | `0x810b6d1374ac7ba0e83612e7d49f49a13f1de019` | ERC-721 | 6969 |
| $Ronke (Ronin Monke) | `0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb` | ERC-20 | 1B |

## Loop principal

1. Comprás Plantations con $Ronke (sink #1)
2. Hire Workers con $Ronke o $NABABA → producen $NABABA pasivo
3. Workers tienen stamina → feed con bananas (sink #2)
4. Stake Ronkeverse NFT → Monke Helpers auto-cosechan (QoL premium)
5. Stake $Ronke → boost APR hasta 2x

## Capas nuevas vs Ronke Rice Farmers

- **Auto-restake on-chain**: claim+restake en una tx con APR boost permanente
- **Golden Plantations**: tier exclusivo NFT-gated con 2x-3x APR
- **Banana Jail**: penalty progresivo al early withdraw, redistribuye al pool restakers

## Seasonal

- 69 días por temporada (chiste 6969)
- Top 10% leaderboard → airdrop $Ronke real del treasury

## Stack

- **Contratos**: Foundry + Solidity ^0.8.24, Ronin EVM (Saigon testnet → mainnet)
- **Frontend**: Next.js + wagmi + viem + Ronin Wallet/Waypoint connector
- **Indexer**: Ponder (TBD)

## Estructura

```
ronkeverse-farm/
├── contracts/   # Solidity contracts (Foundry)
└── app/         # Next.js dApp
```

## Setup

```bash
# Una sola vez: instalar Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Deps
pnpm install

# Contratos
cd contracts && forge install && forge build && forge test

# App
cd app && pnpm dev
```

## Status

🚧 WIP — bootstrap inicial.
