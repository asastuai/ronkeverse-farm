// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RonkeBattles} from "../src/RonkeBattles.sol";
import {NababaToken} from "../src/NababaToken.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Self-audit suite para RonkeBattles. Cubre happy paths + vectores adversariales
///         de docs/RONKE-BATTLES-SPEC.md §7. Estándar de seguridad completo aunque sea mini-juego.
contract RonkeBattlesTest is Test {
    RonkeBattles battles;
    NababaToken nababa;
    MockERC20 usdc;

    address owner = address(this);
    address treasury = address(0x7E);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant STAKE = 10 ether;
    bytes32 constant SALT_A = bytes32(uint256(0xA));
    bytes32 constant SALT_B = bytes32(uint256(0xB));

    function setUp() public {
        nababa = new NababaToken(owner);
        battles = new RonkeBattles(owner, address(nababa), treasury);
        usdc = new MockERC20("USD Coin", "USDC");

        // battles puede mintear NABABA como reward
        nababa.setMinter(address(battles), true);

        // permitir RON + USDC con tier STAKE
        battles.setSupportedToken(address(usdc), true);
        battles.setAllowedStake(address(0), STAKE, true);
        battles.setAllowedStake(address(usdc), STAKE, true);

        // reward config: 100 NABABA por match, 60/40, budget 1M
        battles.setRewardConfig(100 ether, 6000, 1_000_000 ether);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        usdc.mint(alice, 1000 ether);
        usdc.mint(bob, 1000 ether);
    }

    // ───────────────────────── helpers ──
    function _commit(address player, uint8[5] memory moves, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(player, moves, salt));
    }

    function _m(uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) internal pure returns (uint8[5] memory r) {
        r[0] = a;
        r[1] = b;
        r[2] = c;
        r[3] = d;
        r[4] = e;
    }

    /// crea + joinea un match RON con commits dados, devuelve matchId
    function _openRonMatch(uint8[5] memory movesA, uint8[5] memory movesB) internal returns (uint256 id) {
        vm.prank(alice);
        id = battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, movesA, SALT_A));
        vm.prank(bob);
        battles.joinMatch{value: STAKE}(id, _commit(bob, movesB, SALT_B));
    }

    // ═══════════════════════ HAPPY PATHS ═══════════════════════

    function test_AliceWins_RonPayoutRakeReward() public {
        // Banana(0) x5 vs Monke(1) x5 → Alice gana 5-0
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);

        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);

        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000; // 6%
        assertEq(battles.pending(address(0), alice), pot - rake, "alice payout");
        assertEq(battles.pending(address(0), treasury), rake, "treasury rake");
        assertEq(battles.pending(address(0), bob), 0, "bob nothing");

        // reward 100 NABABA, 60 alice / 40 bob
        assertEq(nababa.balanceOf(alice), 60 ether, "alice reward");
        assertEq(nababa.balanceOf(bob), 40 ether, "bob reward");

        // withdraw real
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        battles.withdraw(address(0));
        assertEq(alice.balance, balBefore + pot - rake, "alice withdrew");
        assertEq(battles.pending(address(0), alice), 0, "pending cleared");
    }

    function test_BobWins() public {
        uint8[5] memory ma = _m(1, 1, 1, 1, 1);
        uint8[5] memory mb = _m(0, 0, 0, 0, 0); // Banana beats Monke → Bob wins
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);

        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000;
        assertEq(battles.pending(address(0), bob), pot - rake);
        assertEq(battles.pending(address(0), alice), 0);
    }

    function test_Tie_SplitsPotMinusRake() public {
        uint8[5] memory same = _m(0, 1, 2, 0, 1);
        uint256 id = _openRonMatch(same, same); // todas las rondas empate → tie
        vm.prank(alice);
        battles.reveal(id, same, SALT_A);
        vm.prank(bob);
        battles.reveal(id, same, SALT_B);

        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000;
        uint256 each = (pot - rake) / 2;
        assertEq(battles.pending(address(0), alice), each);
        assertEq(battles.pending(address(0), bob), pot - rake - each);
        assertEq(battles.pending(address(0), treasury), rake);
        // tie reward: 50/50
        assertEq(nababa.balanceOf(alice), 50 ether);
        assertEq(nababa.balanceOf(bob), 50 ether);
    }

    function test_BestOf5_MixedRounds() public {
        // A gana 3 (rondas 0-2 Banana>Monke), 2 empates → A gana
        uint8[5] memory ma = _m(0, 0, 0, 1, 1);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);
        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000;
        assertEq(battles.pending(address(0), alice), pot - rake);
    }

    function test_UsdcMatch_Works() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);

        vm.startPrank(alice);
        usdc.approve(address(battles), STAKE);
        uint256 id = battles.createMatch(address(usdc), STAKE, _commit(alice, ma, SALT_A));
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(battles), STAKE);
        battles.joinMatch(id, _commit(bob, mb, SALT_B));
        vm.stopPrank();

        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);

        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000;
        assertEq(battles.pending(address(usdc), alice), pot - rake);

        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        battles.withdraw(address(usdc));
        assertEq(usdc.balanceOf(alice), balBefore + pot - rake);
    }

    function test_CancelOpen_Refunds() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        uint256 id = battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, ma, SALT_A));
        vm.prank(alice);
        battles.cancelOpen(id);
        assertEq(battles.pending(address(0), alice), STAKE);
    }

    // ═══════════════════════ TIMEOUT / FORFEIT ═══════════════════════

    function test_Forfeit_AliceRevealsBobDoesnt() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);

        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        // bob no revela; pasa la ventana
        vm.warp(block.timestamp + 25 hours);

        battles.claimTimeout(id);
        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000;
        assertEq(battles.pending(address(0), alice), pot - rake, "forfeit win to alice");
        assertEq(battles.pending(address(0), treasury), rake);
    }

    function test_DoubleNoReveal_RefundsWithRake() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.warp(block.timestamp + 25 hours);
        battles.claimTimeout(id);

        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000; // doubleNoRevealRake = true por default
        uint256 each = (pot - rake) / 2;
        assertEq(battles.pending(address(0), alice), each);
        assertEq(battles.pending(address(0), treasury), rake);
    }

    function test_DoubleNoReveal_NoRakeWhenDisabled() public {
        battles.setDoubleNoRevealRake(false);
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint256 id = _openRonMatch(ma, ma);
        vm.warp(block.timestamp + 25 hours);
        battles.claimTimeout(id);
        assertEq(battles.pending(address(0), alice), STAKE);
        assertEq(battles.pending(address(0), bob), STAKE);
        assertEq(battles.pending(address(0), treasury), 0);
    }

    // ═══════════════════════ ADVERSARIAL / REVERTS ═══════════════════════

    function test_RevertWhen_JoinOwnMatch() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        uint256 id = battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, ma, SALT_A));
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.CannotJoinOwn.selector);
        battles.joinMatch{value: STAKE}(id, _commit(alice, ma, SALT_B));
    }

    function test_RevertWhen_WrongMsgValue() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.WrongValue.selector);
        battles.createMatch{value: STAKE - 1}(address(0), STAKE, _commit(alice, ma, SALT_A));
    }

    function test_RevertWhen_NativeValueOnErc20() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.startPrank(alice);
        usdc.approve(address(battles), STAKE);
        vm.expectRevert(RonkeBattles.WrongValue.selector);
        battles.createMatch{value: 1}(address(usdc), STAKE, _commit(alice, ma, SALT_A));
        vm.stopPrank();
    }

    function test_RevertWhen_StakeNotAllowed() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.StakeNotAllowed.selector);
        battles.createMatch{value: 5 ether}(address(0), 5 ether, _commit(alice, ma, SALT_A));
    }

    function test_RevertWhen_TokenNotSupported() public {
        MockERC20 rogue = new MockERC20("X", "X");
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.TokenNotSupported.selector);
        battles.createMatch(address(rogue), STAKE, _commit(alice, ma, SALT_A));
    }

    function test_RevertWhen_BadReveal_WrongSalt() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.BadReveal.selector);
        battles.reveal(id, ma, bytes32(uint256(0xDEAD))); // salt incorrecto
    }

    function test_RevertWhen_BadReveal_WrongMoves() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.BadReveal.selector);
        battles.reveal(id, _m(2, 2, 2, 2, 2), SALT_A); // jugadas distintas a las commiteadas
    }

    function test_RevertWhen_BadReveal_Bob() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(bob);
        vm.expectRevert(RonkeBattles.BadReveal.selector);
        battles.reveal(id, mb, bytes32(uint256(0xBEEF))); // salt incorrecto para B
    }

    function test_RevertWhen_BadMove_OutOfRange() public {
        // commit con una carta inválida (3); el reveal debe revertir por BadMove
        uint8[5] memory bad = _m(0, 0, 0, 0, 3);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        vm.prank(alice);
        uint256 id = battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, bad, SALT_A));
        vm.prank(bob);
        battles.joinMatch{value: STAKE}(id, _commit(bob, mb, SALT_B));
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.BadMove.selector);
        battles.reveal(id, bad, SALT_A);
    }

    function test_RevertWhen_RevealByNonParticipant() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(address(0xDEAD));
        vm.expectRevert(RonkeBattles.NotParticipant.selector);
        battles.reveal(id, ma, SALT_A);
    }

    function test_RevertWhen_DoubleReveal() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.AlreadyRevealed.selector);
        battles.reveal(id, ma, SALT_A);
    }

    function test_RevertWhen_RevealAfterWindow() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.warp(block.timestamp + 25 hours);
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.RevealWindowClosed.selector);
        battles.reveal(id, ma, SALT_A);
    }

    function test_RevertWhen_ClaimTimeoutBeforeWindow() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.expectRevert(RonkeBattles.RevealWindowOpen.selector);
        battles.claimTimeout(id);
    }

    function test_RevertWhen_RakeAboveMax() public {
        vm.expectRevert(RonkeBattles.BadRake.selector);
        battles.setRake(1001); // > 10%
    }

    function test_RevertWhen_WithdrawNothing() public {
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.NothingToWithdraw.selector);
        battles.withdraw(address(0));
    }

    function test_RevertWhen_NonOwnerSetsRake() public {
        vm.prank(alice);
        vm.expectRevert();
        battles.setRake(100);
    }

    // ═══════════════════════ PAUSE ═══════════════════════

    function test_Pause_BlocksCreateAndJoin_NotWithdraw() public {
        // armar pending para alice via cancel
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        uint256 id = battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, ma, SALT_A));
        vm.prank(alice);
        battles.cancelOpen(id);

        battles.pause();

        vm.prank(alice);
        vm.expectRevert(); // whenNotPaused
        battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, ma, SALT_A));

        // withdraw funciona en pausa (failsafe)
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        battles.withdraw(address(0));
        assertEq(alice.balance, balBefore + STAKE);
    }

    function test_Unpause_RestoresPlay() public {
        battles.pause();
        battles.unpause();
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, ma, SALT_A)); // no revierte
    }

    function test_RevertWhen_DoubleReveal_Bob() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);
        vm.prank(bob);
        vm.expectRevert(RonkeBattles.AlreadyRevealed.selector);
        battles.reveal(id, mb, SALT_B);
    }

    function test_Forfeit_BobRevealsAliceDoesnt() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);
        vm.warp(block.timestamp + 25 hours);
        battles.claimTimeout(id);
        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000;
        assertEq(battles.pending(address(0), bob), pot - rake, "forfeit win to bob");
        assertEq(battles.pending(address(0), alice), 0);
    }

    // ═══════════════════════ REENTRANCY ═══════════════════════

    function test_Reentrancy_WithdrawIsSafe() public {
        ReentrantAttacker atk = new ReentrantAttacker(battles);
        vm.deal(address(atk), STAKE); // único funding: el atacante solo tiene su stake

        // attacker crea y cancela → deposita STAKE (queda en 0) y pending = STAKE
        atk.setup(STAKE);
        assertEq(address(atk).balance, 0, "stake depositado");
        assertEq(battles.pending(address(0), address(atk)), STAKE);

        // intenta reentrar en withdraw
        atk.attack();

        // solo retiró STAKE una vez; el guard bloqueó la reentrada, pending en 0
        assertEq(address(atk).balance, STAKE, "attacker got exactly stake, no double");
        assertEq(battles.pending(address(0), address(atk)), 0);
    }

    // ═══════════════════════ ECONOMÍA / INVARIANTES ═══════════════════════

    function test_SelfMatch_IsNegativeEV() public {
        // un mismo usuario controla A y B (sybil con dos wallets) para farmear reward NABABA.
        // El rake hace que pierda RON neto → -EV, el self-farm no es rentable.
        address sybil1 = alice;
        address sybil2 = bob;
        uint256 ronBefore = sybil1.balance + sybil2.balance;

        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);

        vm.prank(alice);
        battles.withdraw(address(0));
        // bob no tiene nada que retirar (perdió)

        uint256 ronAfter = sybil1.balance + sybil2.balance;
        uint256 pot = STAKE * 2;
        uint256 rake = pot * 600 / 10000;
        assertEq(ronBefore - ronAfter, rake, "sybil pierde exactamente el rake en RON");
    }

    function test_RewardBudget_StopsWhenExhausted() public {
        // budget chico: 150 NABABA. Primer match mintea 100, segundo excede (200 > 150) → no mintea.
        battles.setRewardConfig(100 ether, 6000, 150 ether);

        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);

        uint256 id1 = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id1, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id1, mb, SALT_B);
        assertEq(nababa.balanceOf(alice), 60 ether, "primer reward minteado");

        uint256 id2 = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id2, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id2, mb, SALT_B);
        // budget exhausto → no se mintea más, pero el match igual settlea
        assertEq(nababa.balanceOf(alice), 60 ether, "segundo reward NO minteado (budget)");
        assertEq(battles.rewardsMinted(), 100 ether);
    }

    // ═══════════════════════ COVERAGE: ADMIN / VIEWS / BRANCHES ═══════════════════════

    function test_Constructor_RevertsZeroAddresses() public {
        vm.expectRevert(RonkeBattles.ZeroAddress.selector);
        new RonkeBattles(owner, address(0), treasury);
        vm.expectRevert(RonkeBattles.ZeroAddress.selector);
        new RonkeBattles(owner, address(nababa), address(0));
    }

    function test_SetTreasury() public {
        battles.setTreasury(alice);
        assertEq(battles.treasury(), alice);
        vm.expectRevert(RonkeBattles.ZeroAddress.selector);
        battles.setTreasury(address(0));
    }

    function test_SetWindows() public {
        battles.setWindows(1 hours, 2 hours);
        assertEq(battles.revealWindow(), 1 hours);
        assertEq(battles.joinWindow(), 2 hours);
        vm.expectRevert(RonkeBattles.WrongValue.selector);
        battles.setWindows(0, 1 hours);
        vm.expectRevert(RonkeBattles.WrongValue.selector);
        battles.setWindows(1 hours, 0);
    }

    function test_SetSupportedToken_RevertsZero() public {
        vm.expectRevert(RonkeBattles.ZeroAddress.selector);
        battles.setSupportedToken(address(0), true);
    }

    function test_SetAllowedStake_RevertsZeroStake() public {
        vm.expectRevert(RonkeBattles.StakeNotAllowed.selector);
        battles.setAllowedStake(address(0), 0, true);
    }

    function test_SetRewardConfig_RevertsBadSplit() public {
        vm.expectRevert(RonkeBattles.BadSplit.selector);
        battles.setRewardConfig(100 ether, 10001, 1000 ether);
    }

    function test_ComputeCommit_MatchesReveal() public view {
        uint8[5] memory ma = _m(0, 1, 2, 0, 1);
        assertEq(battles.computeCommit(alice, ma, SALT_A), _commit(alice, ma, SALT_A));
    }

    function test_GetMatch_ReturnsState() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        (address pA, address pB, address tok, uint256 stk, RonkeBattles.Status st,,,) = battles.getMatch(id);
        assertEq(pA, alice);
        assertEq(pB, bob);
        assertEq(tok, address(0));
        assertEq(stk, STAKE);
        assertEq(uint256(st), uint256(RonkeBattles.Status.Joined));
    }

    function test_RevertWhen_RevealOnOpenMatch() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        uint256 id = battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, ma, SALT_A));
        vm.prank(alice);
        vm.expectRevert(RonkeBattles.NotJoined.selector);
        battles.reveal(id, ma, SALT_A);
    }

    function test_RevertWhen_CancelNonOpenOrNotCreator() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.expectRevert(RonkeBattles.NotOpen.selector);
        battles.cancelOpen(id); // ya está Joined

        vm.prank(alice);
        uint256 id2 = battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, ma, SALT_A));
        vm.prank(bob);
        vm.expectRevert(RonkeBattles.NotCreator.selector);
        battles.cancelOpen(id2);
    }

    function test_RevertWhen_ClaimTimeoutOnNonJoined() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        vm.prank(alice);
        uint256 id = battles.createMatch{value: STAKE}(address(0), STAKE, _commit(alice, ma, SALT_A));
        vm.expectRevert(RonkeBattles.NotJoined.selector);
        battles.claimTimeout(id);
    }

    function test_RevertWhen_JoinNonOpen() public {
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(address(0xCAFE));
        vm.deal(address(0xCAFE), STAKE);
        vm.expectRevert(RonkeBattles.NotOpen.selector);
        battles.joinMatch{value: STAKE}(id, _commit(address(0xCAFE), mb, SALT_B));
    }

    function test_RewardSplit_AllToWinner_NoLoserMint() public {
        battles.setRewardConfig(100 ether, 10000, 1_000_000 ether); // 100% winner
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);
        assertEq(nababa.balanceOf(alice), 100 ether);
        assertEq(nababa.balanceOf(bob), 0);
    }

    function test_NoReward_WhenPerMatchZero() public {
        battles.setRewardConfig(0, 6000, 1_000_000 ether);
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);
        assertEq(nababa.balanceOf(alice), 0);
        assertEq(battles.rewardsMinted(), 0);
    }

    function test_TieReward_BudgetExhausted_NoMint() public {
        battles.setRewardConfig(100 ether, 6000, 50 ether); // budget < perMatch
        uint8[5] memory same = _m(0, 1, 2, 0, 1);
        uint256 id = _openRonMatch(same, same);
        vm.prank(alice);
        battles.reveal(id, same, SALT_A);
        vm.prank(bob);
        battles.reveal(id, same, SALT_B);
        assertEq(nababa.balanceOf(alice), 0);
        assertEq(nababa.balanceOf(bob), 0);
    }

    function test_WithdrawNative_RevertsIfRecipientRejects() public {
        // un contrato que rechaza RON no puede romper a otros: su propio withdraw revierte,
        // pero los fondos quedan reclamables (no se pierden).
        RejectingReceiver rej = new RejectingReceiver(battles);
        vm.deal(address(rej), STAKE);
        rej.deposit(STAKE); // crea + cancela → pending
        vm.expectRevert(RonkeBattles.WrongValue.selector);
        rej.tryWithdraw();
        assertEq(battles.pending(address(0), address(rej)), STAKE, "fondos siguen reclamables");
    }

    // ═══════════════════════ FUZZING / INVARIANTES ═══════════════════════

    /// referencia independiente del resolver (re-implementada distinto para cross-check)
    function _refWinner(uint8[5] memory a, uint8[5] memory b) internal pure returns (uint8) {
        int256 score; // >0 A, <0 B
        for (uint256 i = 0; i < 5; i++) {
            uint8 x = a[i] % 3;
            uint8 y = b[i] % 3;
            if (x == y) continue;
            // x vence a y si (x+1)%3 == y
            if ((x + 1) % 3 == y) score++;
            else score--;
        }
        if (score > 0) return 1;
        if (score < 0) return 2;
        return 0;
    }

    /// Fuzz: cualquier combinación de jugadas válidas settlea sin revertir, conserva fondos
    /// exactamente (sin crear ni trabar RON) y paga al ganador correcto.
    function testFuzz_FullMatch_ConservesAndResolvesCorrectly(
        uint8 a0, uint8 a1, uint8 a2, uint8 a3, uint8 a4,
        uint8 b0, uint8 b1, uint8 b2, uint8 b3, uint8 b4
    ) public {
        uint8[5] memory ma = _m(a0 % 3, a1 % 3, a2 % 3, a3 % 3, a4 % 3);
        uint8[5] memory mb = _m(b0 % 3, b1 % 3, b2 % 3, b3 % 3, b4 % 3);

        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);

        // conservación: balance del contrato == suma de pendings == pot
        uint256 pot = STAKE * 2;
        uint256 sumPending = battles.pending(address(0), alice) + battles.pending(address(0), bob)
            + battles.pending(address(0), treasury);
        assertEq(address(battles).balance, pot, "no se crea/traba RON");
        assertEq(sumPending, pot, "pendings suman el pot");

        // ganador correcto vs referencia independiente
        uint256 rake = pot * 600 / 10000;
        uint8 ref = _refWinner(ma, mb);
        if (ref == 1) {
            assertEq(battles.pending(address(0), alice), pot - rake, "A debe ganar");
            assertEq(battles.pending(address(0), bob), 0);
        } else if (ref == 2) {
            assertEq(battles.pending(address(0), bob), pot - rake, "B debe ganar");
            assertEq(battles.pending(address(0), alice), 0);
        } else {
            // empate: split, treasury cobra rake, jugadores se reparten el resto
            assertEq(battles.pending(address(0), treasury), rake, "empate cobra rake");
        }
    }

    /// Fuzz: con cualquier rake válido (<= MAX), el payout nunca excede el pot.
    function testFuzz_PayoutNeverExceedsPot(uint16 rakeBps) public {
        rakeBps = uint16(bound(rakeBps, 0, 1000)); // <= MAX_RAKE_BPS
        battles.setRake(rakeBps);

        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);

        uint256 pot = STAKE * 2;
        uint256 rake = pot * rakeBps / 10000;
        assertEq(battles.pending(address(0), alice), pot - rake);
        assertLe(battles.pending(address(0), alice), pot, "payout <= pot");
        assertEq(battles.pending(address(0), alice) + battles.pending(address(0), treasury), pot, "suma exacta");
    }

    function test_FundsConservation_NoStuckOrCreated() public {
        // tras settle, el balance del contrato == suma de pendings (no se crea ni se traba RON)
        uint8[5] memory ma = _m(0, 0, 0, 0, 0);
        uint8[5] memory mb = _m(1, 1, 1, 1, 1);
        uint256 id = _openRonMatch(ma, mb);
        vm.prank(alice);
        battles.reveal(id, ma, SALT_A);
        vm.prank(bob);
        battles.reveal(id, mb, SALT_B);

        uint256 contractBal = address(battles).balance;
        uint256 sumPending = battles.pending(address(0), alice) + battles.pending(address(0), bob)
            + battles.pending(address(0), treasury);
        assertEq(contractBal, sumPending, "balance == suma de pendings");
        assertEq(contractBal, STAKE * 2, "exactamente el pot");
    }
}

