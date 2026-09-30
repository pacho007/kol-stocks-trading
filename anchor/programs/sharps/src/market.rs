//! Pricing and scoring math shared by the instructions — kept in one place so
//! the single and batched oracle paths, and buy/sell and their quotes, can't
//! drift apart.

use anchor_lang::prelude::*;

use crate::curve;
use crate::errors::SharpsError;
use crate::lut::MULT_LUT;
use crate::state::Listing;
use crate::*;

fn to_u64(x: u128) -> Result<u64> {
    u64::try_from(x).map_err(|_| error!(SharpsError::MathOverflow))
}

fn scale(base: u128, mult: u64) -> u128 {
    base * mult as u128 / MULT_ONE as u128
}

/// Walk the score at most RATE_CAP of the way toward `raw`, forcing at least
/// one point of progress so it can't stall a few points short forever.
pub fn rate_capped_score(current: u8, raw: u8) -> u8 {
    let current = current as i128;
    let delta = raw as i128 - current;
    let mut step = delta * RATE_CAP_NUM / RATE_CAP_DEN;
    if step == 0 && delta != 0 {
        step = delta.signum();
    }
    (current + step) as u8
}

/// Turn a score into the multiplier applied to the curve, bounded by what
/// the reserve can back. Increases are capped at
/// `vault_balance * MULT_ONE / reserve_at(supply)`, so only fee surplus can
/// fund score-driven growth; decreases apply immediately (they shrink the
/// liability).
pub fn apply_score(l: &mut Listing, score: u8) -> Result<()> {
    let target = MULT_LUT[score as usize];
    l.target_mult = target;

    let supply = l.shares_outstanding;
    if supply == 0 || target <= l.score_mult {
        l.score_mult = target;
    } else {
        let base_reserve = curve::reserve_at(supply);
        let max_mult = l.vault_balance as u128 * MULT_ONE as u128 / base_reserve;
        let capped = to_u64((target as u128).min(max_mult))?;
        l.score_mult = capped.max(l.score_mult);
    }
    refresh_price(l)
}

/// Keep the stored spot price in step with supply and multiplier.
pub fn refresh_price(l: &mut Listing) -> Result<()> {
    l.price_lamports = to_u64(scale(curve::spot_price(l.shares_outstanding), l.score_mult))?;
    Ok(())
}

/// Shared by update_price and batch_update_price.
pub fn update_listing_score(l: &mut Listing, raw_score: u8, now: i64) -> Result<()> {
    require!(raw_score <= 100, SharpsError::InvalidScore);
    let first = l.last_update_ts == 0;
    require!(
        first || now - l.last_update_ts >= MIN_UPDATE_INTERVAL_SECS,
        SharpsError::UpdateTooSoon
    );
    let score = rate_capped_score(l.score, raw_score);
    l.score = score;
    apply_score(l, score)?;
    l.last_update_ts = now;
    Ok(())
}

/// Scaled curve cost of `n` shares at the listing's current supply (no fee).
pub fn curve_cost(l: &Listing, n: u64) -> u128 {
    scale(curve::cost(l.shares_outstanding, n), l.score_mult)
}

/// Total lamports to buy `n` shares now, fee included.
pub fn quote_buy(l: &Listing, n: u64) -> u128 {
    let scaled = curve_cost(l, n);
    scaled + scaled * BUY_FEE_BPS as u128 / 10_000
}

