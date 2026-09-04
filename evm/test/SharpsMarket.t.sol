// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SharpsMarket} from "../src/SharpsMarket.sol";
import {ScoreLut} from "../src/lib/ScoreLut.sol";
import {Curve} from "../src/lib/Curve.sol";

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
        SharpsMarket.Listing memory L = market.getListing(kol);
        uint8 score = L.score; uint256 priceWei = L.priceWei; bool exists = L.exists;
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

    /// Price is no longer rate-capped independently — there is now ONE rate
    /// cap, on the score, and the price follows it through the multiplier.
    /// So a single update moves the price by exactly the ratio the capped
    /// score implies, not by a separate 25% walk of its own.
    function test_updatePrice_priceFollowsRateCappedScore() public {
        uint256 before = market.OPEN_PRICE_WEI();

        vm.prank(oracle);
        market.updatePrice(kol, 100);

        SharpsMarket.Listing memory L = market.getListing(kol);
        // 50 -> 62 after one 25% step toward 100.
        assertEq(L.score, 62);

        // Empty book, so the multiplier applies in full: price is the curve's
        // spot price scaled by LUT[62]/LUT[50].
        uint256 expectedMult = (ScoreLut.priceForScore(62) * market.MULT_ONE()) / ScoreLut.priceForScore(50);
        assertEq(L.scoreMult, expectedMult);
        assertEq(L.priceWei, (Curve.spotPrice(0) * expectedMult) / market.MULT_ONE());

        assertGt(L.priceWei, before); // moved up
        assertLt(L.priceWei, (Curve.spotPrice(0) * 3)); // but nowhere near the score-100 ceiling
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
        uint256 priceWei = market.getListing(kol).priceWei;
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

        uint8 score = market.getListing(kol).score;
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
            uint8 score = market.getListing(kol).score;
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
        uint8 s1 = market.getListing(kol).score;
        uint8 s2 = market.getListing(kol2).score;
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
        uint256 exact = market.quoteBuy(kol, 3);
        uint256 sendAmount = exact + 1; // 1 extra wei should be refunded

        vm.deal(buyer, sendAmount);
        vm.prank(buyer);
        market.buy{value: sendAmount}(kol, 3);

        assertEq(market.shareBalances(kol, buyer), 3);
        assertEq(buyer.balance, 1); // refund of the sub-share remainder

        // The vault keeps everything except the trader and protocol slices,
        // which are now separate balances rather than reserve surplus.
        assertEq(
            market.vaultBalance(kol) + market.traderEscrow(kol) + market.protocolTreasury(),
            exact
        );
        assertGt(market.traderEscrow(kol), 0);
        assertGt(market.protocolTreasury(), 0);
    }

    /// Every wei sent must land in exactly one of the three buckets — nothing
    /// stranded in the contract outside the accounting.
    function test_fees_splitAccountsForEveryWei() public {
        uint256 exact = market.quoteBuy(kol, 500);
        vm.deal(buyer, exact);
        vm.prank(buyer);
        market.buy{value: exact}(kol, 500);

        assertEq(
            market.vaultBalance(kol) + market.traderEscrow(kol) + market.protocolTreasury(),
            address(market).balance
        );
    }

    /// Only the listed wallet can claim its own escrow — identity is the
    /// signature, so there's no verification flow to spoof.
    function test_traderEscrow_onlyListedWalletCanClaim() public {
        _buyShares(buyer, 200);
        uint256 owed = market.traderEscrow(kol);
        assertGt(owed, 0);

        // Someone else claiming gets nothing — they have their own (empty)
        // escrow, so this reverts rather than paying out the trader's.
        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.ZeroAmount.selector);
        market.claimTraderFees();

        uint256 before = kol.balance;
        vm.prank(kol);
        market.claimTraderFees();

        assertEq(kol.balance - before, owed);
        assertEq(market.traderEscrow(kol), 0);
    }

    /// Claiming escrow must not eat into the reserve backing the sell
    /// guarantee — they are separate balances.
    function test_traderEscrow_claimDoesNotTouchReserve() public {
        _buyShares(buyer, 300);
        uint256 reserveBefore = market.vaultBalance(kol);

        vm.prank(kol);
        market.claimTraderFees();

        assertEq(market.vaultBalance(kol), reserveBefore);
        _assertSolvent();

        // And the seller is still paid in full afterwards.
        uint256 quoted = market.quoteSell(kol, 300);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        market.sell(kol, 300, quoted);
        assertEq(buyer.balance - before, quoted);
    }

    function test_protocolTreasury_onlyAdminWithdraws() public {
        _buyShares(buyer, 200);
        assertGt(market.protocolTreasury(), 0);

        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.Unauthorized.selector);
        market.withdrawProtocol(buyer, 1);

        uint256 amount = market.protocolTreasury();
        vm.prank(admin);
        market.withdrawProtocol(admin, amount);
        assertEq(market.protocolTreasury(), 0);
        assertEq(admin.balance, amount);
    }

    /// The treasury cannot be used as a backdoor into listing reserves.
    function test_protocolTreasury_cannotOverdrawIntoReserves() public {
        _buyShares(buyer, 200);
        uint256 treasury = market.protocolTreasury();

        vm.prank(admin);
        vm.expectRevert(SharpsMarket.ZeroAmount.selector);
        market.withdrawProtocol(admin, treasury + 1);
    }

    /// Each successive share costs more than the last — that's the curve, and
    /// it's what lets a sell always be paid in full.
    function test_buy_curveMakesEachShareDearer() public view {
        uint256 one = market.quoteBuy(kol, 1);
        uint256 two = market.quoteBuy(kol, 2);
        uint256 three = market.quoteBuy(kol, 3);
        assertGt(two - one, 0);
        assertGt(three - two, two - one); // strictly increasing marginal cost
    }

    function test_quoteBuy_matchesActualCost() public {
        uint256 quoted = market.quoteBuy(kol, 25);
        vm.deal(buyer, quoted);
        vm.prank(buyer);
        market.buy{value: quoted}(kol, 25);

        assertEq(market.shareBalances(kol, buyer), 25);
        assertEq(buyer.balance, 0); // quote was exact, nothing to refund
    }

    function test_buy_revertsOnZeroValue() public {
        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.ZeroAmount.selector);
        market.buy{value: 0}(kol, 0);
    }

    function test_buy_revertsOnSlippage() public {
        uint256 oneShare = market.quoteBuy(kol, 1);
        vm.deal(buyer, oneShare);
        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.SlippageExceeded.selector);
        market.buy{value: oneShare}(kol, 2); // only 1 share affordable, asked for min 2
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
        uint256 cap = market.SHARES_PER_LISTING();
        // Buying the entire cap along a rising curve costs far more than
        // cap * openPrice, so budget from the actual quote, then overshoot.
        uint256 wholeCap = market.quoteBuy(kol, cap);
        uint256 hugeAmount = wholeCap * 2;

        vm.deal(buyer, hugeAmount);
        vm.prank(buyer);
        market.buy{value: hugeAmount}(kol, 0);

        assertEq(market.shareBalances(kol, buyer), cap);
        assertEq(market.getListing(kol).sharesOutstanding, cap);
    }

    // --------------------------------------------------------------- sell

    function _buyShares(address who, uint256 shares) internal returns (uint256 cost) {
        cost = market.quoteBuy(kol, shares);
        vm.deal(who, cost);
        vm.prank(who);
        market.buy{value: cost}(kol, shares);
    }

    /// A round trip costs exactly the two fees and nothing else — no hidden
    /// spread, and critically no haircut.
    function test_sell_roundTripCostsOnlyFees() public {
        uint256 cost = _buyShares(buyer, 10);

        vm.prank(buyer);
        market.sell(kol, 10, 0);

        assertEq(market.shareBalances(kol, buyer), 0);
        // Back to an empty book: buy fee + sell fee stay behind as reserve
        // surplus, everything else returned.
        uint256 returned = buyer.balance;
        assertLt(returned, cost);
        // ~4% total (2% in, 2% out); allow a little slack for integer rounding.
        assertApproxEqRel(returned, (cost * 96) / 100, 0.01e18);
        assertGt(market.vaultBalance(kol), 0); // retained fees
    }

    /// THE headline guarantee of the curve design: a seller is paid the full
    /// curve price, always. The old model paid min(quote, pro-rata NAV) and
    /// could hand back less than the screen said. There is no code path here
    /// that can do that — this test exists to keep it that way.
    function test_sell_alwaysPaysFullCurvePriceEvenAfterScoreRise() public {
        _buyShares(buyer, 100);

        // Drive the score (and so the multiplier) as high as it will go.
        for (uint256 i = 0; i < 25; i++) {
            vm.warp(block.timestamp + 30);
            vm.prank(oracle);
            market.updatePrice(kol, 100);
        }

        uint256 quoted = market.quoteSell(kol, 100);
        uint256 before = buyer.balance;

        vm.prank(buyer);
        market.sell(kol, 100, quoted); // demand the full quote as the minimum

        assertEq(buyer.balance - before, quoted); // paid exactly what was quoted
    }

    /// The reserve must never fall below the scaled curve integral of the
    /// outstanding supply — that inequality IS the solvency guarantee.
    function test_sell_reserveNeverBelowCurveIntegral() public {
        _buyShares(buyer, 200);
        _buyShares(buyer2, 50);

        for (uint256 i = 0; i < 10; i++) {
            vm.warp(block.timestamp + 30);
            vm.prank(oracle);
            market.updatePrice(kol, 100);
        }

        // Unwind in chunks, checking the invariant holds after every step.
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(buyer);
            market.sell(kol, 50, 0);
            _assertSolvent();
        }

        vm.prank(buyer2);
        market.sell(kol, 50, 0);
        _assertSolvent();
        assertEq(market.getListing(kol).sharesOutstanding, 0);
    }

    function _assertSolvent() internal view {
        SharpsMarket.Listing memory L = market.getListing(kol);
        uint256 baseReserve = Curve.reserveAt(L.sharesOutstanding);
        uint256 required = (baseReserve * L.scoreMult) / market.MULT_ONE();
        assertGe(market.vaultBalance(kol), required);
    }

    function test_sell_revertsOnInsufficientShares() public {
        _buyShares(buyer, 5);

        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.InsufficientShares.selector);
        market.sell(kol, 6, 0);
    }

    /// A score rise on a listing with outstanding shares cannot lift the
    /// multiplier beyond what the reserve backs — that bound is what stops
    /// the old insolvency from reappearing through the score.
    function test_score_increaseIsBoundedByReserve() public {
        _buyShares(buyer, 500);

        for (uint256 i = 0; i < 25; i++) {
            vm.warp(block.timestamp + 30);
            vm.prank(oracle);
            market.updatePrice(kol, 100);
        }

        SharpsMarket.Listing memory L = market.getListing(kol);
        assertEq(L.score, 100); // score itself fully caught up
        // ...but the applied multiplier is capped by the reserve, so it lags
        // the target the score is asking for.
        assertLe(L.scoreMult, L.targetMult);
        assertTrue(market.priceLagsScore(kol));
        _assertSolvent();
    }

    /// With no shares outstanding there is no liability to back, so the
    /// multiplier is free to track the score exactly.
    function test_score_appliesFullyWhenNoSharesOutstanding() public {
        for (uint256 i = 0; i < 25; i++) {
            vm.warp(block.timestamp + 30);
            vm.prank(oracle);
            market.updatePrice(kol, 100);
        }

        SharpsMarket.Listing memory L = market.getListing(kol);
        assertEq(L.scoreMult, L.targetMult);
        assertFalse(market.priceLagsScore(kol));
    }

    /// A falling score applies immediately and in full — it shrinks the
    /// liability, so it can never threaten solvency.
    function test_score_decreaseAppliesImmediately() public {
        _buyShares(buyer, 100);

        for (uint256 i = 0; i < 25; i++) {
            vm.warp(block.timestamp + 30);
            vm.prank(oracle);
            market.updatePrice(kol, 0);
        }

        SharpsMarket.Listing memory L = market.getListing(kol);
        assertEq(L.score, 0);
        assertEq(L.scoreMult, L.targetMult); // decrease fully applied
        assertLt(L.scoreMult, market.MULT_ONE()); // below the neutral 1.0x
        _assertSolvent();
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

    // ------------------------------------------------- price feed on trades
    //
    // The off-chain indexer (supabase/functions/index-price-history) subscribes
    // to PriceUpdated and nothing else, and the shared chart is built purely
    // from what it stores. So a trade that moves the price without emitting
    // PriceUpdated is invisible to every client's chart, even while the live
    // price they poll from this contract climbs. These tests pin that coupling
    // in place: they fail if someone removes the emit as redundant.

    function test_buy_emitsPriceUpdatedSoTheChartMoves() public {
        vm.expectEmit(true, false, false, false);
        emit SharpsMarket.PriceUpdated(kol, 0, 0, 0); // topic only; values checked below

        vm.deal(buyer, 10 ether);
        vm.prank(buyer);
        market.buy{value: 1 ether}(kol, 0);

        (, uint256 priceAfter,,,,,,,,) = market.listings(kol);
        assertGt(priceAfter, market.OPEN_PRICE_WEI(), "buying should raise the stored spot price");
    }

    function test_sell_emitsPriceUpdatedSoTheChartMoves() public {
        _buyShares(buyer, 20);
        (, uint256 priceAfterBuy,,,,,,,,) = market.listings(kol);

        vm.expectEmit(true, false, false, false);
        emit SharpsMarket.PriceUpdated(kol, 0, 0, 0);

        vm.prank(buyer);
        market.sell(kol, 10, 0);

        (, uint256 priceAfterSell,,,,,,,,) = market.listings(kol);
        assertLt(priceAfterSell, priceAfterBuy, "selling should lower the stored spot price");
    }

    /// A trade reports the CURRENT score unchanged — it moves price, not score.
    /// If these ever diverge, the indexer would write a fabricated score into
    /// the shared feed on every trade.
    function test_tradeEmitsCurrentScoreNotAMutatedOne() public {
        vm.prank(oracle);
        market.updatePrice(kol, 70);
        (uint8 scoreBefore,,,,,,,,,) = market.listings(kol);

        _buyShares(buyer, 5);

        (uint8 scoreAfter,,,,,,,,,) = market.listings(kol);
        assertEq(scoreAfter, scoreBefore, "a trade must not change the score");
    }
    // ------------------------------------------------- admin key lifecycle

    /// A deploy is one shot, so a zero role address is unrecoverable: nobody
    /// could ever pause, withdraw protocol fees, or replace the oracle.
    function test_constructor_rejectsZeroRoles() public {
        vm.expectRevert(SharpsMarket.ZeroAddress.selector);
        new SharpsMarket(address(0), oracle);

        vm.expectRevert(SharpsMarket.ZeroAddress.selector);
        new SharpsMarket(admin, address(0));
    }

    /// Zeroing the oracle would freeze every price forever — onlyOracle would
    /// admit nobody and no score could move again.
    function test_setOracleAuthority_rejectsZero() public {
        vm.prank(admin);
        vm.expectRevert(SharpsMarket.ZeroAddress.selector);
        market.setOracleAuthority(address(0));
    }

    /// The handover only completes when the nominee proves control. A one-step
    /// transfer would swap a compromise risk for an equally permanent typo risk.
    function test_transferAdmin_requiresAcceptanceByNominee() public {
        address newAdmin = address(0xBEEF);

        vm.prank(admin);
        market.transferAdmin(newAdmin);

        // Nothing has changed yet.
        assertEq(market.admin(), admin, "admin must not change on nomination alone");
        assertEq(market.pendingAdmin(), newAdmin);

        // The old admin still works until the handover completes.
        vm.prank(admin);
        market.setPaused(true);
        vm.prank(admin);
        market.setPaused(false);

        vm.prank(newAdmin);
        market.acceptAdmin();

        assertEq(market.admin(), newAdmin, "admin should be the nominee");
        assertEq(market.pendingAdmin(), address(0), "pending must clear");
    }

    /// Anyone other than the nominee is refused, or a pending handover would be
    /// a free admin takeover for whoever called first.
    function test_acceptAdmin_onlyNominee() public {
        vm.prank(admin);
        market.transferAdmin(address(0xBEEF));

        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.Unauthorized.selector);
        market.acceptAdmin();
    }

    function test_transferAdmin_onlyAdmin() public {
        vm.prank(buyer);
        vm.expectRevert(SharpsMarket.Unauthorized.selector);
        market.transferAdmin(buyer);
    }

    /// Nominating the zero address is how a pending handover is cancelled.
    function test_transferAdmin_zeroCancelsPendingHandover() public {
        address newAdmin = address(0xBEEF);
        vm.prank(admin);
        market.transferAdmin(newAdmin);

        vm.prank(admin);
        market.transferAdmin(address(0));
        assertEq(market.pendingAdmin(), address(0));

        vm.prank(newAdmin);
        vm.expectRevert(SharpsMarket.Unauthorized.selector);
        market.acceptAdmin();
    }

    /// After handover the old key is powerless — that is the whole point of
    /// being able to rotate it.
    function test_oldAdminLosesPowerAfterHandover() public {
        address newAdmin = address(0xBEEF);
        vm.prank(admin);
        market.transferAdmin(newAdmin);
        vm.prank(newAdmin);
        market.acceptAdmin();

        vm.prank(admin);
        vm.expectRevert(SharpsMarket.Unauthorized.selector);
        market.setPaused(true);
    }
}
