# RonkeBattles — Self-Audit Report

**Contrato**: `src/RonkeBattles.sol`
**Fecha**: 2026-05-28
**Auditor**: self-audit (protocolo master doc §15). NO es audit profesional.
**Coverage**: **100% líneas / 100% statements / 100% branches / 100% funcs** (51 tests, Foundry)

> Disclosure: este contrato fue auto-auditado, no por una firma profesional. Los caps, rate limits y el pull-payment minimizan el blast radius de bugs desconocidos. Bug bounty se activa post-deploy.

---

## 1. Threat model — actores y ataques

| Actor | Incentivo | Vector | Mitigación |
|---|---|---|---|
| Jugador perdedor | No soltar su apuesta | No revela en commit-reveal | `claimTimeout` → forfeit al que reveló |
| Atacante técnico | Drenar el contrato | Reentrancy en withdraw | pull-payment + CEI + ReentrancyGuard |
| Atacante técnico | Romper payouts | Contrato que rechaza RON como player | pull-payment (no push); su withdraw revierte pero no afecta a otros |
| Sybil farmer | Farmear reward NABABA con self-match | 2 wallets propias jugando entre sí | rake hace el self-farm -EV (test_SelfMatch_IsNegativeEV) + budget capeado |
| Front-runner | Ver jugada rival antes de commitear | Observar mempool | commit es un hash; join no revela jugadas |
| Whale/owner | Rug del rake | Subir rake al 100% | `MAX_RAKE_BPS = 10%` hard cap en código |
| Owner malicioso | Robar fondos en juego | Funciones admin | admin NO toca `pending` ni fondos de matches; + multisig/timelock recomendado (master doc §15) |
| Manipulador | Sesgar resultado | RNG | NO hay RNG on-chain — el resultado es determinístico de las jugadas commiteadas |

## 2. Attack theories testeadas (try-to-break)

Cada teoría tiene su test adversarial en `test/RonkeBattles.t.sol`:

| # | Teoría de ataque | Test | Resultado |
|---|---|---|---|
| 1 | Reentrancy en withdraw drena el contrato | `test_Reentrancy_WithdrawIsSafe` | ✅ bloqueado (guard + CEI) |
| 2 | No-reveal grief retiene fondos del rival | `test_Forfeit_*` | ✅ forfeit al que revela |
| 3 | Doble no-reveal traba fondos para siempre | `test_DoubleNoReveal_*` | ✅ refund a ambos |
| 4 | Revelar jugadas distintas a las commiteadas | `test_RevertWhen_BadReveal_*` | ✅ revert |
| 5 | Commitear carta inválida (>2) | `test_RevertWhen_BadMove_OutOfRange` | ✅ revert en reveal |
| 6 | Tercero revela por un jugador | `test_RevertWhen_RevealByNonParticipant` | ✅ revert |
| 7 | Doble reveal del mismo jugador | `test_RevertWhen_DoubleReveal*` | ✅ revert |
| 8 | Revelar fuera de ventana | `test_RevertWhen_RevealAfterWindow` | ✅ revert |
| 9 | Reclamar timeout antes de ventana | `test_RevertWhen_ClaimTimeoutBeforeWindow` | ✅ revert |
| 10 | Jugar contra uno mismo | `test_RevertWhen_JoinOwnMatch` | ✅ revert |
| 11 | Stake mismatch / monto no permitido | `test_RevertWhen_StakeNotAllowed` | ✅ revert |
| 12 | Token no whitelisteado | `test_RevertWhen_TokenNotSupported` | ✅ revert |
| 13 | msg.value mal (RON vs ERC20) | `test_RevertWhen_WrongMsgValue` / `NativeValueOnErc20` | ✅ revert |
| 14 | Owner sube rake sobre el cap | `test_RevertWhen_RakeAboveMax` | ✅ revert (MAX 10%) |
| 15 | No-owner cambia params | `test_RevertWhen_NonOwnerSetsRake` | ✅ revert (Ownable) |
| 16 | Drenar el budget de rewards NABABA | `test_RewardBudget_StopsWhenExhausted` | ✅ corta al exceder budget |
| 17 | Self-farm de reward es rentable | `test_SelfMatch_IsNegativeEV` | ✅ -EV por el rake |
| 18 | RON rechazado rompe el sistema | `test_WithdrawNative_RevertsIfRecipientRejects` | ✅ aislado, fondos reclamables |

## 3. Invariantes (fuzzing, 256 runs c/u)

- `testFuzz_FullMatch_ConservesAndResolvesCorrectly`: para CUALQUIER combinación de jugadas, el balance del contrato == suma de pendings == pot (no se crea ni se traba RON), y el ganador coincide con un resolver de referencia independiente.
- `testFuzz_PayoutNeverExceedsPot`: para cualquier rake ≤ MAX, payout ≤ pot y la suma payout+rake == pot exacto.
- `test_FundsConservation_NoStuckOrCreated`: conservación de fondos post-settle.

## 4. Propiedades de seguridad verificadas

- **No RNG**: resultado 100% determinístico de inputs commiteados → cero superficie de manipulación de aleatoriedad.
- **Pull-payment**: ningún `transfer`/`call` de fondos dentro de la lógica de juego; todo se acredita y se reclama con `withdraw` (nonReentrant, CEI).
- **Conservación de fondos**: invariante probado por fuzzing — el contrato nunca paga más que el pot ni traba fondos.
- **Rake acotado**: hard cap de 10% en bytecode, el owner no puede exceder.
- **Withdraws nunca pausables**: failsafe — aun con el juego en pausa, los jugadores retiran (`test_Pause_BlocksCreateAndJoin_NotWithdraw`).
- **Checked math**: Solidity 0.8 (overflow/underflow revierten).

## 5. Limitaciones conocidas / pendientes

- **slither / mythril / echidna**: no corridos (no instalados en el entorno actual). Fuzzing de Foundry cubre invariantes; correr slither antes de mainnet queda como TODO.
- **block.timestamp**: usado para ventanas de horas/días — manipulación de validador de pocos segundos es irrelevante a esta escala.
- **Centralización**: funciones admin son owner-only. Antes de mainnet → multisig 3/5 + timelock 48h (master doc §15). El owner NO puede tocar fondos de matches en curso, pero sí cambiar params futuros.
- **Simultaneous-reveal**: el juego es RPS pre-commiteado (no reactivo). Decisión de diseño (async para comunidad chica), no un bug.
- **Reward NABABA por época / decay**: v1 usa reward fijo settable + budget cap. El decay se opera manualmente bajando `nababaRewardPerMatch`. Auto-decay por época queda para v2.

## 6. Checklist pre-mainnet

- [ ] Correr slither + resolver high/medium
- [ ] Deploy a multisig (no EOA) como owner
- [ ] Wrapper timelock 48h en setters de params
- [ ] Setear caps de stake conservadores al arranque
- [ ] Bug bounty público activo
- [ ] Verificar source en Sourcify Ronin
