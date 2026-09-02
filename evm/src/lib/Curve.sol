// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Curve — the bonding curve every SHARPS listing trades against.
 * ---------------------------------------------------------------------------
 * WHY A CURVE AT ALL
 *
 * The previous design let an oracle set `priceWei` directly while the vault
 * only ever filled up from actual buys. Nothing tied the two together, so a
 * listing could be quoted above what its vault could pay, and sell() had to
 * hand sellers a pro-rata haircut instead of the price they saw. That is the
 * failure mode this replaces.
 *
 * Here the reserve is, by construction, exactly the integral of the curve up
 * to the outstanding supply. Buying pays that integral forward; selling
 * unwinds it. So a sell can ALWAYS be paid in full at the curve price — the
 * haircut is gone, not merely made less likely.
 *
 * THE CURVE
 *
 * Discrete linear: the i-th share (0-indexed) costs
 *
 *     price(i) = BASE + SLOPE * i
 *
 * so buying `n` shares starting at supply `s` costs
 *
 *     cost(s, n) = n*BASE + SLOPE * (n*s + n*(n-1)/2)
 *
 * which is exact integer arithmetic — no rounding drift between a buy and the
 * matching sell, which matters because drift would silently break the reserve
 * invariant one wei at a time.
 *
 * Linear rather than the quadratic curve friend.tech-style markets use: with a
 * 10,000,000 share cap a quadratic curve spans an absurd price range (the last
 * share costing ~10^14x the first). Linear keeps the range sane while still
 * rewarding early buyers.
 */
library Curve {
    /// Price of share index 0, in wei, before any score multiplier.
    uint256 internal constant BASE = 4_000_000_000_000; // 0.000004 ETH

    /// Added to the price for each share already outstanding, in wei.
    /// Chosen so the curve roughly doubles across the first ~1M shares
    /// rather than blowing up: BASE / 250_000.
    uint256 internal constant SLOPE = 16_000_000;

    /**
     * Base (pre-multiplier) cost of buying `n` shares when supply is `s`.
     * Also, read the other way, the exact amount a sell of `n` shares that
     * takes supply from `s + n` back down to `s` must pay out.
     */
    function cost(uint256 s, uint256 n) internal pure returns (uint256) {
        if (n == 0) return 0;
        // n*BASE + SLOPE*(n*s + n*(n-1)/2)
        // n*(n-1) is always even, so the /2 is exact.
        uint256 triangular = (n * (n - 1)) / 2;
        return n * BASE + SLOPE * (n * s + triangular);
    }

    /**
     * Base (pre-multiplier) reserve backing a supply of `s` — i.e. the total
     * cost of having bought every outstanding share along the curve. This is
     * the value the real reserve is kept equal to (after applying the score
     * multiplier), and is what makes full-price sells always payable.
     */
    function reserveAt(uint256 s) internal pure returns (uint256) {
        return cost(0, s);
    }

    /// Base (pre-multiplier) marginal price of the NEXT share at supply `s`.
    function spotPrice(uint256 s) internal pure returns (uint256) {
        return BASE + SLOPE * s;
    }
}
