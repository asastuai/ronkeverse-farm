// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RonkeBattlesHouse} from "../src/RonkeBattlesHouse.sol";
import {NababaToken} from "../src/NababaToken.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Self-audit suite del modo PvE (vs House). Estándar completo: RNG provably-fair,
///         solvencia del bankroll, grief de no-reveal, reentrancy.
contract RonkeBattlesHouseTest is Test {
    RonkeBattlesHouse house;
    NababaToken nababa;
    MockERC20 usdc;

    address owner = address(this);
    address treasury = address(0x7E);
    address alice = address(0xA11CE);

    uint256 constant STAKE = 1 ether;

    receive() external payable {} // el test contract es owner → debe poder recibir RON del withdrawBankroll

    // jugadas
    function _m(uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) internal pure returns (uint8[5] memory r) {
        r[0] = a; r[1] = b; r[2] = c; r[3] = d; r[4] = e;
    }

    function setUp() public {
        nababa = new NababaToken(owner);
        house = new RonkeBattlesHouse(owner, address(nababa), treasury);
        usdc = new MockERC20("USD Coin", "USDC");
        nababa.setMinter(address(house), true);

        house.setSupportedToken(address(usdc), true);
        house.setAllowedStake(address(0), STAKE, true);
        house.setAllowedStake(address(usdc), STAKE, true);
        house.setRewardConfig(50 ether, 1_000_000 ether);

        // bankroll inicial generoso
        vm.deal(owner, 1000 ether);
        house.depositBankroll{value: 100 ether}(address(0), 100 ether);
        usdc.mint(owner, 1000 ether);
        usdc.approve(address(house), 1000 ether);
        house.depositBankroll(address(usdc), 100 ether);

        vm.deal(alice, 100 ether);
        usdc.mint(alice, 100 ether);
    }

    // commit/seed helpers
    function _seed(uint256 x) internal pure returns (bytes32) {
        return bytes32(x);
    }
    function _commit(bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encode(seed));
    }
    function _houseMoves(bytes32 seed, uint256 gameId) internal pure returns (uint8[5] memory m) {
        bytes32 h = keccak256(abi.encode(seed, gameId));
        for (uint256 i = 0; i < 5; i++) m[i] = uint8(uint8(h[i]) % 3);
    }

    /// busca un seed tal que las cartas de la casa para gameId den el resultado deseado vs playerMoves
    /// (1 = jugador gana, 2 = casa gana, 0 = empate)
    function _findSeed(uint8[5] memory pm, uint256 gameId, uint8 want) internal pure returns (bytes32) {
        for (uint256 s = 1; s < 5000; s++) {
            uint8[5] memory hm = _houseMoves(bytes32(s), gameId);
            uint256 wa; uint256 wb;
            for (uint256 i = 0; i < 5; i++) {
                if (pm[i] == hm[i]) continue;
                if ((pm[i] + 1) % 3 == hm[i]) wa++; else wb++;
            }
            uint8 res = wa > wb ? 1 : (wb > wa ? 2 : 0);
            if (res == want) return bytes32(s);
        }
        revert("no seed found");
    }

    function _pushSeed(bytes32 seed) internal {
        bytes32[] memory c = new bytes32[](1);
        c[0] = _commit(seed);
        house.pushHouseCommits(c);
    }

    // ═══════════════════════ HAPPY PATHS ═══════════════════════

    function test_PlayerWins_PaysFromBankroll() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        uint256 gameId = house.nextGameId();
        bytes32 seed = _findSeed(pm, gameId, 1); // jugador gana
        _pushSeed(seed);

        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);
        assertEq(id, gameId);

        house.settle(id, seed); // keeper revela

        uint256 expectWin = (STAKE * 20000) / 10000; // 1.88x
        assertEq(house.pending(address(0), alice), expectWin, "player win payout");
        assertEq(nababa.balanceOf(alice), 50 ether, "nababa reward");

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        house.withdraw(address(0));
        assertEq(alice.balance, balBefore + expectWin);
    }

    function test_HouseWins_StakeToBankroll() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        uint256 gameId = house.nextGameId();
        bytes32 seed = _findSeed(pm, gameId, 2); // casa gana
        _pushSeed(seed);

        uint256 bankBefore = house.bankroll(address(0));
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);
        house.settle(id, seed);

        assertEq(house.pending(address(0), alice), 0, "player gets nothing");
        // bankroll: -houseAtRisk al jugar, +stake +houseAtRisk al perder → neto +stake
        assertEq(house.bankroll(address(0)), bankBefore + STAKE, "bankroll grew by stake");
        assertEq(house.reserved(address(0)), 0, "reserve released");
    }

    function test_Tie_RefundsStake() public {
        house.setMatchTieToHouse(0); // 0% a la casa → todo empate es refund (determinístico)
        uint8[5] memory pm = _m(0, 1, 2, 0, 1);
        uint256 gameId = house.nextGameId();
        bytes32 seed = _findSeed(pm, gameId, 0); // empate
        _pushSeed(seed);

        uint256 bankBefore = house.bankroll(address(0));
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);
        house.settle(id, seed);

        assertEq(house.pending(address(0), alice), STAKE, "refund on tie");
        assertEq(house.bankroll(address(0)), bankBefore, "bankroll unchanged on tie");
        assertEq(house.reserved(address(0)), 0);
    }

    function test_TieToHouse_WhenRoutedToHouse() public {
        house.setMatchTieToHouse(10000); // 100% de empates a la casa
        uint8[5] memory pm = _m(0, 1, 2, 0, 1);
        uint256 gameId = house.nextGameId();
        bytes32 seed = _findSeed(pm, gameId, 0); // empate crudo
        _pushSeed(seed);

        uint256 bankBefore = house.bankroll(address(0));
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);
        house.settle(id, seed);

        // empate ruteado a la casa → jugador no cobra, stake al bankroll
        assertEq(house.pending(address(0), alice), 0, "tie routed to house: no payout");
        assertEq(house.bankroll(address(0)), bankBefore + STAKE, "bankroll grew by stake");
        assertEq(house.reserved(address(0)), 0);
    }

    function test_SetMatchTieToHouse_RevertsOverMax() public {
        vm.expectRevert(RonkeBattlesHouse.BadBps.selector);
        house.setMatchTieToHouse(10001);
    }

    function test_UsdcPlay_Works() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        uint256 gameId = house.nextGameId();
        bytes32 seed = _findSeed(pm, gameId, 1);
        _pushSeed(seed);

        vm.startPrank(alice);
        usdc.approve(address(house), STAKE);
        uint256 id = house.play(address(usdc), STAKE, pm);
        vm.stopPrank();
        house.settle(id, seed);
        assertEq(house.pending(address(usdc), alice), (STAKE * 20000) / 10000);
    }

    // ═══════════════════════ PROVABLY-FAIR / RNG ═══════════════════════

    function test_RevertWhen_WrongSeedRevealed() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        bytes32 seed = _seed(12345);
        _pushSeed(seed);
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);

        vm.expectRevert(RonkeBattlesHouse.BadSeedReveal.selector);
        house.settle(id, _seed(99999)); // seed que no matchea el commit
    }

    function test_SeedsConsumedFIFO() public {
        // dos seeds pusheados; dos jugadas consumen en orden 1,2 → la casa no puede elegir
        _pushSeed(_seed(111));
        _pushSeed(_seed(222));
        uint8[5] memory pm = _m(0, 1, 2, 0, 1);

        vm.prank(alice);
        uint256 id1 = house.play{value: STAKE}(address(0), STAKE, pm);
        vm.prank(alice);
        uint256 id2 = house.play{value: STAKE}(address(0), STAKE, pm);

        (,,, uint256 seed1,,) = house.getGame(id1);
        (,,, uint256 seed2,,) = house.getGame(id2);
        assertEq(seed1, 1, "first game uses seed 1");
        assertEq(seed2, 2, "second game uses seed 2");
        // ambos seeds quedaron committeados ANTES de jugar → no se pueden cambiar
        assertEq(house.availableSeeds(), 0);
    }

    function test_RevertWhen_NoSeedAvailable() public {
        // sin pushear commits → no se puede jugar
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        vm.expectRevert(RonkeBattlesHouse.NoSeedAvailable.selector);
        house.play{value: STAKE}(address(0), STAKE, pm);
    }

    // ═══════════════════════ SOLVENCIA / BANKROLL ═══════════════════════

    function test_RevertWhen_BankrollCantCoverWin() public {
        // drenar el bankroll y verificar que no se puede jugar si no alcanza para pagar un win
        house.withdrawBankroll(address(0), house.bankroll(address(0)));
        assertEq(house.bankroll(address(0)), 0);
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        _pushSeed(_seed(1));
        vm.prank(alice);
        vm.expectRevert(RonkeBattlesHouse.InsufficientBankroll.selector);
        house.play{value: STAKE}(address(0), STAKE, pm);
    }

    function test_OwnerCannotWithdrawReservedFunds() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        _pushSeed(_seed(1));
        vm.prank(alice);
        house.play{value: STAKE}(address(0), STAKE, pm); // reserva houseAtRisk

        uint256 free = house.bankroll(address(0));
        // intentar retirar más que lo libre revierte
        vm.expectRevert(RonkeBattlesHouse.InsufficientBankroll.selector);
        house.withdrawBankroll(address(0), free + 1);
    }

    function test_Solvency_ContractAlwaysCoversObligations() public {
        // tras varias jugadas mixtas, balance del contrato == bankroll + reserved + escrow pendientes + pending withdrawals
        uint8[5] memory pm = _m(0, 1, 0, 2, 0);
        bytes32 sWin = _findSeed(pm, house.nextGameId(), 1);
        _pushSeed(sWin);
        vm.prank(alice);
        uint256 id1 = house.play{value: STAKE}(address(0), STAKE, pm);

        bytes32 sLose = _findSeed(pm, house.nextGameId(), 2);
        _pushSeed(sLose);
        vm.prank(alice);
        uint256 id2 = house.play{value: STAKE}(address(0), STAKE, pm);

        house.settle(id1, sWin);
        house.settle(id2, sLose);

        // invariante de solvencia
        uint256 bal = address(house).balance;
        uint256 obligations = house.bankroll(address(0)) + house.reserved(address(0))
            + house.pending(address(0), alice);
        assertEq(bal, obligations, "contract balance == bankroll + reserved + pending");
    }

    // ═══════════════════════ FORFEIT / TIMEOUT ═══════════════════════

    function test_Forfeit_PlayerWinsIfHouseDoesntReveal() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        _pushSeed(_seed(777));
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);

        vm.warp(block.timestamp + 2 hours); // pasa settleWindow
        vm.prank(alice);
        house.claimForfeit(id);
        assertEq(house.pending(address(0), alice), (STAKE * 20000) / 10000, "player wins by forfeit");
    }

    function test_RevertWhen_ForfeitBeforeWindow() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        _pushSeed(_seed(1));
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);
        vm.prank(alice);
        vm.expectRevert(RonkeBattlesHouse.SettleWindowOpen.selector);
        house.claimForfeit(id);
    }

    function test_RevertWhen_ForfeitByNonPlayer() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        _pushSeed(_seed(1));
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(RonkeBattlesHouse.NotPlayer.selector);
        house.claimForfeit(id); // owner, no el player
    }

    function test_RevertWhen_SettleAfterForfeit() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        bytes32 seed = _seed(55);
        _pushSeed(seed);
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(alice);
        house.claimForfeit(id);
        // la casa ya no puede settlear (status Settled)
        vm.expectRevert(RonkeBattlesHouse.NotPending.selector);
        house.settle(id, seed);
    }

    // ═══════════════════════ REVERTS / VALIDACIÓN ═══════════════════════

    function test_RevertWhen_BadMove() public {
        uint8[5] memory bad = _m(0, 0, 0, 0, 3);
        _pushSeed(_seed(1));
        vm.prank(alice);
        vm.expectRevert(RonkeBattlesHouse.BadMove.selector);
        house.play{value: STAKE}(address(0), STAKE, bad);
    }

    function test_RevertWhen_StakeNotAllowed() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        _pushSeed(_seed(1));
        vm.prank(alice);
        vm.expectRevert(RonkeBattlesHouse.StakeNotAllowed.selector);
        house.play{value: 0.5 ether}(address(0), 0.5 ether, pm);
    }

    function test_RevertWhen_WrongMsgValue() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        _pushSeed(_seed(1));
        vm.prank(alice);
        vm.expectRevert(RonkeBattlesHouse.WrongValue.selector);
        house.play{value: STAKE - 1}(address(0), STAKE, pm);
    }

    function test_RevertWhen_SettleNonPending() public {
        vm.expectRevert(RonkeBattlesHouse.NotPending.selector);
        house.settle(999, _seed(1));
    }

    function test_RevertWhen_WinMultOutOfRange() public {
        vm.expectRevert(RonkeBattlesHouse.BadMultiplier.selector);
        house.setWinMultiplier(9999); // < 1.0x
        vm.expectRevert(RonkeBattlesHouse.BadMultiplier.selector);
        house.setWinMultiplier(30001); // > 3.0x
    }

    function test_RevertWhen_NonOwnerPushesCommits() public {
        bytes32[] memory c = new bytes32[](1);
        c[0] = _commit(_seed(1));
        vm.prank(alice);
        vm.expectRevert();
        house.pushHouseCommits(c);
    }

    // ═══════════════════════ COVERAGE: ADMIN / VIEWS / PAUSE ═══════════════════════

    function test_AdminSetters() public {
        house.setTreasury(alice);
        assertEq(house.treasury(), alice);
        house.setWinMultiplier(25000);
        assertEq(house.winMultiplierBps(), 25000);
        house.setSettleWindow(2 hours);
        assertEq(house.settleWindow(), 2 hours);
        house.setMatchTieToHouse(5000);
        assertEq(house.matchTieToHouseBps(), 5000);
    }

    function test_RevertWhen_SettleWindowZero() public {
        vm.expectRevert(RonkeBattlesHouse.BadWindow.selector);
        house.setSettleWindow(0);
    }

    function test_RevertWhen_TreasuryZero() public {
        vm.expectRevert(RonkeBattlesHouse.ZeroAddress.selector);
        house.setTreasury(address(0));
    }

    function test_PauseBlocksPlay_NotWithdrawOrSettle() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        bytes32 seed = _findSeed(pm, house.nextGameId(), 1);
        _pushSeed(seed);
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);

        house.pause();
        // no se puede jugar en pausa
        _pushSeed(_seed(42));
        vm.prank(alice);
        vm.expectRevert();
        house.play{value: STAKE}(address(0), STAKE, pm);

        // settle + withdraw siguen funcionando en pausa (failsafe)
        house.settle(id, seed);
        vm.prank(alice);
        house.withdraw(address(0));
        assertEq(house.pending(address(0), alice), 0);

        house.unpause();
        vm.prank(alice);
        house.play{value: STAKE}(address(0), STAKE, pm); // vuelve a andar
    }

    function test_WithdrawUsdcWinnings() public {
        // cubre la rama ERC20 de _payout
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        bytes32 seed = _findSeed(pm, house.nextGameId(), 1);
        _pushSeed(seed);
        vm.startPrank(alice);
        usdc.approve(address(house), STAKE);
        uint256 id = house.play(address(usdc), STAKE, pm);
        vm.stopPrank();
        house.settle(id, seed);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        house.withdraw(address(usdc));
        assertEq(usdc.balanceOf(alice), before + (STAKE * 20000) / 10000);
    }

    function test_WithdrawBankrollUsdc() public {
        uint256 before = usdc.balanceOf(owner);
        house.withdrawBankroll(address(usdc), 10 ether);
        assertEq(usdc.balanceOf(owner), before + 10 ether);
    }

    function test_RevertWhen_DepositZero() public {
        vm.expectRevert(RonkeBattlesHouse.AmountZero.selector);
        house.depositBankroll(address(0), 0);
    }

    function test_RevertWhen_WithdrawNothing() public {
        vm.prank(alice);
        vm.expectRevert(RonkeBattlesHouse.NothingToWithdraw.selector);
        house.withdraw(address(0));
    }

    function test_Constructor_RevertsZero() public {
        vm.expectRevert(RonkeBattlesHouse.ZeroAddress.selector);
        new RonkeBattlesHouse(owner, address(0), treasury);
        vm.expectRevert(RonkeBattlesHouse.ZeroAddress.selector);
        new RonkeBattlesHouse(owner, address(nababa), address(0));
    }

    function test_RevertWhen_SetSupportedTokenZero() public {
        vm.expectRevert(RonkeBattlesHouse.ZeroAddress.selector);
        house.setSupportedToken(address(0), true);
    }

    function test_RevertWhen_SetAllowedStakeZero() public {
        vm.expectRevert(RonkeBattlesHouse.StakeNotAllowed.selector);
        house.setAllowedStake(address(0), 0, true);
    }

    function test_RevertWhen_DepositNativeWrongValue() public {
        vm.expectRevert(RonkeBattlesHouse.WrongValue.selector);
        house.depositBankroll{value: 1 ether}(address(0), 2 ether);
    }

    function test_RevertWhen_DepositErc20WithValue() public {
        usdc.approve(address(house), 5 ether);
        vm.expectRevert(RonkeBattlesHouse.WrongValue.selector);
        house.depositBankroll{value: 1}(address(usdc), 5 ether);
    }

    function test_RevertWhen_WithdrawBankrollZero() public {
        vm.expectRevert(RonkeBattlesHouse.AmountZero.selector);
        house.withdrawBankroll(address(0), 0);
    }

    function test_RevertWhen_PlayUsdcWithValue() public {
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        _pushSeed(_seed(1));
        vm.startPrank(alice);
        usdc.approve(address(house), STAKE);
        vm.expectRevert(RonkeBattlesHouse.WrongValue.selector);
        house.play{value: 1}(address(usdc), STAKE, pm);
        vm.stopPrank();
    }

    function test_NoReward_WhenZeroOrBudgetExhausted() public {
        // amt == 0
        house.setRewardConfig(0, 1_000_000 ether);
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        bytes32 s1 = _findSeed(pm, house.nextGameId(), 1);
        _pushSeed(s1);
        vm.prank(alice);
        uint256 id1 = house.play{value: STAKE}(address(0), STAKE, pm);
        house.settle(id1, s1);
        assertEq(nababa.balanceOf(alice), 0, "no reward when 0");

        // budget exhausted
        house.setRewardConfig(100 ether, 50 ether); // budget < perGame
        bytes32 s2 = _findSeed(pm, house.nextGameId(), 1);
        _pushSeed(s2);
        vm.prank(alice);
        uint256 id2 = house.play{value: STAKE}(address(0), STAKE, pm);
        house.settle(id2, s2);
        assertEq(nababa.balanceOf(alice), 0, "no reward when budget exhausted");
    }

    function test_WithdrawNative_RevertsIfRecipientRejects() public {
        HouseRejecting rej = new HouseRejecting(house);
        vm.deal(address(rej), STAKE);
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        bytes32 seed = _findSeed(pm, house.nextGameId(), 1);
        _pushSeed(seed);
        rej.play(STAKE, pm);
        house.settle(rej.lastId(), seed);
        vm.expectRevert(RonkeBattlesHouse.WrongValue.selector);
        rej.tryWithdraw();
        assertGt(house.pending(address(0), address(rej)), 0, "funds still claimable");
    }

    function test_CommitOfView() public view {
        bytes32 s = _seed(123);
        assertEq(house.commitOf(s), keccak256(abi.encode(s)));
    }

    function test_AvailableSeedsView() public {
        assertEq(house.availableSeeds(), 0);
        _pushSeed(_seed(1));
        _pushSeed(_seed(2));
        assertEq(house.availableSeeds(), 2);
    }

    // ═══════════════════════ REENTRANCY ═══════════════════════

    function test_Reentrancy_WithdrawSafe() public {
        HouseReentrant atk = new HouseReentrant(house);
        // darle un win y luego intentar reentrar
        uint8[5] memory pm = _m(0, 0, 0, 0, 0);
        bytes32 seed = _findSeed(pm, house.nextGameId(), 1);
        _pushSeed(seed);
        house.setAllowedStake(address(0), STAKE, true);
        vm.deal(address(atk), STAKE); // único funding
        atk.play(STAKE, pm); // usa su propio balance
        house.settle(atk.lastId(), seed);

        uint256 expectWin = (STAKE * 20000) / 10000;
        atk.attack();
        assertEq(address(atk).balance, expectWin, "got winnings once, no double");
        assertEq(house.pending(address(0), address(atk)), 0);
    }

    // ═══════════════════════ FUZZING ═══════════════════════

    /// Fuzz: para cualquier seed/jugadas, settle nunca revierte, mantiene solvencia y paga coherente.
    function testFuzz_SettleSolventAndCoherent(uint256 seedX, uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) public {
        seedX = bound(seedX, 1, type(uint128).max);
        bytes32 seed = bytes32(seedX);
        uint8[5] memory pm = _m(a % 3, b % 3, c % 3, d % 3, e % 3);
        _pushSeed(seed);
        vm.prank(alice);
        uint256 id = house.play{value: STAKE}(address(0), STAKE, pm);
        house.settle(id, seed);

        // solvencia siempre
        uint256 bal = address(house).balance;
        uint256 obligations = house.bankroll(address(0)) + house.reserved(address(0)) + house.pending(address(0), alice);
        assertEq(bal, obligations, "solvent");
        assertEq(house.reserved(address(0)), 0, "reserve always released after settle");
    }
}

/// @notice Atacante de reentrancy sobre withdraw del modo casa.
contract HouseReentrant {
    RonkeBattlesHouse public house;
    uint256 public lastId;
    bool internal reentered;

    constructor(RonkeBattlesHouse h) {
        house = h;
    }

    function play(uint256 stake, uint8[5] memory moves) external {
        lastId = house.play{value: stake}(address(0), stake, moves); // usa balance propio (deal previo)
    }

    function attack() external {
        house.withdraw(address(0));
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            try house.withdraw(address(0)) {} catch {}
        }
    }
}

/// @notice Receptor que rechaza RON: cubre el branch de fallo de transferencia nativa en _payout.
contract HouseRejecting {
    RonkeBattlesHouse public house;
    uint256 public lastId;

    constructor(RonkeBattlesHouse h) {
        house = h;
    }

    function play(uint256 stake, uint8[5] memory moves) external {
        lastId = house.play{value: stake}(address(0), stake, moves);
    }

    function tryWithdraw() external {
        house.withdraw(address(0));
    }
    // sin receive payable → rechaza RON → withdraw revierte
}
