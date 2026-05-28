// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface INababaMintable {
    function mint(address to, uint256 amount) external;
}

/// @title RonkeBattles — PvP 1v1 RPS-style con apuestas en RON/USDC
/// @notice Juego revenue-first del Ronkeverse. Cada match es 1v1, best-of-5 rondas,
///         cartas cíclicas Banana(0) > Monke(1) > Tree(2) > Banana(0).
///         Apuesta en RON nativo (token = address(0)) o en un ERC-20 whitelisteado (USDC).
///         Match async via commit-reveal: no requiere a los dos jugadores online a la vez.
///         Sin RNG on-chain → cero superficie de manipulación de aleatoriedad.
///         NFTs Ronkeverse son cosméticos: cero impacto en el resultado.
///
/// Revenue: rake (default 6%) sobre el pot, en la moneda del pot, acreditado al treasury.
/// NABABA: NO se apuesta — se gana jugando (mint capeado), para distribuir el token
///         orgánicamente antes de que exista el farm.
///
/// Seguridad: pull-payment pattern (fondos se reclaman, no se pushean) + ReentrancyGuard
///            + CEI + Pausable. Ver docs/RONKE-BATTLES-SPEC.md §7 (superficie de ataque)
///            y master doc §15 (self-audit protocol).
contract RonkeBattles is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────────────────────────────────────── Constantes ──
    uint256 public constant ROUNDS = 5;
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MAX_RAKE_BPS = 1_000; // hard cap 10% — el owner nunca puede subir más
    address public constant NATIVE = address(0); // RON nativo

    // ───────────────────────────────────────────── Tipos ──
    enum Status {
        Open, // creado por A, esperando que entre B
        Joined, // ambos commitearon, esperando reveals
        Settled, // resuelto y pagado
        Cancelled // cancelado por A antes de que entrara nadie
    }

    struct Game {
        address playerA;
        address playerB;
        address token; // address(0) = RON nativo
        uint256 stake; // por jugador
        bytes32 commitA;
        bytes32 commitB;
        uint64 bothCommittedAt; // timestamp cuando B entró (arranca la ventana de reveal)
        Status status;
        bool revealedA;
        bool revealedB;
        uint8[5] movesA;
        uint8[5] movesB;
    }

    // ───────────────────────────────────────────── Storage ──
    INababaMintable public immutable nababa;

    uint256 public nextMatchId = 1;
    mapping(uint256 => Game) private games;

    /// pull-payment: balances reclamables por (token, cuenta)
    mapping(address => mapping(address => uint256)) public pending;

    // Config (settable por owner / multisig)
    address public treasury;
    uint256 public rakeBps = 600; // 6%
    uint64 public revealWindow = 24 hours;
    uint64 public joinWindow = 7 days; // informativo; A puede cancelar mientras esté Open

    mapping(address => bool) public supportedToken; // ERC-20 permitidos (USDC). NATIVE siempre ok.
    mapping(address => mapping(uint256 => bool)) public allowedStake; // (token => stake => permitido)

    // Rewards NABABA
    uint256 public nababaRewardPerMatch; // 0 = sin reward
    uint256 public rewardSplitWinnerBps = 6_000; // 60% winner / 40% loser
    uint256 public gameRewardsBudget; // cap total de NABABA minteable como reward
    uint256 public rewardsMinted; // acumulado minteado

    /// si true, el doble-no-reveal igual cobra rake (desincentiva abandono mutuo)
    bool public doubleNoRevealRake = true;

    // ───────────────────────────────────────────── Eventos ──
    event MatchCreated(uint256 indexed matchId, address indexed playerA, address indexed token, uint256 stake);
    event MatchJoined(uint256 indexed matchId, address indexed playerB, uint64 bothCommittedAt);
    event MatchCancelled(uint256 indexed matchId);
    event Revealed(uint256 indexed matchId, address indexed player);
    event MatchSettled(uint256 indexed matchId, address indexed winner, uint256 payout, uint256 rake);
    event MatchTied(uint256 indexed matchId, uint256 refundEach, uint256 rake);
    event Forfeit(uint256 indexed matchId, address indexed winner, uint256 payout, uint256 rake);
    event RewardMinted(uint256 indexed matchId, address indexed player, uint256 amount);
    event Withdrawn(address indexed account, address indexed token, uint256 amount);

    // Config events
    event TreasurySet(address treasury);
    event RakeSet(uint256 rakeBps);
    event WindowsSet(uint64 revealWindow, uint64 joinWindow);
    event SupportedTokenSet(address token, bool enabled);
    event AllowedStakeSet(address token, uint256 stake, bool enabled);
    event RewardConfigSet(uint256 perMatch, uint256 splitWinnerBps, uint256 budget);
    event DoubleNoRevealRakeSet(bool enabled);

    // ───────────────────────────────────────────── Errores ──
    error ZeroAddress();
    error BadRake();
    error BadSplit();
    error TokenNotSupported();
    error StakeNotAllowed();
    error WrongValue(); // msg.value no coincide con lo esperado
    error NotOpen();
    error NotJoined();
    error CannotJoinOwn();
    error AlreadyRevealed();
    error BadReveal(); // hash no coincide
    error BadMove(); // carta fuera de {0,1,2}
    error NotParticipant();
    error RevealWindowOpen(); // todavía no venció la ventana
    error RevealWindowClosed();
    error NothingToWithdraw();
    error NotCreator();

    // ───────────────────────────────────────────── Constructor ──
    constructor(address initialOwner, address nababaToken, address treasury_) Ownable(initialOwner) {
        if (nababaToken == address(0) || treasury_ == address(0)) revert ZeroAddress();
        nababa = INababaMintable(nababaToken);
        treasury = treasury_;
    }

    // ═══════════════════════════════════════════════════════════
    //                        ADMIN
    // ═══════════════════════════════════════════════════════════

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasurySet(t);
    }

    function setRake(uint256 bps) external onlyOwner {
        if (bps > MAX_RAKE_BPS) revert BadRake();
        rakeBps = bps;
        emit RakeSet(bps);
    }

    function setWindows(uint64 reveal_, uint64 join_) external onlyOwner {
        if (reveal_ == 0 || join_ == 0) revert WrongValue();
        revealWindow = reveal_;
        joinWindow = join_;
        emit WindowsSet(reveal_, join_);
    }

    function setSupportedToken(address token, bool enabled) external onlyOwner {
        if (token == address(0)) revert ZeroAddress(); // NATIVE siempre permitido, no se setea
        supportedToken[token] = enabled;
        emit SupportedTokenSet(token, enabled);
    }

    function setAllowedStake(address token, uint256 stake, bool enabled) external onlyOwner {
        if (stake == 0) revert StakeNotAllowed();
        allowedStake[token][stake] = enabled;
        emit AllowedStakeSet(token, stake, enabled);
    }

    function setRewardConfig(uint256 perMatch, uint256 splitWinnerBps, uint256 budget) external onlyOwner {
        if (splitWinnerBps > BPS_DENOM) revert BadSplit();
        nababaRewardPerMatch = perMatch;
        rewardSplitWinnerBps = splitWinnerBps;
        gameRewardsBudget = budget;
        emit RewardConfigSet(perMatch, splitWinnerBps, budget);
    }

    function setDoubleNoRevealRake(bool enabled) external onlyOwner {
        doubleNoRevealRake = enabled;
        emit DoubleNoRevealRakeSet(enabled);
    }

    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Failsafe: al despausar el juego sigue; los withdraws NUNCA se pausan
    ///         (los jugadores siempre pueden retirar fondos reclamables aunque el juego esté en pausa).
    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════
    //                     GAME LIFECYCLE
    // ═══════════════════════════════════════════════════════════

    /// @notice Crea un match y deposita el stake. `commit` = keccak256(abi.encode(msg.sender, moves, salt)).
    ///         `moves` es uint8[5] con valores en {0,1,2}. `salt` es bytes32 aleatorio.
    /// @dev Para RON: token = address(0) y msg.value == stake. Para ERC-20: msg.value == 0.
    function createMatch(address token, uint256 stake, bytes32 commit)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 matchId)
    {
        if (token != NATIVE && !supportedToken[token]) revert TokenNotSupported();
        if (!allowedStake[token][stake]) revert StakeNotAllowed();

        _pullStake(token, stake);

        matchId = nextMatchId++;
        Game storage g = games[matchId];
        g.playerA = msg.sender;
        g.token = token;
        g.stake = stake;
        g.commitA = commit;
        g.status = Status.Open;

        emit MatchCreated(matchId, msg.sender, token, stake);
    }

    /// @notice Entra a un match abierto, deposita el mismo stake y commitea tus jugadas.
    function joinMatch(uint256 matchId, bytes32 commit) external payable whenNotPaused nonReentrant {
        Game storage g = games[matchId];
        if (g.status != Status.Open) revert NotOpen();
        if (msg.sender == g.playerA) revert CannotJoinOwn();

        _pullStake(g.token, g.stake);

        g.playerB = msg.sender;
        g.commitB = commit;
        g.status = Status.Joined;
        g.bothCommittedAt = uint64(block.timestamp);

        emit MatchJoined(matchId, msg.sender, g.bothCommittedAt);
    }

    /// @notice Cancela un match que sigue Open (nadie entró). Devuelve el stake al creador. Sin rake.
    function cancelOpen(uint256 matchId) external nonReentrant {
        Game storage g = games[matchId];
        if (g.status != Status.Open) revert NotOpen();
        if (msg.sender != g.playerA) revert NotCreator();

        g.status = Status.Cancelled;
        _credit(g.token, g.playerA, g.stake);

        emit MatchCancelled(matchId);
    }

    /// @notice Revela tus jugadas. Cuando ambos revelan, el match se resuelve y paga automáticamente.
    function reveal(uint256 matchId, uint8[5] calldata moves, bytes32 salt) external nonReentrant {
        Game storage g = games[matchId];
        if (g.status != Status.Joined) revert NotJoined();
        if (block.timestamp > uint256(g.bothCommittedAt) + revealWindow) revert RevealWindowClosed();

        _validateMoves(moves);
        bytes32 h = keccak256(abi.encode(msg.sender, moves, salt));

        if (msg.sender == g.playerA) {
            if (g.revealedA) revert AlreadyRevealed();
            if (h != g.commitA) revert BadReveal();
            g.revealedA = true;
            g.movesA = moves;
        } else if (msg.sender == g.playerB) {
            if (g.revealedB) revert AlreadyRevealed();
            if (h != g.commitB) revert BadReveal();
            g.revealedB = true;
            g.movesB = moves;
        } else {
            revert NotParticipant();
        }

        emit Revealed(matchId, msg.sender);

        if (g.revealedA && g.revealedB) {
            _settle(matchId, g);
        }
    }

    /// @notice Si venció la ventana de reveal y solo uno reveló, ese gana por forfeit.
    ///         Si ninguno reveló, cada uno recupera su stake (con/sin rake según doubleNoRevealRake).
    function claimTimeout(uint256 matchId) external nonReentrant {
        Game storage g = games[matchId];
        if (g.status != Status.Joined) revert NotJoined();
        if (block.timestamp <= uint256(g.bothCommittedAt) + revealWindow) revert RevealWindowOpen();

        g.status = Status.Settled;
        uint256 pot = g.stake * 2;

        if (g.revealedA && !g.revealedB) {
            uint256 rake = (pot * rakeBps) / BPS_DENOM;
            _credit(g.token, g.playerA, pot - rake);
            _credit(g.token, treasury, rake);
            _mintRewardWin(matchId, g.playerA, g.playerB);
            emit Forfeit(matchId, g.playerA, pot - rake, rake);
        } else if (g.revealedB && !g.revealedA) {
            uint256 rake = (pot * rakeBps) / BPS_DENOM;
            _credit(g.token, g.playerB, pot - rake);
            _credit(g.token, treasury, rake);
            _mintRewardWin(matchId, g.playerB, g.playerA);
            emit Forfeit(matchId, g.playerB, pot - rake, rake);
        } else {
            // ninguno reveló → refund a ambos
            uint256 rake = doubleNoRevealRake ? (pot * rakeBps) / BPS_DENOM : 0;
            uint256 refundEach = (pot - rake) / 2;
            _credit(g.token, g.playerA, refundEach);
            _credit(g.token, g.playerB, pot - rake - refundEach); // resto al B (evita perder 1 wei por redondeo)
            if (rake > 0) _credit(g.token, treasury, rake);
            emit MatchTied(matchId, refundEach, rake);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //                     WITHDRAW (pull)
    // ═══════════════════════════════════════════════════════════

    /// @notice Retira tus fondos reclamables en una moneda. Funciona incluso con el juego en pausa.
    function withdraw(address token) external nonReentrant {
        uint256 amount = pending[token][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pending[token][msg.sender] = 0; // efecto antes de interacción (CEI)

        if (token == NATIVE) {
            (bool ok,) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert WrongValue();
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        emit Withdrawn(msg.sender, token, amount);
    }

    // ═══════════════════════════════════════════════════════════
    //                     INTERNAL
    // ═══════════════════════════════════════════════════════════

    function _pullStake(address token, uint256 stake) internal {
        if (token == NATIVE) {
            if (msg.value != stake) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            IERC20(token).safeTransferFrom(msg.sender, address(this), stake);
        }
    }

    function _validateMoves(uint8[5] calldata moves) internal pure {
        for (uint256 i = 0; i < ROUNDS; i++) {
            if (moves[i] > 2) revert BadMove();
        }
    }

    function _settle(uint256 matchId, Game storage g) internal {
        g.status = Status.Settled;
        uint256 pot = g.stake * 2;
        uint256 rake = (pot * rakeBps) / BPS_DENOM;

        uint8 result = _resolve(g.movesA, g.movesB); // 1 = A gana, 2 = B gana, 0 = empate

        if (result == 1) {
            _credit(g.token, g.playerA, pot - rake);
            _credit(g.token, treasury, rake);
            _mintRewardWin(matchId, g.playerA, g.playerB);
            emit MatchSettled(matchId, g.playerA, pot - rake, rake);
        } else if (result == 2) {
            _credit(g.token, g.playerB, pot - rake);
            _credit(g.token, treasury, rake);
            _mintRewardWin(matchId, g.playerB, g.playerA);
            emit MatchSettled(matchId, g.playerB, pot - rake, rake);
        } else {
            // empate: split del pot menos rake, reward dividido en partes iguales
            uint256 refundEach = (pot - rake) / 2;
            _credit(g.token, g.playerA, refundEach);
            _credit(g.token, g.playerB, pot - rake - refundEach);
            _credit(g.token, treasury, rake);
            _mintRewardTie(matchId, g.playerA, g.playerB);
            emit MatchTied(matchId, refundEach, rake);
        }
    }

    /// @dev Resuelve best-of-5. Banana(0)>Monke(1)>Tree(2)>Banana(0): a vence a b si (a+1)%3 == b.
    ///      Ronda con misma carta = empate (no suma). Gana quien más rondas gana.
    function _resolve(uint8[5] storage a, uint8[5] storage b) internal view returns (uint8) {
        uint256 winsA;
        uint256 winsB;
        for (uint256 i = 0; i < ROUNDS; i++) {
            uint8 ca = a[i];
            uint8 cb = b[i];
            if (ca == cb) continue;
            if ((ca + 1) % 3 == cb) {
                winsA++;
            } else {
                winsB++;
            }
        }
        if (winsA > winsB) return 1;
        if (winsB > winsA) return 2;
        return 0;
    }

    function _mintRewardWin(uint256 matchId, address winner, address loser) internal {
        uint256 amt = nababaRewardPerMatch;
        if (amt == 0 || rewardsMinted + amt > gameRewardsBudget) return;
        rewardsMinted += amt;
        uint256 wShare = (amt * rewardSplitWinnerBps) / BPS_DENOM;
        uint256 lShare = amt - wShare;
        if (wShare > 0) {
            nababa.mint(winner, wShare);
            emit RewardMinted(matchId, winner, wShare);
        }
        if (lShare > 0) {
            nababa.mint(loser, lShare);
            emit RewardMinted(matchId, loser, lShare);
        }
    }

    function _mintRewardTie(uint256 matchId, address p1, address p2) internal {
        uint256 amt = nababaRewardPerMatch;
        if (amt == 0 || rewardsMinted + amt > gameRewardsBudget) return;
        rewardsMinted += amt;
        uint256 half = amt / 2;
        if (half > 0) {
            nababa.mint(p1, half);
            emit RewardMinted(matchId, p1, half);
            nababa.mint(p2, amt - half);
            emit RewardMinted(matchId, p2, amt - half);
        }
    }

    /// @dev Acredita fondos reclamables (pull pattern). No transfiere — evita reentrancy y push-fail.
    function _credit(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        pending[token][to] += amount;
    }

    // ═══════════════════════════════════════════════════════════
    //                       VIEWS
    // ═══════════════════════════════════════════════════════════

    function getMatch(uint256 matchId)
        external
        view
        returns (
            address playerA,
            address playerB,
            address token,
            uint256 stake,
            Status status,
            bool revealedA,
            bool revealedB,
            uint64 bothCommittedAt
        )
    {
        Game storage g = games[matchId];
        return (g.playerA, g.playerB, g.token, g.stake, g.status, g.revealedA, g.revealedB, g.bothCommittedAt);
    }

    /// @notice Helper de front-end para construir el commit. NO usar para commitear desde un contrato
    ///         (el salt sería público en calldata). Calcular el hash off-chain en producción.
    function computeCommit(address player, uint8[5] calldata moves, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encode(player, moves, salt));
    }
}
