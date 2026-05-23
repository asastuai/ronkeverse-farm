// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {NababaToken} from "../src/NababaToken.sol";
import {FarmCore} from "../src/FarmCore.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC721} from "./mocks/MockERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract FarmCoreTest is Test {
    NababaToken nababa;
    FarmCore farm;
    MockERC721 nft;
    MockERC20 ronke;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant POOL_RATE = uint256(1000 ether) / 3600; // 1000/h

    function setUp() public {
        vm.startPrank(owner);

        nft = new MockERC721("Ronkeverse", "RONKE");
        ronke = new MockERC20("Ronin Monke", "Ronke");
        nababa = new NababaToken(owner);
        farm = new FarmCore(owner, nababa, IERC721(address(nft)), IERC20(address(ronke)), treasury);
        nababa.setMinter(address(farm), true);

        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 50 ether,  maxWorkers: 3,  requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 250 ether, maxWorkers: 5,  requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 0,         maxWorkers: 15, requiredNFTs: 3, enabled: true }));

        farm.setPoolEmission(POOL_RATE);
        farm.setWorkerParams(10 ether, 6 hours, 500 ether);
        farm.setNFTBoost(400, 10);
        farm.setTokenBoost(100, 3000);
        farm.setRestakeParams(200, 2000);

        uint64[] memory th = new uint64[](3);
        th[0] = 7 days; th[1] = 30 days; th[2] = 69 days;
        uint16[] memory pen = new uint16[](3);
        pen[0] = 5000; pen[1] = 2500; pen[2] = 1000;
        farm.setJailCurve(th, pen);

        vm.stopPrank();

        ronke.mint(alice, 100_000 ether);
        ronke.mint(bob, 100_000 ether);
        for (uint256 i = 1; i <= 5; i++) nft.mint(alice, i);
    }

    // ─────────────────────────────────────────────────────────────────────

    function test_SoloFarmer_GetsFullPool() public {
        vm.startPrank(alice);
        ronke.approve(address(farm), type(uint256).max);

        uint256 plantId = farm.buyPlantation(0);
        farm.hireWorkers(plantId, 3);

        // Avanza 1 hora → debería recibir ~1000 NABABA (todo el pool)
        vm.warp(block.timestamp + 1 hours);

        uint256 pending = farm.pendingRewards(alice, plantId);
        // tolerancia 2% por imprecisión MasterChef
        assertApproxEqRel(pending, 1000 ether, 0.02e18, "solo farmer should get ~full hour pool");

        farm.claim(plantId);
        // jail penalty 50% por <7d → user receives ~500
        assertApproxEqRel(nababa.balanceOf(alice), 500 ether, 0.05e18, "50% jail penalty");

        vm.stopPrank();
    }

    function test_TwoFarmers_PoolSplits() public {
        vm.startPrank(alice);
        ronke.approve(address(farm), type(uint256).max);
        uint256 alicePlant = farm.buyPlantation(0);
        farm.hireWorkers(alicePlant, 2);
        vm.stopPrank();

        vm.startPrank(bob);
        ronke.approve(address(farm), type(uint256).max);
        uint256 bobPlant = farm.buyPlantation(0);
        farm.hireWorkers(bobPlant, 2);
        vm.stopPrank();

        // Ambos con 2 workers cada uno = 4 totales. 1 hora → 1000 NABABA total.
        // Alice debería recibir ~500, Bob ~500
        vm.warp(block.timestamp + 1 hours);

        uint256 aliceP = farm.pendingRewards(alice, alicePlant);
        uint256 bobP = farm.pendingRewards(bob, bobPlant);

        assertApproxEqRel(aliceP, 500 ether, 0.05e18, "alice ~half");
        assertApproxEqRel(bobP, 500 ether, 0.05e18, "bob ~half");
    }

    function test_NFTBoost_Linear() public {
        // Alice stake 5 NFTs → +20% boost (5 × 4%)
        vm.startPrank(alice);
        ronke.approve(address(farm), type(uint256).max);
        nft.setApprovalForAll(address(farm), true);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1; ids[1] = 2; ids[2] = 3; ids[3] = 4; ids[4] = 5;
        farm.stakeNFTs(ids);

        assertEq(farm.userBoostBps(alice), 2000, "5 NFTs = 2000bps = +20%");

        uint256 plantId = farm.buyPlantation(0);
        farm.hireWorkers(plantId, 3);

        vm.warp(block.timestamp + 1 hours);

        uint256 pending = farm.pendingRewards(alice, plantId);
        // Sin boost recibiría ~1000. Con +20%: ~1200
        assertApproxEqRel(pending, 1200 ether, 0.05e18, "1.2x with 5 NFTs");
        vm.stopPrank();
    }

    function test_StaminaExpires_StopsEarning() public {
        vm.startPrank(alice);
        ronke.approve(address(farm), type(uint256).max);
        uint256 plantId = farm.buyPlantation(0);
        farm.hireWorkers(plantId, 3);

        // Avanza 5h → stamina viva, gana
        vm.warp(block.timestamp + 5 hours);
        uint256 pendingAt5h = farm.pendingRewards(alice, plantId);
        assertGt(pendingAt5h, 0);

        // Avanza otras 5h → stamina muerta a las 6h, no debe ganar más (mucho)
        vm.warp(block.timestamp + 5 hours);
        uint256 pendingAt10h = farm.pendingRewards(alice, plantId);

        // Pending debería ser ~6h * 1000/h pero NO 10h * 1000/h
        // (la stamina cerró a las 6h)
        // Tolerancia generosa por la pro-rata approximation
        assertLt(pendingAt10h, 7000 ether, "should not accumulate past stamina end");
        vm.stopPrank();
    }

    function test_Restake_BoostsAndSkipsJail() public {
        vm.startPrank(alice);
        ronke.approve(address(farm), type(uint256).max);
        uint256 plantId = farm.buyPlantation(0);
        farm.hireWorkers(plantId, 3);
        vm.warp(block.timestamp + 1 hours);

        uint256 pendingBefore = farm.pendingRewards(alice, plantId);
        farm.restake(plantId);

        // Nuevo accruedNababa = (gross - 2% fee) * 1.20
        uint256 pendingAfter = farm.pendingRewards(alice, plantId);
        assertApproxEqRel(pendingAfter, (pendingBefore * 98 * 120) / (100 * 100), 0.05e18);
        assertGt(farm.restakerPool(), 0, "fee went to pool");
        assertEq(nababa.balanceOf(alice), 0, "no mint to user");
        vm.stopPrank();
    }

    function test_GoldenPlantation_RequiresNFTs() public {
        vm.startPrank(alice);
        ronke.approve(address(farm), type(uint256).max);

        vm.expectRevert(FarmCore.NFTRequirementNotMet.selector);
        farm.buyPlantation(2); // golden requires 3 NFTs

        nft.setApprovalForAll(address(farm), true);
        uint256[] memory ids = new uint256[](3);
        ids[0] = 1; ids[1] = 2; ids[2] = 3;
        farm.stakeNFTs(ids);

        farm.buyPlantation(2);
        vm.stopPrank();
    }

    function test_ExpireStamina_AnyoneCanClean() public {
        vm.startPrank(alice);
        ronke.approve(address(farm), type(uint256).max);
        uint256 plantId = farm.buyPlantation(0);
        farm.hireWorkers(plantId, 3);
        vm.stopPrank();

        assertEq(farm.totalActiveWorkers(), 3);

        // Pasan 7 horas (stamina expira a las 6h)
        vm.warp(block.timestamp + 7 hours);

        // Bob limpia el state de alice
        vm.prank(bob);
        farm.expireStamina(alice, plantId);

        assertEq(farm.totalActiveWorkers(), 0, "alice removed from pool");
    }
}
