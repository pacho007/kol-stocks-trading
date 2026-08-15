use anchor_lang::prelude::*;

/// 8-byte Anchor discriminator + admin(32) + oracle_authority(32) + paused(1) + bump(1).
pub const CONFIG_SPACE: usize = 8 + 32 + 32 + 1 + 1;

/// 8-byte discriminator + kol_wallet(32) + mint(32) + vault(32) + score(1) +
/// price_lamports(8) + shares_outstanding(8) + shares_cap(8) +
/// last_update_ts(8) + created_at(8) + paused(1) + bump(1) + vault_bump(1) +
/// mint_bump(1).
pub const LISTING_SPACE: usize =
    8 + 32 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 1;

/// Global program config: who can administer listings and who is trusted to
/// push oracle price updates. These are deliberately separate keys — the
/// oracle authority's only capability is update_price, which never touches
/// a vault or mint, so compromising it can at most move a quoted price
/// within the existing rate-cap/rails, never move funds.
#[account]
pub struct Config {
    pub admin: Pubkey,
    pub oracle_authority: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

/// One listing per KOL, keyed on their real (durable) wallet pubkey.
#[account]
pub struct Listing {
    pub kol_wallet: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    /// Last score (0..=100) applied via update_price.
    pub score: u8,
    /// Current tradable price, in lamports. This is a QUOTED price — sell()
    /// pays min(quote, pro-rata vault NAV), so it is not a guaranteed
    /// redemption price when a listing is undercollateralized. See sell().
    pub price_lamports: u64,
    pub shares_outstanding: u64,
    /// Max obtainable shares for this listing. A tokenomics/comparability
    /// constant, NOT a solvency mechanism — solvency comes entirely from
    /// sell()'s NAV-bounded payout, regardless of what this is set to.
    pub shares_cap: u64,
    pub last_update_ts: i64,
    pub created_at: i64,
    pub paused: bool,
    pub bump: u8,
    pub vault_bump: u8,
    pub mint_bump: u8,
}

#[event]
pub struct PriceUpdateEvent {
    pub listing: Pubkey,
    pub score: u8,
    pub price_lamports: u64,
}

#[event]
pub struct BuyEvent {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub shares: u64,
    pub sol_cost: u64,
}

#[event]
pub struct SellEvent {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub shares: u64,
    pub sol_out: u64,
    /// true if sol_out was capped by vault NAV rather than paid at full quote.
    pub haircut: bool,
}
