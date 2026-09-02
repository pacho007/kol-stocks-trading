// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SharpsMarket} from "../src/SharpsMarket.sol";
import {ScoreLut} from "../src/lib/ScoreLut.sol";

contract SharpsMarketTest is Test {
    SharpsMarket market;
    address admin = address(0xA11CE);
    address oracle = address(0x0ACAC1E);
    address kol = address(0x0001);
    address buyer = address(0xB0B);
    address buyer2 = address(0xB0B2);

    function setUp() public {
        market = new SharpsMarket(admin, oracle);
        vm.prank(admin);
        market.createListing(kol);
    }

    // ------------------------------------------------------------ ScoreLut

    function test_lut_boundaryValues() public pure {
        // score 0 -> BASE/3, 50 -> BASE, 100 -> BASE*3 (see gen-lut-evm.ts).
        assertEq(ScoreLut.priceForScore(0), 1_333_333_333_333);
        assertEq(ScoreLut.priceForScore(50), 4_000_000_000_000);
        assertEq(ScoreLut.priceForScore(100), 12_000_000_000_000);
    }

    function test_lut_isMonotonicNonDecreasing() public pure {
        uint256 prev = ScoreLut.priceForScore(0);
        for (uint8 s = 1; s <= 100; s++) {
            uint256 cur = ScoreLut.priceForScore(s);
            assertGe(cur, prev);
            prev = cur;
        }
    }

    function test_lut_revertsAboveHundred() public {
        vm.expectRevert();
        this.priceForScoreExternal(101);
    }

    function priceForScoreExternal(uint8 score) external pure returns (uint256) {
        return ScoreLut.priceForScore(score);
    }

    // ------------------------------------------------------------- listing

    function test_createListing_opensAtScoreFiftyAndBasePrice() public view {
        (uint8 score, uint256 priceWei,,,,,, bool exists) = market.listings(kol);
        assertTrue(exists);
        assertEq(score, 50);
        assertEq(priceWei, market.OPEN_PRICE_WEI());
    }

    function test_createListing_revertsOnDuplicate() public {
        vm.prank(admin);
        vm.expectRevert(SharpsMarket.ListingExists.selector);
        market.createListing(kol);
    }

    function test_createListing_onlyAdmin() public {
        vm.expectRevert(SharpsMarket.Unauthorized.selector);
        market.createListing(address(0x9999));
    }

    // ---------------------------------------------------------- updatePrice

    function test_updatePrice_onlyOracle() public {
        vm.expectRevert(SharpsMarket.Unauthorized.selector);
        market.updatePrice(kol, 80);
    }

    function test_updatePrice_movesTowardTargetByRateCap() public {
        uint256 before = market.OPEN_PRICE_WEI();
        uint256 target = ScoreLut.priceForScore(100);

        vm.prank(oracle);
        market.updatePrice(kol, 100);

        (, uint256 priceWei,,,,,,) = market.listings(kol);
        uint256 expectedStep = ((target - before) * 25) / 100;
        assertEq(priceWei, before + expectedStep);
        assertLt(priceWei, target); // rate-capped, doesn't snap straight to target
    }

    function test_updatePrice_revertsWhenTooSoon() public {
        vm.prank(oracle);
        market.updatePrice(kol, 60); // first update after createListing is allowed immediately

        vm.prank(oracle);
        vm.expectRevert(SharpsMarket.UpdateTooSoon.selector);
        market.updatePrice(kol, 70);
    }

    function test_updatePrice_allowedAfterInterval() public {
        vm.prank(oracle);
        market.updatePrice(kol, 60);

        vm.warp(block.timestamp + 30);
        vm.prank(oracle);
        market.updatePrice(kol, 70); // should not revert
    }

    function test_updatePrice_revertsOnInvalidScore() public {
        vm.prank(oracle);
        vm.expectRevert(SharpsMarket.InvalidScore.selector);
        market.updatePrice(kol, 101);
    }

    function test_updatePrice_neverExceedsMaxOrMinRails() public {
        vm.prank(oracle);
        market.updatePrice(kol, 100);
        (, uint256 priceWei,,,,,,) = market.listings(kol);
        assertLe(priceWei, market.MAX_PRICE_WEI());
        assertGe(priceWei, market.MIN_PRICE_WEI());
    }

    /// The score a fresh oracle pass computes must NOT show up in full,
    /// instantly — that was the exact bug being fixed here: one lucky/
    /// manufactured trade could previously jump the DISPLAYED score straight
    /// to its raw percentile in a single cycle, even though the tradable
    /// price behind it was still rate-capped and catching up slowly.
    function test_updatePrice_ratecapsScoreNotJustPrice() public {
        vm.prank(oracle);
        market.updatePrice(kol, 100); // raw target score is 100

        (uint8 score,,,,,,,) = market.listings(kol);
        assertLt(score, 100); // did not jump straight to the raw target
        assertGt(score, 50); // but did move up from the neutral open score
    }

    /// Repeated cycles toward the same target should converge score toward
    /// it monotonically, same shape as price's convergence.
    function test_updatePrice_scoreConvergesTowardTargetOverCycles() public {
        uint8 prevScore = 50;
        for (uint256 i = 0; i < 15; i++) {
            vm.warp(block.timestamp + 30);
            vm.prank(oracle);
            market.updatePrice(kol, 100);
            (uint8 score,,,,,,,) = market.listings(kol);
            assertGe(score, prevScore); // monotonically non-decreasing toward 100
            prevScore = score;
        }
        assertEq(prevScore, 100); // fully converged after enough cycles
    }

    // ------------------------------------------------------ batchUpdatePrice

    function test_batchUpdatePrice_appliesEachIndependently() public {
        address kol2 = address(0x0002);
        vm.prank(admin);
        market.createListing(kol2);

        address[] memory wallets = new address[](2);
        uint8[] memory scores = new uint8[](2);
        wallets[0] = kol;
        wallets[1] = kol2;
        scores[0] = 80;
        scores[1] = 20;

        vm.prank(oracle);
        bool[] memory applied = market.batchUpdatePrice(wallets, scores);

        assertTrue(applied[0]);
        assertTrue(applied[1]);
        (uint8 s1,,,,,,,) = market.listings(kol);
        (uint8 s2,,,,,,,) = market.listings(kol2);
        // Score is rate-capped exactly like price now, not a direct
        // assignment: from 50, moves 25% of the way toward the raw target.
        // 50 + (80-50)*25/100 = 57 (Solidity integer division truncates
        // toward zero); 50 + (20-50)*25/100 = 43.
        assertEq(s1, 57);
        assertEq(s2, 43);
    }

    function test_batchUpdatePrice_skipsUnknownListingWithoutReverting() public {
        address[] memory wallets = new address[](2);
        uint8[] memory scores = new uint8[](2);
        wallets[0] = kol;
        wallets[1] = address(0xDEAD); // never created
        scores[0] = 90;
        scores[1] = 90;

        vm.prank(oracle);
        bool[] memory applied = market.batchUpdatePrice(wallets, scores);

        assertTrue(applied[0]);
        assertFalse(applied[1]); // skipped, not reverted
    }

    function test_batchUpdatePrice_onlyOracle() public {
        address[] memory wallets = new address[](1);
        uint8[] memory scores = new uint8[](1);
        wallets[0] = kol;
        scores[0] = 80;

        vm.expectRevert(SharpsMarket.Unauthorized.selector);
        market.batchUpdatePrice(wallets, scores);
    }

    // --------------------------------------------------------------- buy

    function test_buy_mintsSharesAndRefundsRemainder() public {
        uint256 price = market.OPEN_PRICE_WEI();
        uint256 sendAmount = price * 3 + 1; // 1 extra wei should be refunded

        vm.deal(buyer, sendAmount);
        vm.prank(buyer);
        market.buy{value: sendAmount}(kol, 3);

        assertEq(market.shareBalances(kol, buyer), 3);
        assertEq(market.vaultBalance(kol), price * 3);
        assertEq(buyer.balance, 1); // refund of the sub-share remainder
    }

    function test_buy_revertsOnZeroValue() public {
        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.ZeroAmount.selector);
        market.buy{value: 0}(kol, 0);
    }

    function test_buy_revertsOnSlippage() public {
        uint256 price = market.OPEN_PRICE_WEI();
        vm.deal(buyer, price);
        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.SlippageExceeded.selector);
        market.buy{value: price}(kol, 2); // only 1 share obtainable, asked for min 2
    }

    function test_buy_revertsWhenMarketPaused() public {
        vm.prank(admin);
        market.setPaused(true);

        uint256 price = market.OPEN_PRICE_WEI();
        vm.deal(buyer, price);
        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.MarketPaused.selector);
        market.buy{value: price}(kol, 0);
    }

    function test_buy_revertsWhenListingPaused() public {
        vm.prank(admin);
        market.setListingPaused(kol, true);

        uint256 price = market.OPEN_PRICE_WEI();
        vm.deal(buyer, price);
        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.ListingPaused.selector);
        market.buy{value: price}(kol, 0);
    }

    function test_buy_cappedAtSharesCap() public {
        uint256 price = market.OPEN_PRICE_WEI();
        uint256 cap = market.SHARES_PER_LISTING();
        uint256 hugeAmount = price * (cap + 1000);

        vm.deal(buyer, hugeAmount);
        vm.prank(buyer);
        market.buy{value: hugeAmount}(kol, 0);

        assertEq(market.shareBalances(kol, buyer), cap);
        (,, uint256 sharesOutstanding,,,,,) = market.listings(kol);
        assertEq(sharesOutstanding, cap);
    }

    // --------------------------------------------------------------- sell

    function _buyShares(address who, uint256 shares) internal returns (uint256 cost) {
        (, uint256 price,,,,,,) = market.listings(kol);
        cost = price * shares;
        vm.deal(who, cost);
        vm.prank(who);
        market.buy{value: cost}(kol, shares);
    }

    function test_sell_fullyBackedPaysExactQuote() public {
        uint256 cost = _buyShares(buyer, 10);

        vm.prank(buyer);
        market.sell(kol, 10, 0);

        assertEq(buyer.balance, cost); // got back exactly what they put in
        assertEq(market.shareBalances(kol, buyer), 0);
        assertEq(market.vaultBalance(kol), 0);
    }

    function test_sell_revertsOnInsufficientShares() public {
        _buyShares(buyer, 5);

        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.InsufficientShares.selector);
        market.sell(kol, 6, 0);
    }

    function test_sell_haircutWhenUndercollateralized() public {
        // buyer1 buys in at the open price, buyer2 buys in after the price
        // has risen (paying more per share) — vault backing per share is
        // now BELOW buyer1's quote, since buyer1's shares were priced at
        // the old, lower quote.
        _buyShares(buyer, 100);

        vm.prank(oracle);
        market.updatePrice(kol, 100); // price rises

        _buyShares(buyer2, 10);

        // Force the price straight to a value the vault can't fully back,
        // by repeatedly nudging the oracle upward past the rate cap's slow
        // walk, to exercise the haircut path deterministically.
        for (uint256 i = 0; i < 20; i++) {
            vm.warp(block.timestamp + 30);
            vm.prank(oracle);
            market.updatePrice(kol, 100);
        }

        (,, uint256 sharesOutstanding,,,,,) = market.listings(kol);
        (, uint256 priceWei,,,,,,) = market.listings(kol);
        uint256 requested = 100 * priceWei;
        uint256 vaultBal = market.vaultBalance(kol);
        // NAV for buyer's 100-of-sharesOutstanding stake — buyer2 also holds
        // shares at this point, so this is NOT the same as vaultBal itself.
        uint256 expectedNav = (vaultBal * 100) / sharesOutstanding;
        assertLt(expectedNav, requested); // confirms this listing is genuinely thin

        uint256 buyerBalBefore = buyer.balance;
        vm.prank(buyer);
        market.sell(kol, 100, 0);

        uint256 payout = buyer.balance - buyerBalBefore;
        assertLt(payout, requested); // haircut applied
        assertEq(payout, expectedNav); // paid out exactly buyer's pro-rata NAV share
    }

    function test_sell_navPreservedAcrossSequentialSells() public {
        _buyShares(buyer, 100);
        vm.prank(oracle);
        market.updatePrice(kol, 100);
        _buyShares(buyer2, 10);
        for (uint256 i = 0; i < 20; i++) {
            vm.warp(block.timestamp + 30);
            vm.prank(oracle);
            market.updatePrice(kol, 100);
        }

        // The NAV-preservation identity (payout = pro-rata NAV share =>
        // NAV-per-share is unchanged for remaining holders) only holds when
        // the sell is actually NAV-bound — i.e. haircut applies. If the
        // listing were well-backed enough for this seller's stake, sell()
        // instead pays the full quote, which does *not* preserve NAV/share
        // (that's expected: a fully-backed sell isn't diluting anyone).
        (,, uint256 sharesBefore,,,,,) = market.listings(kol);
        (, uint256 priceBefore,,,,,,) = market.listings(kol);
        uint256 vaultBefore = market.vaultBalance(kol);
        uint256 navForSeller = (vaultBefore * 50) / sharesBefore;
        uint256 requested = 50 * priceBefore;
        bool isHaircut = navForSeller < requested;

        uint256 navPerShareBefore = market.backingPerShareWad(kol);

        vm.prank(buyer);
        market.sell(kol, 50, 0);

        uint256 navPerShareAfter = market.backingPerShareWad(kol);
        if (isHaircut) {
            // Selling at NAV should leave NAV-per-share unchanged (within
            // integer-division rounding), i.e. selling order doesn't
            // advantage any one holder once a listing is thin. Relative,
            // not absolute, tolerance — these are WAD-scaled (1e18) values,
            // so a fixed absolute delta is the wrong yardstick regardless of
            // the actual magnitudes involved.
            assertApproxEqRel(navPerShareAfter, navPerShareBefore, 1e9); // within 1e-9 relative
        } else {
            assertGe(navPerShareAfter, navPerShareBefore);
        }
    }

    // ------------------------------------------------------- transferShares

    function test_transferShares_movesBalance() public {
        _buyShares(buyer, 10);

        vm.prank(buyer);
        market.transferShares(kol, buyer2, 4);

        assertEq(market.shareBalances(kol, buyer), 6);
        assertEq(market.shareBalances(kol, buyer2), 4);
    }

    function test_transferShares_revertsOnInsufficientBalance() public {
        _buyShares(buyer, 3);

        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.InsufficientShares.selector);
        market.transferShares(kol, buyer2, 4);
    }
}
