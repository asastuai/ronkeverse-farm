// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RonkeBattles} from "../src/RonkeBattles.sol";
import {NababaToken} from "../src/NababaToken.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @notice Deploy de RonkeBattles a Saigon (juego revenue-first, pivot game-first).
///         Reusa el NababaToken ya deployado. USDC no existe en Saigon → deploya un Mock USDC de test.
///         Treasury default = wallet de testing de Juan (para ver el rake acumular).
contract DeployBattlesSaigon is Script {
    // NababaToken ya deployado en Saigon (override con env NABABA si cambia)
    address constant NABABA_SAIGON = 0xeF78cC194cd2355e17684661A12F04e59376EDe3;
    // Wallet de testing de Juan
    address constant JUAN = 0x52F98F1a7509E0941e1Ce71a4e6dA93C96b41d37;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address nababaAddr = vm.envOr("NABABA", NABABA_SAIGON);
        address treasury = vm.envOr("TREASURY", JUAN);

        console2.log("Deploying RonkeBattles from:", deployer);

        vm.startBroadcast(deployerKey);

        // Mock USDC para testnet (en mainnet se usa el USDC real de Ronin)
        MockERC20 usdc = new MockERC20("Test USDC (Saigon)", "USDC");
        usdc.mint(deployer, 1_000_000 ether);
        usdc.mint(JUAN, 100_000 ether);

        // El juego
        RonkeBattles battles = new RonkeBattles(deployer, nababaAddr, treasury);

        // Permitir que el juego mintee NABABA como reward
        NababaToken(nababaAddr).setMinter(address(battles), true);

        // Whitelist USDC + stake tiers (valores de testnet, settable después)
        battles.setSupportedToken(address(usdc), true);

        // RON tiers (Saigon RON es de test → montos chicos)
        battles.setAllowedStake(address(0), 0.1 ether, true);
        battles.setAllowedStake(address(0), 0.5 ether, true);
        battles.setAllowedStake(address(0), 1 ether, true);
        // USDC tiers
        battles.setAllowedStake(address(usdc), 1 ether, true);
        battles.setAllowedStake(address(usdc), 5 ether, true);
        battles.setAllowedStake(address(usdc), 10 ether, true);

        // Reward config: 100 NABABA/match, 60/40 winner/loser, budget 5M
        battles.setRewardConfig(100 ether, 6000, 5_000_000 ether);

        vm.stopBroadcast();

        console2.log("");
        console2.log("============== RONKE BATTLES SAIGON ==============");
        console2.log("RonkeBattles:  ", address(battles));
        console2.log("NababaToken:   ", nababaAddr);
        console2.log("Test USDC:     ", address(usdc));
        console2.log("Treasury:      ", treasury);
        console2.log("Deployer:      ", deployer);
        console2.log("==================================================");
        console2.log("");
        console2.log("Stake tiers RON:  0.1 / 0.5 / 1");
        console2.log("Stake tiers USDC: 1 / 5 / 10");
        console2.log("Rake: 6%  |  Reward: 100 NABABA/match (60/40)");
        console2.log("Juan funded with 100,000 Test USDC");
    }
}
