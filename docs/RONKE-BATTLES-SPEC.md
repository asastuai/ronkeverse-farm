# RONKE BATTLES — Game Spec (revenue-first standalone)

**Status**: spec for build — 2026-05-28
**Pivot**: el juego deja de ser el mini-game del farm (v1.1) y pasa a ser **el producto principal**. Se lanza PRIMERO, genera revenue real en RON/USDC, junta comunidad + tesorería, y con eso se siembra el farm a largo plazo.

> Origen del pivot: la comunidad Ronkeverse no tiene liquidez para bootstrapear el farm (LP/LGE). Consejo de Discord: hacer primero un juego divertido con revenue modesto para juntar plata y gente. Ver memoria `projects/ronkeverse-farm/pivot-game-first`.

---

## 1. Concepto

PvP 1v1 estilo Piedra-Papel-Tijera con tema Ronkeverse. **No es casino, no es vs-house** — es PvP entre jugadores, skill/mente, probabilidad ~50/50 independiente del NFT que tengas (los NFTs son cosméticos, cero impacto en combate).

- 3 cartas cíclicas: 🍌 **Banana** vence a 🐒 **Monke**, 🐒 Monke vence a 🌴 **Tree**, 🌴 Tree vence a 🍌 Banana
- Best of 5 rondas
- El ganador se lleva el pot menos el **rake del 6%**
- NFTs Ronkeverse = avatar/frame cosmético (cero efecto en el resultado)

## 2. Modelo monetario

- Cada match se juega en **una sola moneda**: **RON** o **USDC** (elegida por el creador del match). Sin oracle, sin cruce de monedas.
- Dos colas paralelas (RON y USDC). Te emparejás con apuestas de la misma moneda + mismo monto (stake tiers).
- **Rake 6%** se cobra en la moneda del pot. Treasury acumula **ambas** (RON + USDC).
- Ejemplo: dos jugadores apuestan 10 RON c/u → pot 20 RON → ganador recibe 18.8 RON, treasury recibe 1.2 RON.

**Stake tiers** (settable): ej. 1 / 5 / 10 / 25 / 50 unidades. Emparejamiento exacto por tier evita mismatches.

## 3. NABABA como reward (no como apuesta)

NABABA **no se apuesta** (todavía no tiene LP/valor de mercado). Se **gana jugando**:
- Cada match settled mintea una cantidad fija de NABABA (settable) repartida entre los dos jugadores (ej. 60% ganador / 40% perdedor → premia jugar, no solo ganar).
- Sale de un **budget capeado** ("Game Genesis Rewards", ej. 15-20% del supply 100M), con tasa decreciente por época para no inflar.
- Objetivo: **distribuir NABABA orgánicamente entre players** antes de que exista el farm. Cuando se lance el farm + LP, NABABA ya tiene holders repartidos y el juego junta el RON/USDC para sembrar la liquidez. El juego reemplaza al LGE como mecanismo de bootstrap del token.

## 4. Flow del match (async, commit-reveal)

Async = no requiere a los dos jugadores online al mismo tiempo. Resuelve el matchmaking de comunidad chica.

```
1. CREATE   playerA crea match: elige moneda, stake tier, deposita stake.
            Commitea hash de su jugada: keccak256(abi.encode(moves, salt))
            'moves' = uint8[5] con valores {0=Banana,1=Monke,2=Tree}
2. JOIN     playerB entra a un match abierto: deposita el mismo stake.
            Commitea su propio hash.
3. REVEAL   ambos revelan (moves + salt). El contrato verifica hash == commit.
            Ventana de reveal: REVEAL_WINDOW (settable, ej. 24h desde que ambos commitearon).
4. SETTLE   con ambos reveals válidos → resuelve 5 rondas RPS determinísticamente:
            - cuenta rondas ganadas por cada uno
            - mayoría (3+) gana el pot - rake
            - empate total (raro) → split pot menos rake, o tie-break por hash
            mintea NABABA reward a ambos. Emite evento. Marca match settled.
```

### Resolución RPS (determinística, sin azar on-chain)
- Las jugadas las elige cada jugador (secuencia de 5). No hay RNG → no hay superficie de manipulación de aleatoriedad (ni Chainlink VRF ni block.prevrandao).
- Es "simultaneous reveal": ninguno ve la jugada del otro antes de commitear → es RPS puro, ~50/50, el skill está en patrones/mente.
- Empate de una ronda (misma carta) = ronda nula, no suma a ninguno. Gana quien primero llega a 3 rondas ganadas; si tras 5 rondas nadie llega a 3 (por empates), gana quien tiene más; si igualan → split.

## 5. Anti-grief / timeouts (CRÍTICO para self-audit)

El problema del commit-reveal: el que va perdiendo no revela para no soltar su apuesta.

