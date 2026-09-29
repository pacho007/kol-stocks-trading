use anchor_lang::prelude::*;

/// Global program config. Also holds the protocol treasury's lamports: the
/// account's balance above rent is exactly `protocol_treasury`.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Nominee for admin, pending their own accept_admin call.
    /// Pubkey::default() means no handover is in progress.
    pub pending_admin: Pubkey,
    /// Separate, limited key: can only move scores/prices within the
    /// rate-cap, never touch a reserve, escrow or treasury.
    pub oracle_authority: Pubkey,
    pub paused: bool,
    /// Protocol fees awaiting withdrawal (destined for $SHARPS buy-and-burn).
    pub protocol_treasury: u64,
    pub bump: u8,
}

/// One listing per KOL, keyed on their Solana wallet. The listing account
/// itself holds the listing's SOL: its balance above rent is exactly
/// `vault_balance + trader_escrow`.
#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub kol_wallet: Pubkey,
    pub score: u8,
    /// Marginal (spot) price of the next share, scaled by score_mult.
    pub price_lamports: u64,
    /// Score multiplier actually IN EFFECT, MULT_ONE = 1.0x. Never rises
    /// above what the reserve can back (see apply_score).
    pub score_mult: u64,
    /// Multiplier the score says the listing DESERVES.
    pub target_mult: u64,
    pub shares_outstanding: u64,
    pub shares_cap: u64,
    /// Reserve backing outstanding shares (curve integral + fee surplus).
    pub vault_balance: u64,
    /// Fees accrued to the listed trader, claimable only by kol_wallet.
    pub trader_escrow: u64,
    /// 0 = never updated (see update_price).
    pub last_update_ts: i64,
    pub created_at: i64,
    pub paused: bool,
    pub bump: u8,
}

/// A holder's shares in one listing.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub listing: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

#[event]
pub struct ListingCreated {
    pub kol_wallet: Pubkey,
    pub open_price_lamports: u64,
}

#[event]
pub struct ListingPausedSet {
    pub kol_wallet: Pubkey,
    pub paused: bool,
}

#[event]
pub struct MarketPausedSet {
    pub paused: bool,
}

#[event]
pub struct OracleAuthoritySet {
    pub new_oracle_authority: Pubkey,
}

#[event]
pub struct AdminTransferStarted {
    pub current_admin: Pubkey,
    pub pending_admin: Pubkey,
}

#[event]
pub struct AdminTransferred {
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

/// Emitted on every oracle update AND every trade, since trades move the
/// curve too — the price feed indexes this one event.
#[event]
pub struct PriceUpdated {
    pub kol_wallet: Pubkey,
    pub score: u8,
    pub price_lamports: u64,
    pub timestamp: i64,
}

#[event]
pub struct Bought {
    pub kol_wallet: Pubkey,
    pub buyer: Pubkey,
    pub shares: u64,
    pub lamports_cost: u64,
    pub timestamp: i64,
}

#[event]
pub struct Sold {
    pub kol_wallet: Pubkey,
    pub seller: Pubkey,
    pub shares: u64,
    pub lamports_out: u64,
    pub timestamp: i64,
}

#[event]
pub struct SharesTransferred {
    pub kol_wallet: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub shares: u64,
}

#[event]
pub struct TraderFeesClaimed {
    pub kol_wallet: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ProtocolWithdrawn {
    pub to: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
