// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SharpsMarket} from "../src/SharpsMarket.sol";

/**
 * Deploy SharpsMarket to Robinhood Chain.
 *
 * Usage (testnet, chain id 46630):
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url https://rpc.testnet.chain.robinhood.com \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast
 *
 * Usage (mainnet, chain id 4663) — same command with
 * --rpc-url https://rpc.mainnet.chain.robinhood.com, only once the testnet
 * deploy has been exercised end-to-end (create_listing, buy, sell,
 * update_price) and the admin/oracle keys below are real, separately-held
 * keys, not the deployer's own key.
 *
 * ORACLE_AUTHORITY defaults to the deployer if unset — set it explicitly to
 * a separate key before any real deployment, same separation-of-privilege
 * reasoning as anchor/programs/sharps/src/state.rs::Config's doc comment.
 */
contract Deploy is Script {
    function run() external returns (SharpsMarket market) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        address oracleAuthority = vm.envOr("ORACLE_AUTHORITY_ADDRESS", deployer);

        console.log("Deployer:        ", deployer);
        console.log("Admin:           ", admin);
        console.log("Oracle authority:", oracleAuthority);

        vm.startBroadcast(deployerKey);
        market = new SharpsMarket(admin, oracleAuthority);
        vm.stopBroadcast();

        console.log("SharpsMarket deployed at:", address(market));
        console.log("OPEN_PRICE_WEI:", market.OPEN_PRICE_WEI());
    }
}