/// @notice Atacante de reentrancy: al recibir RON intenta re-llamar withdraw.
contract ReentrantAttacker {
    RonkeBattles public battles;
    bool internal reentered;

    constructor(RonkeBattles b) {
        battles = b;
    }

    function setup(uint256 stake) external {
        uint8[5] memory ma;
        ma[0] = 0;
        uint256 id = battles.createMatch{value: stake}(address(0), stake, keccak256(abi.encode(address(this), ma, bytes32(0))));
        battles.cancelOpen(id);
    }

    function attack() external {
        battles.withdraw(address(0));
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            // intento de reentrada — debe fallar silenciosamente (guard) sin drenar
            try battles.withdraw(address(0)) {} catch {}
        }
    }
}

/// @notice Receptor que rechaza RON: usado para testear el branch de fallo de transferencia nativa.
contract RejectingReceiver {
    RonkeBattles public battles;

    constructor(RonkeBattles b) {
        battles = b;
    }

    function deposit(uint256 stake) external {
        uint8[5] memory ma;
        uint256 id = battles.createMatch{value: stake}(address(0), stake, keccak256(abi.encode(address(this), ma, bytes32(0))));
        battles.cancelOpen(id);
    }

    function tryWithdraw() external {
        battles.withdraw(address(0));
    }

    // sin receive/fallback payable → rechaza RON entrante → withdraw revierte con WrongValue
}
