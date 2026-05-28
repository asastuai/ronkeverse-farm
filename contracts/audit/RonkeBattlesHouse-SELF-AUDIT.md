# RonkeBattlesHouse (PvE) — Self-Audit Report

**Contrato**: `src/RonkeBattlesHouse.sol`
**Fecha**: 2026-05-28
**Auditor**: self-audit (protocolo master doc §15). NO es audit profesional.
**Coverage**: **100% líneas / 100% funcs / 99% statements / 95.5% branches** (43 tests, Foundry)

> Las 2 ramas restantes (líneas 219, 296) son artefactos del contador de Foundry sobre una condición `&&` compuesta y una comparación de enum — ambas están cubiertas lógicamente (se testea el revert y el no-revert de cada una).

> Disclosure: auto-auditado, no por firma profesional. Caps + provably-fair + pull-payment minimizan el blast radius. Bug bounty post-deploy.

---

## 1. Modelo económico (decidido con Juan, 2026-05-28)

- **Win paga 2.0x** (doblás). El edge NO viene de pagar poco.
- **Empates: 30% a la casa / 70% refund** (provably-fair, derivado del seed) → de acá sale el house edge.
- **House edge ≈ 6%**.
- Por mano: ~40% gana (2x) · ~46% pierde · ~14% empata (refund).
- Por sesión: el 6% se acumula → 6-7 de 10 jugadores terminan abajo (objetivo de Juan: la casa financia el ecosistema).
- Todo settable on-chain: `winMultiplierBps` (1.0x-3.0x), `matchTieToHouseBps` (0-100%).

**Por qué no se puede "amañar" el win-rate**: RPS es simétrico y la casa commitea su seed ANTES de ver las cartas del jugador. No existe distribución que gane >50% a un rival inteligente. El edge es honesto (payout + tie-routing), no rigging.

## 2. Aleatoriedad provably-fair (el vector crítico del PvE)

| Propiedad | Cómo |
|---|---|
| La casa no puede elegir cartas tras ver las tuyas | Seeds pre-committeados (`keccak256(abi.encode(seed))`) y consumidos **FIFO** |
| El jugador no puede predecir | El seed es secreto hasta el reveal |
| Nadie puede manipular el RNG on-chain | NO se usa `block.prevrandao`/blockhash; cartas = `keccak(seed, gameId)` |
| Verificable | Cualquiera recomputa `houseMoves` y `keccak(seed)==commit` tras el reveal |
| Front-running del owner | Imposible: FIFO sirve el seed más viejo, committeado antes de conocer al jugador |

## 3. Attack theories testeadas

| # | Ataque | Test | Resultado |
|---|---|---|---|
| 1 | Reveal de un seed que no matchea el commit | `test_RevertWhen_WrongSeedRevealed` | ✅ revert BadSeedReveal |
| 2 | La casa elige el seed tras ver las cartas | `test_SeedsConsumedFIFO` | ✅ FIFO lo impide |
| 3 | Jugar sin seeds disponibles | `test_RevertWhen_NoSeedAvailable` | ✅ revert |
| 4 | Insolvencia: bankroll no cubre un win | `test_RevertWhen_BankrollCantCoverWin` | ✅ revert, reserva pre-check |
| 5 | Owner retira fondos reservados de bets | `test_OwnerCannotWithdrawReservedFunds` | ✅ solo retira libre |
| 6 | La casa no revela para no pagar | `test_Forfeit_PlayerWinsIfHouseDoesntReveal` | ✅ timeout → jugador gana |
| 7 | Reentrancy en withdraw | `test_Reentrancy_WithdrawSafe` | ✅ guard + CEI |
| 8 | RON rechazado rompe el pago | `test_WithdrawNative_RevertsIfRecipientRejects` | ✅ aislado, reclamable |
| 9 | Carta inválida (>2) | `test_RevertWhen_BadMove` | ✅ revert |
| 10 | Settle después de forfeit / doble settle | `test_RevertWhen_SettleAfterForfeit` | ✅ revert NotPending |
| 11 | msg.value mal (RON/USDC) | `test_RevertWhen_WrongMsgValue` / `PlayUsdcWithValue` | ✅ revert |
| 12 | Drenar budget de NABABA | `test_NoReward_WhenZeroOrBudgetExhausted` | ✅ corta al exceder |
| 13 | win mult / tie bps fuera de rango | `test_RevertWhen_WinMultOutOfRange` / `SetMatchTieToHouse...` | ✅ revert |

## 4. Invariantes (fuzzing)

- `testFuzz_SettleSolventAndCoherent`: para cualquier seed + jugadas, settle nunca revierte, **solvencia siempre** (`balance == bankroll + reserved + pending`), reserva siempre liberada.
- `test_Solvency_ContractAlwaysCoversObligations`: tras jugadas mixtas, el contrato cubre exactamente sus obligaciones.

## 5. Solvencia del bankroll

- Al jugar se **reserva** `houseAtRisk = potentialWin - stake` del bankroll libre; si no alcanza, el play revierte → la casa **nunca** queda insolvente.
- `withdrawBankroll` solo permite retirar fondos **libres** (no reservados).
- Win paga de stake escrow + reserva; loss/tie devuelven la reserva al bankroll.

## 6. Limitaciones / dependencias

- **Keeper requerido**: un server off-chain con el master seed debe revelar seeds y settlear. Es la única dependencia de infra del PvE. Mitigación al jugador: **timeout → el jugador gana** si la casa no revela (withholding es -EV para la casa). Si el keeper cae, los players reclaman wins (drena bankroll) — riesgo de disponibilidad, NO de fondos del jugador.
- El master seed NUNCA va on-chain. Debe guardarse en env seguro del keeper.
- slither/mythril: pendientes (no instalados). Fuzzing de Foundry cubre invariantes.
- Centralización: owner = casa. Pre-mainnet → multisig + timelock.

## 7. Checklist pre-mainnet

- [ ] Keeper hosteado (Vercel cron / server) con master seed en env seguro
- [ ] Rotación/reposición automática de seed commits (que nunca se agoten)
- [ ] slither limpio
- [ ] Owner = multisig + timelock
- [ ] Bankroll inicial dimensionado (cubrir picos de wins concurrentes)
- [ ] Monitoreo de bankroll vs reserved (alertas de solvencia)
- [ ] Bug bounty
