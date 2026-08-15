use anchor_lang::prelude::*;

use crate::errors::SharpsError;
use crate::state::{Config, Listing};

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(address = config.admin @ SharpsError::Unauthorized)]
    pub admin: Signer<'info>,
}

/// Global emergency stop. Blocks buy() and sell() everywhere (see sell()'s
/// doc comment for why sell is not exempted: a global pause is meant for an
/// active-incident freeze, not a routine state). update_price() is
/// deliberately NOT gated by this, so scores keep tracking on-chain reality
/// even while trading is halted.
pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    Ok(())
}

pub fn set_oracle_authority(ctx: Context<AdminOnly>, new_oracle_authority: Pubkey) -> Result<()> {
    ctx.accounts.config.oracle_authority = new_oracle_authority;
    Ok(())
}

#[derive(Accounts)]
#[instruction(kol_wallet: Pubkey)]
pub struct SetListingPaused<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(address = config.admin @ SharpsError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(mut, seeds = [b"listing", kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,
}

pub fn set_listing_paused(ctx: Context<SetListingPaused>, _kol_wallet: Pubkey, paused: bool) -> Result<()> {
    ctx.accounts.listing.paused = paused;
    Ok(())
}
