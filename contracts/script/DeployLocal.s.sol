// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NababaToken} from "../src/NababaToken.sol";
import {FarmCore} from "../src/FarmCore.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockERC721} from "../test/mocks/MockERC721.sol";

contract DeployLocal is Script {
    function run() external {
        address deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        address player = deployer;

        vm.startBroadcast(deployer);

        MockERC20 ronke = new MockERC20("Ronin Monke (Mock)", "Ronke");
        MockERC721 ronkeverse = new MockERC721("Ronkeverse (Mock)", "RONKE");
        ronke.mint(player, 1_000_000 ether);
        for (uint256 i = 1; i <= 10; i++) ronkeverse.mint(player, i);

        NababaToken nababa = new NababaToken(deployer);
        FarmCore farm = new FarmCore(deployer, nababa, ronkeverse, ronke, deployer);
        nababa.setMinter(address(farm), true);

        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 50 ether,   maxWorkers: 3,  requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 250 ether,  maxWorkers: 5,  requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 1000 ether, maxWorkers: 10, requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 0,          maxWorkers: 15, requiredNFTs: 3, enabled: true }));

        farm.setPoolEmission(uint256(1000 ether) / 3600);
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

        console2.log("Mock $Ronke:     ", address(ronke));
        console2.log("Mock Ronkeverse: ", address(ronkeverse));
        console2.log("Nababa Token:    ", address(nababa));
        console2.log("Farm Core:       ", address(farm));
    }
}
