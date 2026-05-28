// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RonkeBattlesHouse} from "../src/RonkeBattlesHouse.sol";
import {NababaToken} from "../src/NababaToken.sol";

/// @notice Deploy del modo PvE (RonkeBattlesHouse) a Saigon. Reusa NABABA + Test USDC ya deployados.
///         Bankroll + seed commits se cargan después con el keeper JS (que tiene el master seed off-chain).
contract DeployHouseSaigon is Script {
    address constant NABABA = 0xeF78cC194cd2355e17684661A12F04e59376EDe3;
    address constant USDC = 0x238e4fBCc97053257282C32dcde6f840D2911f97;
    address constant JUAN = 0x52F98F1a7509E0941e1Ce71a4e6dA93C96b41d37;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address treasury = vm.envOr("TREASURY", JUAN);

        vm.startBroadcast(deployerKey);

        RonkeBattlesHouse house = new RonkeBattlesHouse(deployer, NABABA, treasury);
        NababaToken(NABABA).setMinter(address(house), true);

        house.setSupportedToken(USDC, true);
        // stake tiers de testnet (chicos)
        house.setAllowedStake(address(0), 0.05 ether, true);
        house.setAllowedStake(address(0), 0.1 ether, true);
        house.setAllowedStake(USDC, 1 ether, true);
        house.setAllowedStake(USDC, 5 ether, true);

        house.setRewardConfig(50 ether, 5_000_000 ether); // 50 NABABA por partida, budget 5M
        // win 2.0x + tie-to-house 30% son los defaults del contrato → house edge ~6%

        vm.stopBroadcast();

        console2.log("============== RONKE BATTLES HOUSE (PvE) ==============");
        console2.log("RonkeBattlesHouse:", address(house));
        console2.log("NababaToken:      ", NABABA);
        console2.log("Test USDC:        ", USDC);
        console2.log("Treasury:         ", treasury);
        console2.log("winMultiplier: 2.0x | tieToHouse: 30% | edge ~6%");
        console2.log("NEXT: correr keeper JS para bankroll + seed commits");
    }
}