- **No-join timeout**: si nadie entra al match en JOIN_WINDOW (settable), creator puede cancelar y recuperar su stake (sin rake).
- **No-reveal forfeit**: si un jugador commiteó pero no revela dentro de REVEAL_WINDOW, y el otro SÍ reveló → el que reveló gana por forfeit (se lleva pot - rake). El no-revelador pierde su stake.
- **Doble no-reveal**: si ninguno revela en la ventana → ambos pueden retirar su stake (se cobra rake igual para desincentivar el abandono mutuo, o sin rake — DECISIÓN settable).
- Todo via **pull pattern** (los fondos se reclaman, no se pushean) para evitar reentrancy en transferencias.

## 6. Parámetros settable (owner / multisig)

- `rakeBps` (default 600 = 6%)
- `stakeTiers[]` por moneda
- `supportedTokens` (RON nativo + USDC address; extensible)
- `revealWindow`, `joinWindow`
- `nababaRewardPerMatch`, `rewardSplitWinnerBps`
- `gameRewardsBudget` (cap del pool de rewards), `rewardDecayPerEpoch`
- `treasury` address, `paused`
- `doubleNoRevealRakeEnabled`

## 7. Superficie de ataque (pre-llenado para el self-audit, sección 15 master doc)

| Vector | Mitigación |
|---|---|
| No-reveal grief | forfeit a favor del que revela |
| Reentrancy en payout | pull pattern + CEI + ReentrancyGuard |
| Commit front-run | el commit es un hash, no revela nada; join no expone jugadas |
| Salt reuse / hash predecible | salt obligatorio de 32 bytes, hash incluye address del jugador |
| Self-match (jugar contra uno mismo para farmear NABABA reward) | costo del rake en cada match hace el self-farm -EV; opcional: cooldown / detección de misma wallet |
| Stake mismatch | emparejamiento exacto por tier + moneda |
| NABABA reward drain | budget capeado + decay; mint solo on settle válido |
| Owner rugpull | multisig + timelock en params (master doc §15) |
| RON transfer fail (contrato malicioso como player) | pull pattern, no push |
| Integer issues en rake/split | Solidity 0.8 checked math + tests de bordes |

## 8. Fuera de scope v1 (después)
- ELO ladder / leagues / seasons (se puede agregar off-chain leyendo eventos)
- Hand management reactivo (esta v1 es simultaneous-reveal puro)
- El farm completo (objetivo a largo plazo, fondeado por el revenue de este juego)

---

**Decisión de build**: contrato `RonkeBattles.sol` standalone. NababaToken ya existe y es mintable por minters → el juego se setea como minter para los rewards. No toca FarmCore (queda dormido para el futuro).

---

## 9. Modo vs House (PvE) — `RonkeBattlesHouse.sol`

**Decisión 2026-05-28**: además del PvP, hay modo PvE (jugás contra la casa). Coexisten — un toggle en `/battles`. El PvE resuelve el matchmaking (siempre disponible) y genera revenue para financiar el farm.

### Economía (decidida con Juan)
- **Win paga 2.0x** (doblás). El edge NO viene de pagar poco.
- **Empates: 30% a la casa / 70% refund** (provably-fair, derivado del seed) → de ahí sale el edge.
- **House edge ≈ 6%**. Por mano: ~40% gana / ~46% pierde / ~14% empata. Por sesión, el edge acumula → 6-7 de 10 terminan abajo (financia el ecosistema).
- Settable: `winMultiplierBps` (1.0x-3.0x), `matchTieToHouseBps` (0-100%).
- **No se puede amañar el win-rate**: RPS es simétrico y la casa commitea su seed ANTES de ver tus cartas. El edge es honesto, no rigging.

### Provably-fair (sin RNG manipulable)
1. La casa pre-commitea seeds: `keccak256(abi.encode(seed))` on-chain ANTES de que juegues.
2. Jugás tus 5 cartas en claro (el seed ya está bloqueado).
3. Keeper revela el seed → cartas de la casa = `keccak(seed, gameId)`.
4. Commits consumidos **FIFO** → la casa no puede inyectar un seed armado tras ver tus cartas.
5. **Timeout failsafe**: si la casa no revela en `settleWindow`, ganás por forfeit.

### Bankroll & solvencia
- La casa deposita RON/USDC. Al jugar se **reserva** `houseAtRisk`; si no alcanza, el play revierte (nunca insolvente).
- `withdrawBankroll` solo retira fondos libres (no reservados).

### Dependencia: keeper
- Server off-chain con el master seed revela/settlea. Única dependencia de infra del PvE.
- Mitigación al jugador: timeout → gana si la casa no revela. Si el keeper cae, riesgo de disponibilidad (no de fondos del jugador).
- Master seed NUNCA on-chain.

**Build**: `contracts/src/RonkeBattlesHouse.sol` (separado del PvP). Self-audit: 43 tests, 100% líneas/funcs. Reporte: `contracts/audit/RonkeBattlesHouse-SELF-AUDIT.md`.
