// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ScoreLut} from "./lib/ScoreLut.sol";

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
        uint256 priceWei;
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

    /// Fixed opening price for every listing (score 50). See
    /// oracle/gen-lut-evm.ts for how this is derived from oracle/score.ts.
    uint256 public immutable OPEN_PRICE_WEI;
    uint256 public immutable MIN_PRICE_WEI;
    uint256 public immutable MAX_PRICE_WEI;

    address public admin;
    address public oracleAuthority;
    bool public paused;

    mapping(address kolWallet => Listing) public listings;
    mapping(address kolWallet => mapping(address holder => uint256 shares)) public shareBalances;
    mapping(address kolWallet => uint256 weiHeld) public vaultBalance;

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

        (uint256 newPrice, uint8 newScore) = _rateCappedUpdate(l, score);
        l.priceWei = newPrice;
        l.score = newScore;
        l.lastUpdateTs = block.timestamp;

        emit PriceUpdated(kolWallet, newScore, newPrice, block.timestamp);
    }

    /// Shared rate-cap walk for both price and score, used by updatePrice()
    /// and batchUpdatePrice() — kept in one place after the same duplicated
    /// logic in both functions was the source of a real bug (the
    /// lastUpdateTs sentinel fix above): two independent copies of the same
    /// math are two independent places for them to quietly drift apart.
    function _rateCappedUpdate(Listing storage l, uint8 rawScore) private view returns (uint256 newPrice, uint8 newScore) {
        uint256 target = ScoreLut.priceForScore(rawScore);
        int256 currentPrice = int256(l.priceWei);
        int256 priceDelta = int256(target) - currentPrice;
        int256 priceStep = (priceDelta * int256(RATE_CAP_NUM)) / int256(RATE_CAP_DEN);
        int256 movedPrice = currentPrice + priceStep;

        if (movedPrice < int256(MIN_PRICE_WEI)) {
            newPrice = MIN_PRICE_WEI;
        } else if (movedPrice > int256(MAX_PRICE_WEI)) {
            newPrice = MAX_PRICE_WEI;
        } else {
            newPrice = uint256(movedPrice);
        }

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

            (uint256 newPrice, uint8 newScore) = _rateCappedUpdate(l, score);
            l.priceWei = newPrice;
            l.score = newScore;
            l.lastUpdateTs = block.timestamp;
            applied[i] = true;

            emit PriceUpdated(kolWallet, newScore, newPrice, block.timestamp);
        }
    }

    // ---------------------------------------------------------- buy / sell

    /// `minSharesOut` guards against the price moving between quote and
    /// confirm. Only the exact wei cost of the whole shares actually minted
    /// is taken from the buyer; any sub-share remainder of msg.value is
    /// refunded rather than silently absorbed. See
    /// anchor/programs/sharps/src/instructions/buy.rs.
    function buy(address kolWallet, uint256 minSharesOut) external payable nonReentrant {
        if (paused) revert MarketPaused();
        Listing storage l = listings[kolWallet];
        if (!l.exists) revert ListingNotFound();
        if (l.paused) revert ListingPaused();
        if (msg.value == 0) revert ZeroAmount();

        uint256 price = l.priceWei;
        uint256 capacity = l.sharesCap - l.sharesOutstanding;
        uint256 rawShares = msg.value / price;
        uint256 shares = rawShares < capacity ? rawShares : capacity;
        if (shares == 0) revert ZeroSharesOut();
        if (shares < minSharesOut) revert SlippageExceeded();

        uint256 cost = shares * price;
        uint256 refund = msg.value - cost;

        l.sharesOutstanding += shares;
        shareBalances[kolWallet][msg.sender] += shares;
        vaultBalance[kolWallet] += cost;

        emit Bought(kolWallet, msg.sender, shares, cost, block.timestamp);

        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
    }

    /// THE solvency-critical function. Payout is min(quoted price, pro-rata
    /// share of the vault's actual balance) — structurally impossible to
    /// overdraw vaultBalance[kolWallet], at the cost of `priceWei` being a
    /// *quoted* price rather than a guaranteed one when a listing is
    /// undercollateralized. Fully-backed listings (NAV >= quote) see no
    /// behavior change: payout resolves to the full quote exactly. See
    /// anchor/programs/sharps/src/instructions/sell.rs for the full
    /// solvency argument (unaffected by porting chains — pure arithmetic).
    function sell(address kolWallet, uint256 sharesIn, uint256 minWeiOut) external nonReentrant {
        if (paused) revert MarketPaused();
        Listing storage l = listings[kolWallet];
        if (!l.exists) revert ListingNotFound();
        if (l.paused) revert ListingPaused();
        if (sharesIn == 0) revert ZeroAmount();
        if (sharesIn > l.sharesOutstanding) revert InsufficientShares();
        if (shareBalances[kolWallet][msg.sender] < sharesIn) revert InsufficientShares();

        uint256 price = l.priceWei;
        uint256 requested = sharesIn * price;
        uint256 spendable = vaultBalance[kolWallet];
        uint256 nav = (spendable * sharesIn) / l.sharesOutstanding;
        uint256 payout = requested < nav ? requested : nav;
        if (payout < minWeiOut) revert SlippageExceeded();

        shareBalances[kolWallet][msg.sender] -= sharesIn;
        l.sharesOutstanding -= sharesIn;
        vaultBalance[kolWallet] -= payout;

        emit Sold(kolWallet, msg.sender, sharesIn, payout, payout < requested, block.timestamp);

        (bool ok,) = msg.sender.call{value: payout}("");
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
