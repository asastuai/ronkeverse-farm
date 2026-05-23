// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NababaToken} from "../src/NababaToken.sol";
import {FarmCore} from "../src/FarmCore.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Deploy a Saigon/Ronin. Valores iniciales son PLACEHOLDERS — comunidad valida.
contract Deploy is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address treasury = vm.envOr("TREASURY", deployer);
        address ronkeverse = vm.envAddress("RONKEVERSE_NFT");
        address ronke = vm.envAddress("RONKE_TOKEN");

        vm.startBroadcast();

        NababaToken nababa = new NababaToken(deployer);
        FarmCore farm = new FarmCore(deployer, nababa, IERC721(ronkeverse), IERC20(ronke), treasury);
        nababa.setMinter(address(farm), true);

        _seedParams(farm);

        vm.stopBroadcast();

        console2.log("NababaToken:", address(nababa));
        console2.log("FarmCore:", address(farm));
        console2.log("Treasury:", treasury);
    }

    function _seedParams(FarmCore farm) internal {
        // Tiers — solo definen max workers + costo de plantation
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 50 ether,   maxWorkers: 3,  requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 250 ether,  maxWorkers: 5,  requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 1000 ether, maxWorkers: 10, requiredNFTs: 0, enabled: true }));
        farm.addTier(FarmCore.PlantationTier({ ronkeCost: 0,          maxWorkers: 15, requiredNFTs: 3, enabled: true }));

        // Pool: 1000 NABABA / hour = 1000 / 3600 NABABA / sec
        farm.setPoolEmission(uint256(1000 ether) / 3600);

        farm.setWorkerParams({
            _hireCost: 10 ether,            // 10 $Ronke per worker
            _staminaSeconds: 6 hours,
            _feedCost: 500 ether            // 500 $NABABA per worker per cycle
        });

        farm.setNFTBoost(400, 10);          // +4% per NFT, cap 10 NFTs (= +40%)
        farm.setTokenBoost(100, 3000);      // +1% per 1k Ronke staked, cap +30%
        farm.setRestakeParams(200, 2000);   // 2% fee, +20% APR boost

        uint64[] memory th = new uint64[](3);
        th[0] = 7 days; th[1] = 30 days; th[2] = 69 days;
        uint16[] memory pen = new uint16[](3);
        pen[0] = 5000; pen[1] = 2500; pen[2] = 1000;
        farm.setJailCurve(th, pen);

        farm.setSeasonDuration(69 days);
    }
}
