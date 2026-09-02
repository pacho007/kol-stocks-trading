// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ScoreLut} from "./lib/ScoreLut.sol";
import {Curve} from "./lib/Curve.sol";

/**
 * SharpsMarket — Robinhood Chain (EVM) port of anchor/programs/sharps.
 * ----------------------------------------------------------------------
 * One contract holds every KOL listing, keyed directly by the KOL's own
 * wallet address, instead of Solana's per-listing PDA + SPL mint + vault
 * account triple. Shares are an internal integer ledger
 * (`shareBalances[kolWallet][holder]`), not a separate token contract per
 * listing — deploying ~100+ ERC20s just to get decimals=0 integer share
 * counts would be pure overhead here; a mapping does the same job for a
 * fraction of the gas, at the cost of shares only moving via buy()/sell()/
 * transferShares() on this contract rather than being a freely composable
 * ERC20 balance. Each listing's backing funds live in
 * `vaultBalance[kolWallet]` (native token, wei) rather than a separate
 * System-Program-owned account, since Solidity has no rent-exemption
 * concept to work around.
 *
 * Mechanics are otherwise a direct, deliberate port:
 *  - updatePrice(): oracle-only, moves price at most RATE_CAP of the way
 *    toward ScoreLut.priceForScore(score) per call, rate-limited to at most
 *    once per MIN_UPDATE_INTERVAL_SECS. Never touches vaultBalance or
 *    shares, so a compromised oracle key can only nudge a quoted price
 *    within these rails — never move funds. See sharps::update_price.
 *  - sell() pays min(quoted price, pro-rata vault NAV) — see sell()'s doc
 *    comment below, byte-for-byte the same solvency argument as
 *    anchor/programs/sharps/src/instructions/sell.rs.
 */
