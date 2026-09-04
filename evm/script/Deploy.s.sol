// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SharpsMarket} from "../src/SharpsMarket.sol";

/**
 * Deploy SharpsMarket to Robinhood Chain.
 *
 * Usage (testnet, chain id 46630):
 *   ADMIN_ADDRESS=0x... ORACLE_AUTHORITY_ADDRESS=0x... \
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url https://rpc.testnet.chain.robinhood.com \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast
 *
 * Prefer `bash evm/deploy-testnet.sh`, which also verifies the RPC's chain id
 * and refuses known testnet addresses on mainnet. This script enforces the
 * role rules independently, because the command above is runnable by hand and
 * a guard that lives only in a wrapper is a guard you can walk around.
 *
 * WHY THE ROLES ARE REQUIRED RATHER THAN DEFAULTED
 *
 * These two used to be `vm.envOr(..., deployer)`: unset the variables and
 * admin and oracle both silently became the deployer. That collapses the
 * separation the contract is designed around, into the one key that by
 * definition has been sitting in a shell to sign the deploy. That key could
 * then pause the market (blocking every sell), withdraw protocol fees, and
 * push scores. A doc comment saying "set it explicitly" is not a guard, so
 * the defaults are gone: unset now fails the deploy instead of quietly
 * producing a market with a single point of compromise.
 */
contract Deploy is Script {
    function run() external returns (SharpsMarket market) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // envAddress, not envOr — missing means stop, not "guess the deployer".
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address oracleAuthority = vm.envAddress("ORACLE_AUTHORITY_ADDRESS");

        // The contract rejects zero roles too; failing here costs no gas and
        // says which variable is wrong.
        require(admin != address(0), "ADMIN_ADDRESS is the zero address");
        require(oracleAuthority != address(0), "ORACLE_AUTHORITY_ADDRESS is the zero address");

        // Three distinct keys, or the separation is decorative. Checked here
        // rather than in the contract because it is a deployment policy, not
        // an invariant the market needs at runtime.
        require(admin != deployer, "ADMIN_ADDRESS must not be the deployer");
        require(oracleAuthority != deployer, "ORACLE_AUTHORITY_ADDRESS must not be the deployer");
        require(admin != oracleAuthority, "ADMIN_ADDRESS must not be the oracle authority");

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
