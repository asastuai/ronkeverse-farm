// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NababaToken} from "../src/NababaToken.sol";
import {FarmCore} from "../src/FarmCore.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockERC721} from "../test/mocks/MockERC721.sol";

/// @notice Deploy to Saigon testnet with MOCK Ronkeverse + $Ronke (the originals are mainnet-only).
///         Community can playtest with minted mocks. Mainnet deploy uses real addresses.
contract DeploySaigon is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address treasury = vm.envOr("TREASURY", deployer);

        console2.log("Deploying from:", deployer);

        vm.startBroadcast(deployerKey);

        // Mock Ronkeverse + Ronke (Saigon-only; mainnet uses real addresses)
        MockERC20 ronke = new MockERC20("Ronin Monke (Mock Saigon)", "Ronke");
        MockERC721 ronkeverse = new MockERC721("Ronkeverse (Mock Saigon)", "RONKE");

        // Mint generously to deployer for testing + sharing with community
        ronke.mint(deployer, 10_000_000 ether);
        for (uint256 i = 1; i <= 25; i++) {
            ronkeverse.mint(deployer, i);
        }

        // Farm contracts
        NababaToken nababa = new NababaToken(deployer);
        FarmCore farm = new FarmCore(deployer, nababa, ronkeverse, ronke, treasury);
        nababa.setMinter(address(farm), true);

        // Initial params (placeholders — community will adjust via gov tx)
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 50 ether,   maxWorkers: 3,  requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 250 ether,  maxWorkers: 5,  requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 1000 ether, maxWorkers: 10, requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 0,          maxWorkers: 15, requiredNFTs: 3, enabled: true }));

        farm.setPoolEmission(uint256(1000 ether) / 3600); // 1000 NABABA/hour
        farm.setWorkerParams(10 ether, 6 hours, 500 ether);
        farm.setNFTBoost(400, 10);
        farm.setTokenBoost(100, 3000);
        farm.setRestakeParams(200, 2000);

        uint64[] memory th = new uint64[](3);
        th[0] = 7 days; th[1] = 30 days; th[2] = 69 days;
        uint16[] memory pen = new uint16[](3);
        pen[0] = 5000; pen[1] = 2500; pen[2] = 1000;
        farm.setJailCurve(th, pen);
        farm.setSeasonDuration(69 days);

        vm.stopBroadcast();

        console2.log("");
        console2.log("================== SAIGON DEPLOY ==================");
        console2.log("Mock $Ronke:     ", address(ronke));
        console2.log("Mock Ronkeverse: ", address(ronkeverse));
        console2.log("NababaToken:     ", address(nababa));
        console2.log("FarmCore:        ", address(farm));
        console2.log("Treasury:        ", treasury);
        console2.log("Deployer:        ", deployer);
        console2.log("===================================================");
        console2.log("");
        console2.log("Deployer received:");
        console2.log("  10,000,000 Mock $Ronke");
        console2.log("  25 Mock Ronkeverse NFTs (IDs 1-25)");
        console2.log("");
        console2.log("To mint more for community testers, call directly:");
        console2.log("  ronke.mint(address, amount)");
        console2.log("  ronkeverse.mint(address, tokenId)");
    }
}