contract SharpsMarket {
    struct Listing {
        uint8 score;
        /// Marginal (spot) price of the next share, scaled by scoreMult.
        /// Derived from the curve — kept in storage so readers and events
        /// don't have to recompute it.
        uint256 priceWei;
        /// Score multiplier actually IN EFFECT, 1e4 = 1.0x. Never rises above
        /// what the reserve can back (see _applyScore).
        uint256 scoreMult;
        /// Multiplier the score says the listing DESERVES. scoreMult walks
        /// toward this as reserve surplus allows; the gap is the visible,
        /// honest "price hasn't caught up to performance yet" state.
        uint256 targetMult;
        uint256 sharesOutstanding;
        uint256 sharesCap;
        uint256 lastUpdateTs;
        uint256 createdAt;
        bool paused;
        bool exists;
    }

    /// Max fraction the current price is allowed to move toward its update
    /// target per call — port of oracle/score.ts::RATE_CAP = 0.25.
    uint256 public constant RATE_CAP_NUM = 25;
    uint256 public constant RATE_CAP_DEN = 100;

    /// Floor under update_price spam; well under oracle/publish.ts's default
    /// refresh cadence, so it never blocks a legitimate cycle.
    uint256 public constant MIN_UPDATE_INTERVAL_SECS = 30;

    /// Max obtainable shares per listing — a tokenomics/comparability
    /// constant, NOT a solvency mechanism. Solvency comes entirely from
    /// sell()'s NAV-bounded payout, regardless of what this is set to.
    uint256 public constant SHARES_PER_LISTING = 10_000_000;

    /// Fixed opening price for every listing (score 50, empty supply). See
    /// oracle/gen-lut-evm.ts for how this is derived from oracle/score.ts.
    uint256 public immutable OPEN_PRICE_WEI;
    uint256 public immutable MIN_PRICE_WEI;
    uint256 public immutable MAX_PRICE_WEI;

    /// Fixed-point scale for score multipliers. 10_000 == 1.0x.
    uint256 public constant MULT_ONE = 10_000;

    /// Total fee per side, in basis points. ~4% for a round trip.
    uint256 public constant BUY_FEE_BPS = 200; // 2%
    uint256 public constant SELL_FEE_BPS = 200; // 2%

    /// How that 2% splits. Must sum to BUY_FEE_BPS/SELL_FEE_BPS.
    ///
    /// RESERVE is the load-bearing one: surplus above the curve integral is
    /// the ONLY thing that can fund a score-driven price increase without
    /// breaking the sell guarantee (see _applyScore). Diverting fee away from
    /// it is a real cost — price tracks score more slowly — which is why the
    /// reserve keeps the largest slice.
    ///
    /// TRADER accrues to the listed wallet itself, claimable by signing from
    /// that wallet. These 108 traders were listed without being asked; this
    /// gives them a stake rather than making them the product.
    ///
    /// PROTOCOL accrues to a treasury. Intended to buy and burn $SHARPS once
    /// that token exists, so the house keeps nothing — until then it simply
    /// accumulates and is withdrawable by the admin.
    uint256 public constant RESERVE_FEE_BPS = 100; // 1% of trade — backs sells
    uint256 public constant TRADER_FEE_BPS = 50; //  0.5% — listed trader
    uint256 public constant PROTOCOL_FEE_BPS = 50; // 0.5% — treasury

    address public admin;
    address public oracleAuthority;
    bool public paused;

    mapping(address kolWallet => Listing) public listings;
    mapping(address kolWallet => mapping(address holder => uint256 shares)) public shareBalances;
    mapping(address kolWallet => uint256 weiHeld) public vaultBalance;

    /// Fees accrued to each listed trader, claimable only by that wallet.
    mapping(address kolWallet => uint256 weiOwed) public traderEscrow;

    /// Protocol fees awaiting withdrawal (destined for $SHARPS buy-and-burn).
    uint256 public protocolTreasury;

    bool private locked;

    event ListingCreated(address indexed kolWallet, uint256 openPriceWei);
    event ListingPausedSet(address indexed kolWallet, bool paused);
    event OracleAuthoritySet(address indexed newOracleAuthority);
    event MarketPausedSet(bool paused);
    // `timestamp` is redundant with the log's own block (an indexer can always
    // join blockNumber -> block.timestamp), but including it directly means a
    // shared price-history indexer doesn't need a second RPC round-trip per
    // unique block just to plot a chart — worth the extra 32 bytes of log data.
    event PriceUpdated(address indexed kolWallet, uint8 score, uint256 priceWei, uint256 timestamp);
    event Bought(address indexed kolWallet, address indexed buyer, uint256 shares, uint256 weiCost, uint256 timestamp);
    event Sold(address indexed kolWallet, address indexed seller, uint256 shares, uint256 weiOut, bool haircut, uint256 timestamp);
    event SharesTransferred(address indexed kolWallet, address indexed from, address indexed to, uint256 shares);
    event TraderFeesClaimed(address indexed kolWallet, uint256 amount, uint256 timestamp);
    event ProtocolWithdrawn(address indexed to, uint256 amount, uint256 timestamp);

    error Unauthorized();
    error ListingExists();
    error ListingNotFound();
    error InvalidScore();
    error UpdateTooSoon();
    error MarketPaused();
    error ListingPaused();
    error ZeroAmount();
    error ZeroSharesOut();
    error SlippageExceeded();
    error InsufficientShares();
    error TransferFailed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracleAuthority) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        require(!locked, "reentrant");
        locked = true;
        _;
        locked = false;
    }

    constructor(address _admin, address _oracleAuthority) {
        admin = _admin;
        oracleAuthority = _oracleAuthority;
        OPEN_PRICE_WEI = ScoreLut.priceForScore(50);
        MIN_PRICE_WEI = OPEN_PRICE_WEI / 3;
        MAX_PRICE_WEI = OPEN_PRICE_WEI * 3;
    }

    // ---------------------------------------------------------------- admin

    function createListing(address kolWallet) external onlyAdmin {
        if (listings[kolWallet].exists) revert ListingExists();
        listings[kolWallet] = Listing({
            score: 50,
            priceWei: OPEN_PRICE_WEI,
            // Score 50 is the neutral point, so a fresh listing opens at 1.0x
            // on the curve — every listing starts identically and all
            // divergence is earned.
            scoreMult: MULT_ONE,
            targetMult: MULT_ONE,
            sharesOutstanding: 0,
            sharesCap: SHARES_PER_LISTING,
            // Sentinel for "never updated" — lastUpdateTs == createdAt would
            // work too (and is what the Solana original uses), but it's
            // fragile: an update landing in the SAME block.timestamp second
            // as creation writes lastUpdateTs = block.timestamp = createdAt
            // again, making the NEXT update also look like "first ever" and
            // silently bypass MIN_UPDATE_INTERVAL_SECS. block.timestamp is
            // never 0 on a live chain, so 0 is an unambiguous sentinel.
            lastUpdateTs: 0,
            createdAt: block.timestamp,
            paused: false,
            exists: true
        });
        emit ListingCreated(kolWallet, OPEN_PRICE_WEI);
    }

    /// Global emergency stop. Blocks buy()/sell() everywhere. updatePrice()
    /// is deliberately NOT gated by this, so scores keep tracking on-chain
    /// reality even while trading is halted — see sharps::set_paused.
    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit MarketPausedSet(_paused);
    }

    function setOracleAuthority(address newOracleAuthority) external onlyAdmin {
        oracleAuthority = newOracleAuthority;
        emit OracleAuthoritySet(newOracleAuthority);
    }

    function setListingPaused(address kolWallet, bool _paused) external onlyAdmin {
        Listing storage l = listings[kolWallet];
        if (!l.exists) revert ListingNotFound();
        l.paused = _paused;
        emit ListingPausedSet(kolWallet, _paused);
    }

    // -------------------------------------------------------------- oracle

    /// oracle_authority-only. Never touches vaultBalance or shares — the
    /// worst a compromised oracle key can do is nudge a quoted price, and
    /// only within the rate-cap/rails below. See
    /// anchor/programs/sharps/src/instructions/update_price.rs.
    ///
    /// Both the quoted price AND the displayed score are rate-capped here —
    /// walked at most RATE_CAP of the way toward their new target per call,
    /// same as price always was. Previously `l.score = score` was a direct,
    /// unsmoothed assignment: a single cycle's raw percentile (itself
    /// vulnerable to one outlier trade dominating a thin sample) could jump
    /// the DISPLAYED score instantly and fully, even though the tradable
    /// price behind it was still catching up slowly. Now both move together.
    function updatePrice(address kolWallet, uint8 score) external onlyOracle {
        if (score > 100) revert InvalidScore();
        Listing storage l = listings[kolWallet];
        if (!l.exists) revert ListingNotFound();

        bool isFirstUpdate = l.lastUpdateTs == 0;
        if (!isFirstUpdate && block.timestamp - l.lastUpdateTs < MIN_UPDATE_INTERVAL_SECS) {
            revert UpdateTooSoon();
        }

        uint8 newScore = _rateCappedScore(l, score);
        l.score = newScore;
        _applyScore(kolWallet, l, newScore);
        l.lastUpdateTs = block.timestamp;

        emit PriceUpdated(kolWallet, newScore, l.priceWei, block.timestamp);
    }

    /// Shared score walk, used by updatePrice() and batchUpdatePrice() — kept
    /// in one place after the same duplicated logic in both functions was the
    /// source of a real bug (the lastUpdateTs sentinel fix above): two
    /// independent copies of the same math are two independent places for
    /// them to quietly drift apart.
    ///
    /// Returns only the rate-capped SCORE. Price is no longer set here: it
    /// comes from the curve, and the score's influence is applied separately
    /// in _applyScore, bounded by what the reserve can actually back.
    function _rateCappedScore(Listing storage l, uint8 rawScore) private view returns (uint8 newScore) {
        int256 currentScore = int256(uint256(l.score));
        int256 scoreDelta = int256(uint256(rawScore)) - currentScore;
        int256 scoreStep = (scoreDelta * int256(RATE_CAP_NUM)) / int256(RATE_CAP_DEN);
        // Integer division truncates toward zero, so once |scoreDelta| gets
        // small (<=3, since 3*25/100 truncates to 0) the computed step
        // becomes 0 forever — score would permanently stall a few points
        // short of its true target instead of converging. Price never hits
        // this in practice (its magnitudes are wei-scale, so a "stuck" gap
        // of a few wei is meaningless), but score's 0..100 range makes a
        // 1-3 point permanent gap real and visible. Force at least 1 point
        // of progress per cycle whenever there's a genuine gap, so score
        // always reaches its target within a bounded number of cycles.
        if (scoreStep == 0 && scoreDelta != 0) {
            scoreStep = scoreDelta > 0 ? int256(1) : int256(-1);
        }
        // A convex combination of two values in [0,100] (or one nudged by
        // at most 1 unit past that, from the force-progress step above)
        // stays in [0,100] — no extra clamp needed (unlike price, which
        // clamps as a belt-and-suspenders backstop against a bad LUT entry).
        newScore = uint8(uint256(currentScore + scoreStep));
    }

    /**
     * Turn a score into the multiplier actually applied to the curve, bounded
     * by solvency. THIS is the function that makes the whole design hold.
     *
     * The target multiplier is the score's LUT price relative to the neutral
     * (score 50) price — so score 100 wants ~3x, score 0 wants ~1/3x.
     *
     * But a multiplier is a claim on the reserve: every outstanding share
     * becomes redeemable for `mult` times its base curve value. Raising mult
     * without raising the reserve is exactly the insolvency the old design
     * had. So the increase is capped at what the reserve can actually back:
     *
     *     maxMult = reserve * MULT_ONE / baseReserve(supply)
     *
     * Any surplus above the curve integral — which only fees create — is
     * therefore the budget for score-driven price growth. A listing nobody
     * trades cannot inflate its price on score alone, which is correct: there
     * is no money behind that price.
     *
     * Decreases apply immediately and in full. They shrink the liability, so
     * they can never threaten solvency, and holders are protected by the
     * reserve they already paid in rather than by a stale high multiplier.
     */
    function _applyScore(address kolWallet, Listing storage l, uint8 score) private {
        uint256 neutral = ScoreLut.priceForScore(50);
        uint256 target = (ScoreLut.priceForScore(score) * MULT_ONE) / neutral;
        l.targetMult = target;

        uint256 supply = l.sharesOutstanding;
        if (supply == 0 || target <= l.scoreMult) {
            // No outstanding shares means no liability to back, so the
            // multiplier can sit exactly where the score says. A decrease is
            // likewise always safe — it shrinks what the reserve must cover.
            l.scoreMult = target;
        } else {
            uint256 baseReserve = Curve.reserveAt(supply);
            uint256 maxMult = (vaultBalance[kolWallet] * MULT_ONE) / baseReserve;
            uint256 capped = target < maxMult ? target : maxMult;
            // The current multiplier is already fully backed by construction,
            // so never walk it backwards on a solvency bound — only a genuine
            // score decrease (handled above) should lower it.
            l.scoreMult = capped > l.scoreMult ? capped : l.scoreMult;
        }

        l.priceWei = (Curve.spotPrice(supply) * l.scoreMult) / MULT_ONE;
    }

    /// Batched updatePrice — the EVM equivalent of packing multiple
    /// update_price instructions into one Solana transaction (see
    /// oracle/push-onchain.ts's CHUNK_SIZE). Applies each pair independently
    /// and keeps going on a per-listing UpdateTooSoon/InvalidScore/not-found
    /// condition rather than reverting the whole batch — one stale listing
    /// in a chunk of ~50 shouldn't block every other update in it. Returns
    /// which entries actually landed, so the caller can log/retry the rest.
    function batchUpdatePrice(address[] calldata kolWallets, uint8[] calldata scores)
        external
        onlyOracle
        returns (bool[] memory applied)
    {
        require(kolWallets.length == scores.length, "length mismatch");
        applied = new bool[](kolWallets.length);

        for (uint256 i = 0; i < kolWallets.length; i++) {
            address kolWallet = kolWallets[i];
            uint8 score = scores[i];
            if (score > 100) continue;

            Listing storage l = listings[kolWallet];
            if (!l.exists) continue;

            bool isFirstUpdate = l.lastUpdateTs == 0;
            if (!isFirstUpdate && block.timestamp - l.lastUpdateTs < MIN_UPDATE_INTERVAL_SECS) continue;

            uint8 newScore = _rateCappedScore(l, score);
            l.score = newScore;
            _applyScore(kolWallet, l, newScore);
            l.lastUpdateTs = block.timestamp;
            applied[i] = true;

            emit PriceUpdated(kolWallet, newScore, l.priceWei, block.timestamp);
        }
    }

    // ---------------------------------------------------------- buy / sell

    /// Cost to buy `n` shares right now, INCLUDING the buy fee — what the
    /// caller must send. Quote this before calling buy().
    function quoteBuy(address kolWallet, uint256 n) public view returns (uint256) {
        Listing storage l = listings[kolWallet];
        uint256 base = Curve.cost(l.sharesOutstanding, n);
        uint256 scaled = (base * l.scoreMult) / MULT_ONE;
        return scaled + (scaled * BUY_FEE_BPS) / 10_000;
    }

    /// Proceeds from selling `n` shares right now, AFTER the sell fee — what
    /// the seller actually receives. Unlike the old design this is a real
    /// payable amount, not a quote that a thin vault might fail to honour.
    function quoteSell(address kolWallet, uint256 n) public view returns (uint256) {
        Listing storage l = listings[kolWallet];
        if (n > l.sharesOutstanding) return 0;
        uint256 base = Curve.cost(l.sharesOutstanding - n, n);
        uint256 scaled = (base * l.scoreMult) / MULT_ONE;
        return scaled - (scaled * SELL_FEE_BPS) / 10_000;
    }

    /// Buys as many whole shares as `msg.value` covers (capped by the
    /// listing's share cap), refunding the remainder. `minSharesOut` guards
    /// against the curve moving between quote and confirm.
    ///
    /// Every wei of the curve cost enters the reserve, and the fee stays in
    /// the reserve too — as SURPLUS above the curve integral. That surplus is
    /// the only thing that can fund a score-driven price increase later (see
    /// _applyScore), which is why a fee is structural here rather than
    /// rent-seeking: without it a rising score could never lift the price
    /// without breaking solvency.
    function buy(address kolWallet, uint256 minSharesOut) external payable nonReentrant {
        if (paused) revert MarketPaused();
        Listing storage l = listings[kolWallet];
        if (!l.exists) revert ListingNotFound();
        if (l.paused) revert ListingPaused();
        if (msg.value == 0) revert ZeroAmount();

        uint256 capacity = l.sharesCap - l.sharesOutstanding;
        uint256 shares = _sharesFor(l, msg.value, capacity);
        if (shares == 0) revert ZeroSharesOut();
        if (shares < minSharesOut) revert SlippageExceeded();

        uint256 total = quoteBuy(kolWallet, shares);
        // _sharesFor never returns a count whose cost exceeds msg.value.
        uint256 refund = msg.value - total;

        // Split the fee. The curve cost itself always goes to the reserve —
        // that's what keeps reserve == scaled curve integral and makes the
        // sell guarantee hold. Only the fee is divided.
        uint256 curveCost = (Curve.cost(l.sharesOutstanding, shares) * l.scoreMult) / MULT_ONE;
        uint256 traderCut = (curveCost * TRADER_FEE_BPS) / 10_000;
        uint256 protocolCut = (curveCost * PROTOCOL_FEE_BPS) / 10_000;

        l.sharesOutstanding += shares;
        shareBalances[kolWallet][msg.sender] += shares;
        // Everything except the trader/protocol slices stays with the listing.
        vaultBalance[kolWallet] += total - traderCut - protocolCut;
        traderEscrow[kolWallet] += traderCut;
        protocolTreasury += protocolCut;
        // The curve moved: the next share now costs more. Keep the stored
        // spot price in step so readers and the price feed see it without
        // recomputing the curve themselves.
        l.priceWei = (Curve.spotPrice(l.sharesOutstanding) * l.scoreMult) / MULT_ONE;

        emit Bought(kolWallet, msg.sender, shares, total, block.timestamp);
        // A trade moves the price just as much as a score update does, and the
        // off-chain price feed indexes PriceUpdated only. Without this, the
        // shared chart would flatline between oracle cycles no matter how much
        // trading happened — every client polls the live price from this
        // contract, so the number would climb while the chart it is drawn on
        // stayed still. Score is unchanged here; the price is what moved.
        emit PriceUpdated(kolWallet, l.score, l.priceWei, block.timestamp);

        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
    }

    /// Largest whole share count whose full cost (fee included) is affordable
    /// with `budget`. Binary search rather than division, because the cost of
    /// each additional share rises along the curve.
    function _sharesFor(Listing storage l, uint256 budget, uint256 capacity)
        private
        view
        returns (uint256)
    {
        uint256 lo = 0;
        uint256 hi = capacity;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            uint256 base = Curve.cost(l.sharesOutstanding, mid);
            uint256 scaled = (base * l.scoreMult) / MULT_ONE;
            uint256 total = scaled + (scaled * BUY_FEE_BPS) / 10_000;
            if (total <= budget) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    /// Sells `sharesIn` back into the curve at the FULL curve price.
    ///
    /// There is no haircut path here and no `min(quote, NAV)` clamp, because
    /// there is nothing left to clamp against: the reserve is maintained at
    /// exactly the scaled curve integral of the outstanding supply, so
    /// unwinding `sharesIn` along that same curve is always payable by
    /// construction. Fees only ever add surplus on top, never subtract from
    /// what backs a sell.
    function sell(address kolWallet, uint256 sharesIn, uint256 minWeiOut) external nonReentrant {
        if (paused) revert MarketPaused();
        Listing storage l = listings[kolWallet];
        if (!l.exists) revert ListingNotFound();
        if (l.paused) revert ListingPaused();
        if (sharesIn == 0) revert ZeroAmount();
        if (sharesIn > l.sharesOutstanding) revert InsufficientShares();
        if (shareBalances[kolWallet][msg.sender] < sharesIn) revert InsufficientShares();

        uint256 base = Curve.cost(l.sharesOutstanding - sharesIn, sharesIn);
        uint256 scaled = (base * l.scoreMult) / MULT_ONE;
        uint256 payout = scaled - (scaled * SELL_FEE_BPS) / 10_000;
        if (payout < minWeiOut) revert SlippageExceeded();

        uint256 traderCut = (scaled * TRADER_FEE_BPS) / 10_000;
        uint256 protocolCut = (scaled * PROTOCOL_FEE_BPS) / 10_000;

        shareBalances[kolWallet][msg.sender] -= sharesIn;
        l.sharesOutstanding -= sharesIn;
        // The vault loses the payout plus the two slices that leave it; the
        // reserve's own slice of the fee stays behind as surplus. Net effect:
        // vault drops by (scaled - reserveSlice), so it lands strictly ABOVE
        // the scaled curve integral at the new supply — the sell guarantee
        // survives the fee split intact.
        vaultBalance[kolWallet] -= payout + traderCut + protocolCut;
        traderEscrow[kolWallet] += traderCut;
        protocolTreasury += protocolCut;
        l.priceWei = (Curve.spotPrice(l.sharesOutstanding) * l.scoreMult) / MULT_ONE;

        emit Sold(kolWallet, msg.sender, sharesIn, payout, false, block.timestamp);
        // Same reasoning as buy(): the curve moved down, so the feed needs to
        // hear about it or the chart misses every sell.
        emit PriceUpdated(kolWallet, l.score, l.priceWei, block.timestamp);

        (bool ok,) = msg.sender.call{value: payout}("");
        if (!ok) revert TransferFailed();
    }

    /**
     * Claim the fees accrued to your own listing.
     *
     * Identity is the wallet itself: only `kolWallet` can claim `kolWallet`'s
     * escrow, proved by signing the transaction. No verification flow, no
     * OAuth, no review queue — which is the one place this model is simpler
     * than tokenising social handles, where somebody has to prove offline
     * that they control a username.
     *
     * A listed trader never has to do anything for this to accrue; it just
     * sits here until they turn up.
     */
    function claimTraderFees() external nonReentrant returns (uint256 amount) {
        amount = traderEscrow[msg.sender];
        if (amount == 0) revert ZeroAmount();
        traderEscrow[msg.sender] = 0;

        emit TraderFeesClaimed(msg.sender, amount, block.timestamp);

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// Withdraw accrued protocol fees. Destined for $SHARPS buy-and-burn once
    /// that token exists; until then it goes to an admin-nominated address.
    /// Cannot touch any listing's reserve or any trader's escrow — those are
    /// separate balances and this only ever spends `protocolTreasury`.
    function withdrawProtocol(address to, uint256 amount) external onlyAdmin nonReentrant {
        if (to == address(0)) revert ZeroAmount();
        if (amount == 0 || amount > protocolTreasury) revert ZeroAmount();
        protocolTreasury -= amount;

        emit ProtocolWithdrawn(to, amount, block.timestamp);

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// Direct wallet-to-wallet transfer of shares in one listing. Not a full
    /// ERC20 (no approve/transferFrom) — add that later if a listing needs
    /// to compose with external DEXs/contracts; this covers plain sends.
    function transferShares(address kolWallet, address to, uint256 amount) external {
        if (!listings[kolWallet].exists) revert ListingNotFound();
        if (amount == 0) revert ZeroAmount();
        if (shareBalances[kolWallet][msg.sender] < amount) revert InsufficientShares();

        shareBalances[kolWallet][msg.sender] -= amount;
        shareBalances[kolWallet][to] += amount;

        emit SharesTransferred(kolWallet, msg.sender, to, amount);
    }

    // ------------------------------------------------------------- reading

    /// Itemised buy quote, so the UI can show where every wei goes instead of
    /// a single opaque "fee" line. `curveCost` is the shares themselves;
    /// the three cuts sum to the 2% fee; `total` is what to send.
    function quoteBuyBreakdown(address kolWallet, uint256 n)
        external
        view
        returns (
            uint256 curveCost,
            uint256 reserveCut,
            uint256 traderCut,
            uint256 protocolCut,
            uint256 total
        )
    {
        Listing storage l = listings[kolWallet];
        if (!l.exists || n == 0) return (0, 0, 0, 0, 0);
        curveCost = (Curve.cost(l.sharesOutstanding, n) * l.scoreMult) / MULT_ONE;
        reserveCut = (curveCost * RESERVE_FEE_BPS) / 10_000;
        traderCut = (curveCost * TRADER_FEE_BPS) / 10_000;
        protocolCut = (curveCost * PROTOCOL_FEE_BPS) / 10_000;
        total = curveCost + (curveCost * BUY_FEE_BPS) / 10_000;
    }

    /// How many whole shares `budget` buys right now, fee included. The
    /// client cannot compute this as budget/price: each share along the curve
    /// costs more than the last, so that division always overestimates.
    /// Exposes the same search buy() uses, so a quote and the fill agree.
    function sharesForBudget(address kolWallet, uint256 budget) external view returns (uint256) {
        Listing storage l = listings[kolWallet];
        if (!l.exists || budget == 0) return 0;
        return _sharesFor(l, budget, l.sharesCap - l.sharesOutstanding);
    }

    /// Whole listing as a struct. Prefer this over the auto-generated
    /// `listings()` tuple getter: callers that destructure by position break
    /// silently every time a field is added.
    function getListing(address kolWallet) external view returns (Listing memory) {
        return listings[kolWallet];
    }

    /// True when the score says this listing deserves a higher price than its
    /// reserve can currently back — i.e. the price is still catching up to
    /// performance. Surfaced so the UI can say so plainly rather than leaving
    /// a silent gap between score and price.
    function priceLagsScore(address kolWallet) external view returns (bool) {
        Listing storage l = listings[kolWallet];
        return l.exists && l.targetMult > l.scoreMult;
    }

    /// Backing per share, scaled by 1e18 (like a WAD), for display —
    /// mirrors src/routes/kol.$id.tsx's fetchBackingPerShareLamports. A
    /// sell() only ever pays min(quote, this), so comparing the two before
    /// trading avoids surprises on a thin listing.
    function backingPerShareWad(address kolWallet) external view returns (uint256) {
        Listing storage l = listings[kolWallet];
        if (!l.exists || l.sharesOutstanding == 0) return 0;
        return (vaultBalance[kolWallet] * 1e18) / l.sharesOutstanding;
    }
}
