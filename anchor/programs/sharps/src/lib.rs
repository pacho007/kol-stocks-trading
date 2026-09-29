use anchor_lang::prelude::*;

pub mod curve;
pub mod errors;
pub mod instructions;
pub mod lut;
pub mod market;
pub mod state;

use instructions::*;

// Replaced by `anchor keys sync` with the program keypair's pubkey.
declare_id!("5HVwtd2UXjn9q1v8L3zV4iidkopPUXGyXntbnQzgR1Ei");

/// Fixed-point scale for score multipliers. 10_000 == 1.0x.
pub const MULT_ONE: u64 = 10_000;

/// Max obtainable shares per listing — a tokenomics constant, not a
/// solvency mechanism (solvency comes from the curve-backed reserve).
pub const SHARES_PER_LISTING: u64 = 10_000_000;

/// Max fraction the score moves toward its target per update.
pub const RATE_CAP_NUM: i128 = 25;
pub const RATE_CAP_DEN: i128 = 100;

/// Floor under update_price spam, well under the oracle's cadence.
pub const MIN_UPDATE_INTERVAL_SECS: i64 = 30;

/// Total fee per side, in basis points (~4% round trip).
pub const BUY_FEE_BPS: u64 = 200;
pub const SELL_FEE_BPS: u64 = 200;

/// How the 2% splits. RESERVE stays in the listing as surplus above the
/// curve integral — the only thing that can fund a score-driven price rise.
pub const RESERVE_FEE_BPS: u64 = 100;
pub const TRADER_FEE_BPS: u64 = 50;
pub const PROTOCOL_FEE_BPS: u64 = 50;

#[program]
pub mod sharps {
    use super::*;

    // ------------------------------------------------------------- admin

    pub fn initialize_config(ctx: Context<InitializeConfig>, oracle_authority: Pubkey) -> Result<()> {
        instructions::admin::initialize_config(ctx, oracle_authority)
    }

    pub fn create_listing(ctx: Context<CreateListing>, kol_wallet: Pubkey) -> Result<()> {
        instructions::admin::create_listing(ctx, kol_wallet)
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn set_oracle_authority(ctx: Context<AdminOnly>, new_oracle_authority: Pubkey) -> Result<()> {
        instructions::admin::set_oracle_authority(ctx, new_oracle_authority)
    }

    pub fn transfer_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        instructions::admin::transfer_admin(ctx, new_admin)
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        instructions::admin::accept_admin(ctx)
    }

    pub fn set_listing_paused(ctx: Context<SetListingPaused>, paused: bool) -> Result<()> {
        instructions::admin::set_listing_paused(ctx, paused)
    }

    pub fn withdraw_protocol(ctx: Context<WithdrawProtocol>, amount: u64) -> Result<()> {
        instructions::admin::withdraw_protocol(ctx, amount)
    }

    // ------------------------------------------------------------ oracle

    pub fn update_price(ctx: Context<UpdatePrice>, score: u8) -> Result<()> {
        instructions::oracle::update_price(ctx, score)
    }

    /// Listings to update are passed as writable remaining_accounts, in the
    /// same order as `scores`. Stale/invalid entries are skipped rather than
    /// failing the whole batch.
    pub fn batch_update_price<'info>(
        ctx: Context<'info, BatchUpdatePrice<'info>>,
        scores: Vec<u8>,
    ) -> Result<()> {
        instructions::oracle::batch_update_price(ctx, scores)
    }

    // ------------------------------------------------------------- trade

    pub fn buy(ctx: Context<Buy>, lamports_in: u64, min_shares_out: u64) -> Result<()> {
        instructions::trade::buy(ctx, lamports_in, min_shares_out)
    }

    pub fn sell(ctx: Context<Sell>, shares_in: u64, min_lamports_out: u64) -> Result<()> {
        instructions::trade::sell(ctx, shares_in, min_lamports_out)
    }

    pub fn transfer_shares(ctx: Context<TransferShares>, amount: u64) -> Result<()> {
        instructions::trade::transfer_shares(ctx, amount)
    }

    pub fn claim_trader_fees(ctx: Context<ClaimTraderFees>) -> Result<()> {
        instructions::trade::claim_trader_fees(ctx)
    }
}