/// Largest whole share count whose full cost (fee included) fits `budget`.
pub fn shares_for_budget(l: &Listing, budget: u64) -> u64 {
    let capacity = l.shares_cap.saturating_sub(l.shares_outstanding);
    let (mut lo, mut hi) = (0u64, capacity);
    while lo < hi {
        let mid = lo + (hi - lo + 1) / 2;
        if quote_buy(l, mid) <= budget as u128 {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    lo
}

pub struct SellQuote {
    pub payout: u64,
    pub trader_cut: u64,
    pub protocol_cut: u64,
}

pub fn quote_sell(l: &Listing, n: u64) -> Result<SellQuote> {
    require!(n <= l.shares_outstanding, SharpsError::InsufficientShares);
    let scaled = scale(curve::cost(l.shares_outstanding - n, n), l.score_mult);
    Ok(SellQuote {
        payout: to_u64(scaled - scaled * SELL_FEE_BPS as u128 / 10_000)?,
        trader_cut: to_u64(scaled * TRADER_FEE_BPS as u128 / 10_000)?,
        protocol_cut: to_u64(scaled * PROTOCOL_FEE_BPS as u128 / 10_000)?,
    })
}

pub struct BuyQuote {
    pub total: u64,
    pub trader_cut: u64,
    pub protocol_cut: u64,
}

pub fn quote_buy_breakdown(l: &Listing, n: u64) -> Result<BuyQuote> {
    let scaled = curve_cost(l, n);
    Ok(BuyQuote {
        total: to_u64(scaled + scaled * BUY_FEE_BPS as u128 / 10_000)?,
        trader_cut: to_u64(scaled * TRADER_FEE_BPS as u128 / 10_000)?,
        protocol_cut: to_u64(scaled * PROTOCOL_FEE_BPS as u128 / 10_000)?,
    })
}

/// Move lamports out of an account this program owns. Only ever called
/// against balances tracked in vault_balance / trader_escrow /
/// protocol_treasury, so the account's rent-exempt minimum is never touched.
pub fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    let new_from = from
        .lamports()
        .checked_sub(amount)
        .ok_or(SharpsError::MathOverflow)?;
    let new_to = to
        .lamports()
        .checked_add(amount)
        .ok_or(SharpsError::MathOverflow)?;
    **from.try_borrow_mut_lamports()? = new_from;
    **to.try_borrow_mut_lamports()? = new_to;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> Listing {
        Listing {
            kol_wallet: Pubkey::default(),
            score: 50,
            price_lamports: 0,
            score_mult: MULT_ONE,
            target_mult: MULT_ONE,
            shares_outstanding: 0,
            shares_cap: SHARES_PER_LISTING,
            vault_balance: 0,
            trader_escrow: 0,
            last_update_ts: 0,
            created_at: 0,
            paused: false,
            bump: 0,
        }
    }

    #[test]
    fn score_walk_is_rate_capped() {
        assert_eq!(rate_capped_score(50, 100), 62);
        assert_eq!(rate_capped_score(50, 0), 38);
        assert_eq!(rate_capped_score(50, 52), 51);
        assert_eq!(rate_capped_score(50, 48), 49);
        assert_eq!(rate_capped_score(50, 50), 50);
    }

    #[test]
    fn budget_search_never_overspends() {
        let l = fresh();
        for budget in [99_999u64, 100_000, 102_000, 1_000_000_000, 5_000_000_000] {
            let n = shares_for_budget(&l, budget);
            assert!(quote_buy(&l, n) <= budget as u128);
            if n < l.shares_cap {
                assert!(quote_buy(&l, n + 1) > budget as u128);
            }
        }
    }

    #[test]
    fn sell_always_payable_after_buys() {
        let mut l = fresh();
        for n in [10u64, 1, 5000, 3] {
            let q = quote_buy_breakdown(&l, n).unwrap();
            l.vault_balance += q.total - q.trader_cut - q.protocol_cut;
            l.shares_outstanding += n;
        }
        let q = quote_sell(&l, l.shares_outstanding).unwrap();
        assert!(l.vault_balance >= q.payout + q.trader_cut + q.protocol_cut);
    }

    #[test]
    fn score_increase_capped_by_reserve() {
        let mut l = fresh();
        l.shares_outstanding = 1000;
        l.vault_balance = curve::reserve_at(1000) as u64; // no surplus
        apply_score(&mut l, 100).unwrap();
        assert_eq!(l.score_mult, MULT_ONE);
        assert_eq!(l.target_mult, 30_000);
    }
}
