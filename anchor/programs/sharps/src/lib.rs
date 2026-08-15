use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod lut;
pub mod state;

use instructions::*;

// Placeholder — run `anchor keys sync` after the first `anchor build` to
// replace this with the real generated program keypair's pubkey (also
// update Anchor.toml's [programs.*] entries to match).
declare_id!("7sg3Xi2N4i31QsXzuTaat8opYXEHZb6NQC6RGtJAXtKi");

/// Fixed opening price for every listing: 0.001 SOL, matching
/// oracle/score.ts::BASE_PRICE exactly (score 50 => this price).
pub const OPEN_PRICE_LAMPORTS: u64 = 1_000_000;

/// scoreToAnchor(score, gain=2.0) is bounded to [BASE_PRICE/3, BASE_PRICE*3]
/// by construction (see oracle/score.ts) — these mirror that range as a
/// belt-and-suspenders clamp in update_price, on top of the LUT already
/// being generated within these bounds.
pub const MIN_PRICE_LAMPORTS: u64 = OPEN_PRICE_LAMPORTS / 3;
pub const MAX_PRICE_LAMPORTS: u64 = OPEN_PRICE_LAMPORTS * 3;

/// Max obtainable shares per listing — a tokenomics/comparability constant,
/// not a solvency mechanism. See state::Listing::shares_cap doc comment.
pub const SHARES_PER_LISTING: u64 = 10_000_000;

/// Port of oracle/score.ts::RATE_CAP = 0.25 as an exact fraction.
pub const RATE_CAP_NUM: i128 = 25;
pub const RATE_CAP_DEN: i128 = 100;

/// Floor under update_price spam; well under oracle/publish.ts's default
/// 20-minute refresh cadence, so it never blocks a legitimate cycle.
pub const MIN_UPDATE_INTERVAL_SECS: i64 = 30;

#[program]
pub mod sharps {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, oracle_authority: Pubkey) -> Result<()> {
        instructions::initialize_config::handler(ctx, oracle_authority)
    }

    pub fn create_listing(ctx: Context<CreateListing>, kol_wallet: Pubkey) -> Result<()> {
        instructions::create_listing::handler(ctx, kol_wallet)
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn set_oracle_authority(ctx: Context<AdminOnly>, new_oracle_authority: Pubkey) -> Result<()> {
        instructions::admin::set_oracle_authority(ctx, new_oracle_authority)
    }

    pub fn set_listing_paused(ctx: Context<SetListingPaused>, kol_wallet: Pubkey, paused: bool) -> Result<()> {
        instructions::admin::set_listing_paused(ctx, kol_wallet, paused)
    }

    pub fn update_price(ctx: Context<UpdatePrice>, kol_wallet: Pubkey, score: u8) -> Result<()> {
        instructions::update_price::handler(ctx, kol_wallet, score)
    }

    pub fn buy(ctx: Context<Buy>, kol_wallet: Pubkey, sol_in: u64, min_shares_out: u64) -> Result<()> {
        instructions::buy::handler(ctx, kol_wallet, sol_in, min_shares_out)
    }

    pub fn sell(ctx: Context<Sell>, kol_wallet: Pubkey, shares_in: u64, min_sol_out: u64) -> Result<()> {
        instructions::sell::handler(ctx, kol_wallet, shares_in, min_sol_out)
    }
}

/// Fast, validator-free checks on the generated LUT (`cargo test -p sharps`,
/// no localnet needed). Exhaustively cycling all 101 scores through
/// update_price on a live validator would take ~50 minutes thanks to
/// MIN_UPDATE_INTERVAL_SECS — this instead spot-checks the constant array
/// itself, which is the actual thing regeneration could corrupt.
#[cfg(test)]
mod lut_tests {
    use super::*;
    use lut::ANCHOR_LUT;

    #[test]
    fn boundary_values_match_score_ts_reference() {
        // score 0 -> BASE_PRICE/3, score 50 -> BASE_PRICE, score 100 -> BASE_PRICE*3
        // (oracle/score.ts::scoreToAnchor(score, gain=2.0), rounded to the nearest lamport).
        assert_eq!(ANCHOR_LUT[0], 333_333);
        assert_eq!(ANCHOR_LUT[50], 1_000_000);
        assert_eq!(ANCHOR_LUT[100], 3_000_000);
    }

    #[test]
    fn stays_within_min_max_price_rails() {
        for &lamports in ANCHOR_LUT.iter() {
            assert!(lamports >= MIN_PRICE_LAMPORTS);
            assert!(lamports <= MAX_PRICE_LAMPORTS);
        }
    }

    #[test]
    fn is_monotonically_non_decreasing() {
        for i in 1..ANCHOR_LUT.len() {
            assert!(
                ANCHOR_LUT[i] >= ANCHOR_LUT[i - 1],
                "LUT decreased between score {} ({}) and {} ({})",
                i - 1,
                ANCHOR_LUT[i - 1],
                i,
                ANCHOR_LUT[i]
            );
        }
    }
}
