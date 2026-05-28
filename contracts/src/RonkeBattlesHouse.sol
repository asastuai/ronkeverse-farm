// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface INababaMintableHouse {
    function mint(address to, uint256 amount) external;
}

/// @title RonkeBattlesHouse — RPS vs la Casa (PvE) provably-fair
/// @notice Modo PvE de Ronke Battles. Jugás contra el protocolo (siempre disponible, sin matchmaking).
///         Cartas cíclicas Banana(0) > Monke(1) > Tree(2) > Banana(0), best of 5.
///
/// Aleatoriedad provably-fair (sin RNG manipulable on-chain):
///  1. La casa pre-commitea seeds secretos: publica keccak256(abi.encode(seed)) ANTES de que juegues.
///  2. Jugás tus 5 cartas en claro (el seed de la casa ya está bloqueado → no podés predecirlo).
///  3. Un keeper revela el seed → cartas de la casa = derive(keccak256(seed, gameId)).
///  4. Los commits se consumen FIFO → la casa no puede inyectar un seed armado tras ver tus cartas.
///  5. Timeout failsafe: si la casa no revela a tiempo, ganás por forfeit (withholding es -EV para la casa).
///
/// Económicamente: la casa tiene un bankroll (RON/USDC) y un house edge (win paga < 2x).
/// NFTs cosméticos. Contrato SEPARADO del PvP (RonkeBattles.sol) — ambos modos coexisten.
contract RonkeBattlesHouse is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant ROUNDS = 5;
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MIN_WIN_MULT = 10_000; // 1.0x — la casa nunca puede pagar menos que el stake en win
    uint256 public constant MAX_WIN_MULT = 30_000; // 3.0x — techo (permite payouts grandes con menor frecuencia)
    address public constant NATIVE = address(0);

    enum Status {
        None,
        Pending, // jugada hecha, esperando reveal de la casa
        Settled,
        Refunded
    }

    struct Game {
        address player;
        address token;
        uint256 stake;
        uint256 seedId; // commit de la casa consumido (FIFO)
        uint64 playedAt;
        Status status;
        uint8[5] playerMoves;
    }

    INababaMintableHouse public immutable nababa;

    uint256 public nextGameId = 1;
    mapping(uint256 => Game) private games;

    // Cola de commits de la casa (FIFO)
    mapping(uint256 => bytes32) public houseCommit; // seedId => keccak256(abi.encode(seed))
    mapping(uint256 => bool) public seedUsed;
    uint256 public nextSeedId = 1; // próximo slot a llenar con pushHouseCommits
    uint256 public nextUnusedSeedId = 1; // próximo seed a consumir (FIFO)

    // Bankroll por moneda
    mapping(address => uint256) public bankroll; // fondos libres de la casa
    mapping(address => uint256) public reserved; // bloqueado para pagar bets pendientes

    // Pull-payment de ganancias del jugador
    mapping(address => mapping(address => uint256)) public pending;

    // Config
    address public treasury;
    uint256 public winMultiplierBps = 20_000; // 2.0x en win (doblás). El edge sale del tie-routing.
    /// % de empates de match que se resuelven a favor de la casa; el resto refund. Provably-fair (del seed).
    uint256 public matchTieToHouseBps = 3_000; // 30% → ~6% house edge con win 2x
    uint64 public settleWindow = 1 hours; // si la casa no revela en este plazo, el jugador gana
    mapping(address => bool) public supportedToken;
    mapping(address => mapping(uint256 => bool)) public allowedStake;

    uint256 public nababaRewardPerGame;
    uint256 public gameRewardsBudget;
    uint256 public rewardsMinted;

    // Eventos
    event Played(uint256 indexed gameId, address indexed player, address indexed token, uint256 stake, uint256 seedId);
    event Settled(uint256 indexed gameId, address indexed player, uint8 result, uint256 payout);
    event ForfeitClaimed(uint256 indexed gameId, address indexed player, uint256 payout);
    event RewardMinted(uint256 indexed gameId, address indexed player, uint256 amount);
    event Withdrawn(address indexed account, address indexed token, uint256 amount);
    event HouseCommitsPushed(uint256 from, uint256 to);
    event BankrollDeposited(address indexed token, uint256 amount);
    event BankrollWithdrawn(address indexed token, uint256 amount);
    event TreasurySet(address treasury);
    event WinMultiplierSet(uint256 bps);
    event MatchTieToHouseSet(uint256 bps);
    event SettleWindowSet(uint64 window);
    event SupportedTokenSet(address token, bool enabled);
    event AllowedStakeSet(address token, uint256 stake, bool enabled);
    event RewardConfigSet(uint256 perGame, uint256 budget);

    // Errores
    error ZeroAddress();
    error BadMultiplier();
    error BadBps();
    error BadWindow();
    error TokenNotSupported();
    error StakeNotAllowed();
    error WrongValue();
    error NoSeedAvailable();
    error InsufficientBankroll();
    error BadMove();
    error NotPending();
    error NotPlayer();
    error SettleWindowOpen();
    error SettleWindowClosed();
    error BadSeedReveal();
    error NothingToWithdraw();
    error AmountZero();

    constructor(address initialOwner, address nababaToken, address treasury_) Ownable(initialOwner) {
        if (nababaToken == address(0) || treasury_ == address(0)) revert ZeroAddress();
        nababa = INababaMintableHouse(nababaToken);
        treasury = treasury_;
    }

    // ═══════════════════════ ADMIN ═══════════════════════

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasurySet(t);
    }

    function setWinMultiplier(uint256 bps) external onlyOwner {
        if (bps < MIN_WIN_MULT || bps > MAX_WIN_MULT) revert BadMultiplier();
        winMultiplierBps = bps;
        emit WinMultiplierSet(bps);
    }

    function setMatchTieToHouse(uint256 bps) external onlyOwner {
        if (bps > BPS_DENOM) revert BadBps();
        matchTieToHouseBps = bps;
        emit MatchTieToHouseSet(bps);
    }

    function setSettleWindow(uint64 w) external onlyOwner {
        if (w == 0) revert BadWindow();
        settleWindow = w;
        emit SettleWindowSet(w);
    }

    function setSupportedToken(address token, bool enabled) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        supportedToken[token] = enabled;
        emit SupportedTokenSet(token, enabled);
    }

    function setAllowedStake(address token, uint256 stake, bool enabled) external onlyOwner {
        if (stake == 0) revert StakeNotAllowed();
        allowedStake[token][stake] = enabled;
        emit AllowedStakeSet(token, stake, enabled);
    }

    function setRewardConfig(uint256 perGame, uint256 budget) external onlyOwner {
        nababaRewardPerGame = perGame;
        gameRewardsBudget = budget;
        emit RewardConfigSet(perGame, budget);
    }

    /// @notice Pushea commits de seeds de la casa (keccak256(abi.encode(seed))). Hacelo ANTES de que jueguen.
    function pushHouseCommits(bytes32[] calldata commits) external onlyOwner {
        uint256 from = nextSeedId;
        for (uint256 i = 0; i < commits.length; i++) {
            houseCommit[nextSeedId] = commits[i];
            nextSeedId++;
        }
        emit HouseCommitsPushed(from, nextSeedId - 1);
    }

    function depositBankroll(address token, uint256 amount) external payable onlyOwner {
        if (amount == 0) revert AmountZero();
        if (token == NATIVE) {
            if (msg.value != amount) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
        bankroll[token] += amount;
        emit BankrollDeposited(token, amount);
    }

    /// @notice Retira fondos LIBRES del bankroll (no toca lo reservado para bets pendientes).
    function withdrawBankroll(address token, uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert AmountZero();
        if (amount > bankroll[token]) revert InsufficientBankroll();
        bankroll[token] -= amount;
        _payout(token, msg.sender, amount);
        emit BankrollWithdrawn(token, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════ JUGAR ═══════════════════════

    /// @notice Jugás contra la casa. moves = uint8[5] en {0,1,2}. Consume el próximo seed committeado (FIFO).
    function play(address token, uint256 stake, uint8[5] calldata moves)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 gameId)
    {
        if (token != NATIVE && !supportedToken[token]) revert TokenNotSupported();
        if (!allowedStake[token][stake]) revert StakeNotAllowed();
        _validateMoves(moves);

        // tomar un seed committeado disponible (FIFO)
        uint256 seedId = nextUnusedSeedId;
        if (seedId >= nextSeedId) revert NoSeedAvailable();
        nextUnusedSeedId++;
        seedUsed[seedId] = true;

        // reservar el riesgo de la casa (lo que paga de más si el jugador gana)
        uint256 potentialWin = (stake * winMultiplierBps) / BPS_DENOM;
        uint256 houseAtRisk = potentialWin > stake ? potentialWin - stake : 0;
        if (bankroll[token] < houseAtRisk) revert InsufficientBankroll();
        bankroll[token] -= houseAtRisk;
        reserved[token] += houseAtRisk;

        _pullStake(token, stake);

        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.player = msg.sender;
        g.token = token;
        g.stake = stake;
        g.seedId = seedId;
        g.playedAt = uint64(block.timestamp);
        g.status = Status.Pending;
        g.playerMoves = moves;

        emit Played(gameId, msg.sender, token, stake, seedId);
    }

    /// @notice La casa (keeper) revela el seed y settlea. Cualquiera podría llamar si conoce el seed,
    ///         pero solo el keeper lo conoce. Verifica el commit, deriva cartas, resuelve y paga.
    function settle(uint256 gameId, bytes32 seed) external nonReentrant {
        Game storage g = games[gameId];
        if (g.status != Status.Pending) revert NotPending();
        if (keccak256(abi.encode(seed)) != houseCommit[g.seedId]) revert BadSeedReveal();

        g.status = Status.Settled;

        uint8[5] memory houseMoves = _deriveHouseMoves(seed, gameId);
        uint8 result = _resolve(g.playerMoves, houseMoves); // 1 = jugador, 2 = casa, 0 = empate

        uint256 potentialWin = (g.stake * winMultiplierBps) / BPS_DENOM;
        uint256 houseAtRisk = potentialWin > g.stake ? potentialWin - g.stake : 0;
        reserved[g.token] -= houseAtRisk; // liberar reserva

        // Empate de match: se resuelve provably-fair desde el seed. Una fracción (matchTieToHouseBps)
        // va a la casa (de ahí sale el house edge), el resto es refund real al jugador.
        if (result == 0) {
            uint256 tieRoll = uint256(keccak256(abi.encode(seed, gameId, "TIE"))) % BPS_DENOM;
            result = tieRoll < matchTieToHouseBps ? 2 : 0; // 2 = casa, 0 = empate-refund
        }

        uint256 payout;
        if (result == 1) {
            // jugador gana: cobra potentialWin (stake escrow + houseAtRisk reservado)
            payout = potentialWin;
            _credit(g.token, g.player, payout);
        } else if (result == 2) {
            // casa gana: el stake va al bankroll, la reserva vuelve al bankroll
            bankroll[g.token] += g.stake + houseAtRisk;
        } else {
            // empate refund: devuelve el stake, la reserva vuelve al bankroll
            payout = g.stake;
            _credit(g.token, g.player, g.stake);
            bankroll[g.token] += houseAtRisk;
        }

        _mintReward(gameId, g.player);
        emit Settled(gameId, g.player, result, payout);
    }

    /// @notice Si la casa no reveló dentro de settleWindow, el jugador reclama la victoria (forfeit).
    function claimForfeit(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        if (g.status != Status.Pending) revert NotPending();
        if (msg.sender != g.player) revert NotPlayer();
        if (block.timestamp <= uint256(g.playedAt) + settleWindow) revert SettleWindowOpen();

        g.status = Status.Settled;
        uint256 potentialWin = (g.stake * winMultiplierBps) / BPS_DENOM;
        uint256 houseAtRisk = potentialWin > g.stake ? potentialWin - g.stake : 0;
        reserved[g.token] -= houseAtRisk;
        _credit(g.token, g.player, potentialWin);
        emit ForfeitClaimed(gameId, g.player, potentialWin);
    }

    // ═══════════════════════ WITHDRAW ═══════════════════════

    function withdraw(address token) external nonReentrant {
        uint256 amount = pending[token][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pending[token][msg.sender] = 0;
        _payout(token, msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    // ═══════════════════════ INTERNAL ═══════════════════════

    function _pullStake(address token, uint256 stake) internal {
        if (token == NATIVE) {
            if (msg.value != stake) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            IERC20(token).safeTransferFrom(msg.sender, address(this), stake);
        }
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (token == NATIVE) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert WrongValue();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _validateMoves(uint8[5] calldata moves) internal pure {
        for (uint256 i = 0; i < ROUNDS; i++) {
            if (moves[i] > 2) revert BadMove();
        }
    }

    /// @dev Cartas de la casa derivadas del seed revelado + gameId. Determinístico y verificable.
    function _deriveHouseMoves(bytes32 seed, uint256 gameId) internal pure returns (uint8[5] memory m) {
        bytes32 h = keccak256(abi.encode(seed, gameId));
        for (uint256 i = 0; i < ROUNDS; i++) {
            m[i] = uint8(uint8(h[i]) % 3);
        }
    }

    /// @dev best-of-5. a vence a b si (a+1)%3 == b.
    function _resolve(uint8[5] storage a, uint8[5] memory b) internal view returns (uint8) {
        uint256 wa;
        uint256 wb;
        for (uint256 i = 0; i < ROUNDS; i++) {
            uint8 ca = a[i];
            uint8 cb = b[i];
            if (ca == cb) continue;
            if ((ca + 1) % 3 == cb) wa++;
            else wb++;
        }
        if (wa > wb) return 1;
        if (wb > wa) return 2;
        return 0;
    }

    function _mintReward(uint256 gameId, address player) internal {
        uint256 amt = nababaRewardPerGame;
        if (amt == 0 || rewardsMinted + amt > gameRewardsBudget) return;
        rewardsMinted += amt;
        nababa.mint(player, amt);
        emit RewardMinted(gameId, player, amt);
    }

    function _credit(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        pending[token][to] += amount;
    }

    // ═══════════════════════ VIEWS ═══════════════════════

    function getGame(uint256 gameId)
        external
        view
        returns (address player, address token, uint256 stake, uint256 seedId, Status status, uint64 playedAt)
    {
        Game storage g = games[gameId];
        return (g.player, g.token, g.stake, g.seedId, g.status, g.playedAt);
    }

    /// @notice Seeds committeados todavía sin usar (cuántas partidas más se pueden jugar).
    function availableSeeds() external view returns (uint256) {
        return nextSeedId - nextUnusedSeedId;
    }

    /// @notice Helper para el keeper: el commit que debe matchear keccak256(abi.encode(seed)).
    function commitOf(bytes32 seed) external pure returns (bytes32) {
        return keccak256(abi.encode(seed));
    }
}
