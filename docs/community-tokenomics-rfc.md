# 🍌 Banana Plantations — Tokenomics RFC v2

> A farm game on Ronin, built **with and for** the Ronkeverse community.
> Before we ship anything to mainnet, the economics need your input.
> This doc has the current model + the open questions we want you to vote on.

---

## TL;DR

- **Stake**: Ronkeverse NFT + $Ronke
- **Earn**: $NABABA (the sacred fruit of the Ronkeverse · banana in Monke language)
- **Model**: shared global pool. All workers compete for the same emission per second.
- **Mechanics**: Plantations, Workers, Stamina, Auto-Restake, Jeet Jail
- **Try it**: demo mode live in-browser (no chain, no wallet needed)

---

## How the farm works (current spec)

### 🌊 One shared pool

The farm emits a fixed amount of $NABABA per hour. **All active workers globally split that pool.**
More farmers entering means each one gets a smaller slice. Early farmers earn more.

```
your output per second = (your active workers / total active workers) × pool rate × (1 + boosts)
```

### 🌳 Plantations (tiers only define cost + worker cap)

| Tier      | Buy cost      | Max workers |
|-----------|---------------|-------------|
| Sapling   | 50 $Ronke     | 3           |
| Tree      | 250 $Ronke    | 5           |
| Forest    | 1,000 $Ronke  | 10          |
| Golden    | requires 3 staked Ronkeverse | 15 |

### 👷 Workers + stamina

- Hire workers: **10 $Ronke each**
- Workers have stamina that lasts **6 hours**
- After stamina runs out, they stop counting in the pool (zero rewards) until fed
- Feed cost: **500 $NABABA per worker per cycle** (target ~25% of what they produce)
- No feed, no work, no rewards

### 🐒 NFT bonus (linear, capped)

- **+4% per staked Ronkeverse**, capped at **10 NFTs = +40% max**
- Linear curve so every staker matters, no whale escape

### 🪙 Token bonus

- **+1% per 1,000 $Ronke staked**, capped at **+30%**
- Stacks with NFT bonus

### 🔁 Auto-restake

- Claim + restake in one tx
- Permanent +20% APR boost while in restake mode
- Skip jeet jail penalty
- 2% fee on the restaked amount (goes to a faithful-farmer pool)

### 🚓 Jeet Jail (anti early-withdraw)

| Time since plantation created | Claim penalty |
|-------------------------------|---------------|
| < 7 days                      | 50%           |
| 7–30 days                     | 25%           |
| 30–69 days                    | 10%           |
| ≥ 69 days                     | 0%            |

Confiscated portion goes to the restakers pool (to be distributed in v1.1).

---

## Open questions for the community

This is where we want **your** vote. Nothing is locked. Final numbers go into a Snapshot vote, then into the contracts.

### 💧 1. Pool emission size

**How much $NABABA should the pool emit per hour total?**

The current placeholder is **1,000 $NABABA/hour** (~24,000/day, ~720,000/month).

- [ ] 500/hour (more scarcity, slower payouts)
- [ ] 1,000/hour (current placeholder)
- [ ] 2,500/hour (faster economy, riskier)
- [ ] 5,000/hour (degen mode)
- [ ] Other: ___

Consider: $NABABA is capped at **100M total supply**. Higher emission burns supply faster.

### 🍌 2. Worker feed economics

**Workers produce $NABABA but consume some as feed. Current ratio is ~25% (worker produces ~2,000 NABABA in 6h, feed costs 500).**

- [ ] 10% feed cost (workers are very profitable, easy mode)
- [ ] 25% feed cost (current, balanced)
- [ ] 40% feed cost (real strategy, must plan)
- [ ] Dynamic ratio based on output (auto-balances forever)

### ⏱️ 3. Worker stamina length

- [ ] 3 hours (fast cycles, more attention)
- [ ] 6 hours (current, fits a typical work session)
- [ ] 12 hours (chill mode, feed once a day)
- [ ] 24 hours (set-and-forget)

### 📅 4. Season duration

- [ ] 69 days (current, the 6969 meme)
- [ ] 42 days (faster cycles, more events)
- [ ] 90 days (longer-form play)

### 🎁 5. OG airdrop to current Ronkeverse holders

**Should we airdrop $NABABA to current holders as a thank-you?**

- [ ] Yes — snapshot now, direct send
- [ ] Yes — snapshot now + 30-day claim window
- [ ] Yes — proportional to number of NFTs held
- [ ] No — everyone starts equal

If yes, **how much of the supply?**
- [ ] 2% (~2M NABABA across 18 holders)
- [ ] 5% (~5M NABABA)
- [ ] 10% (~10M NABABA)

### 🔥 6. Jeet jail penalty: where does it go?

Current spec: penalty goes to a faithful-farmer pool (restakers). But there are other options.

- [ ] To restakers (current spec)
- [ ] Burned (deflationary)
- [ ] To treasury (project sustainability)
- [ ] Split: 50% restakers + 50% burn

### 🏆 7. Seasonal end-of-season rewards

At the end of each 69-day season, top farmers get bonus rewards.

- [ ] Top 10% of leaderboard gets airdrop of real $Ronke from treasury
- [ ] Top 21 (Ronkeverse meme) get tiered rewards
- [ ] Top 100 with rank-based tiers
- [ ] No leaderboard rewards (clean reset)

### 🔧 8. Anyone-can-clean stamina expiration

If a player lets their workers' stamina expire and doesn't clean up, those workers keep "counted" in the pool, slightly diluting rewards for everyone else.

Anyone can call `expireStamina(user, plantId)` to clean it up. Should we reward cleaners?

- [ ] No — just let it be, eventually everyone settles
- [ ] Small NABABA bounty (~5% of the expired plantation's pending)
- [ ] Higher bounty (~20%) — incentive to run keeper bots
- [ ] Treasury auto-runs a keeper for everyone

---

## How we decide

1. **This thread**: discuss for a few days
2. **Demo**: anyone can play with the mechanics in-browser to feel the economy
3. **Snapshot vote**: weighted by Ronkeverse held
4. **Contracts**: final numbers cabled in before mainnet deploy
5. **Post-launch**: numbers can still be adjusted via community proposal — nothing is permanent

---

## Links

- Demo: *deploying public URL this week*
- Contracts: *GitHub link coming*
- Original Ronke Rice Farmers: [docs](https://ronke-rice-farmers.gitbook.io/landing-page) (for reference)

---

*Living doc — updated with community feedback before deploy.*
