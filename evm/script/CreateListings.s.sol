// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SharpsMarket} from "../src/SharpsMarket.sol";

/**
 * Open a listing for every KOL wallet, in batches.
 *
 * createListing is admin-only and one call per wallet, so ~108 listings is
 * ~108 transactions. Run it in slices rather than one giant broadcast, so a
 * failure partway through doesn't require redoing the whole set — the script
 * skips wallets that already have a listing, making re-runs safe and
 * idempotent.
 *
 * The wallet list is passed in as an env var rather than hardcoded, so it
 * stays in sync with src/lib/kols.ts (the single source of truth) instead of
 * drifting from a second copy:
 *
 *   KOL_WALLETS=$(node -e "import('./src/lib/kols.ts').then(m=>console.log(m.KOLS.map(k=>k.wallet).join(',')))")
 *
 *   forge script script/CreateListings.s.sol:CreateListings \
 *     --rpc-url https://rpc.testnet.chain.robinhood.com \
 *     --private-key $ADMIN_PRIVATE_KEY \
 *     --broadcast
 *
 * Requires MARKET_ADDRESS (the deployed SharpsMarket) and KOL_WALLETS (a
 * comma-separated list). Optional BATCH_START / BATCH_COUNT slice the list.
 */
contract CreateListings is Script {
    function run() external {
        uint256 adminKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address marketAddress = vm.envAddress("MARKET_ADDRESS");
        address[] memory wallets = vm.envAddress("KOL_WALLETS", ",");

        uint256 start = vm.envOr("BATCH_START", uint256(0));
        uint256 count = vm.envOr("BATCH_COUNT", wallets.length - start);
        if (start + count > wallets.length) count = wallets.length - start;

        SharpsMarket market = SharpsMarket(marketAddress);

        console.log("Market:  ", marketAddress);
        console.log("Wallets: ", wallets.length);
        console.log("Slice:   ", start, "->", start + count);

        uint256 created = 0;
        uint256 skipped = 0;

        vm.startBroadcast(adminKey);
        for (uint256 i = start; i < start + count; i++) {
            address wallet = wallets[i];
            // Idempotent: a re-run after a partial failure skips what already
            // exists instead of reverting the whole script on ListingExists.
            bool exists = market.getListing(wallet).exists;
            if (exists) {
                skipped++;
                continue;
            }
            market.createListing(wallet);
            created++;
        }
        vm.stopBroadcast();

        console.log("Created: ", created);
        console.log("Skipped (already listed):", skipped);
    }
}
