use anchor_lang::prelude::*;

use crate::errors::SharpsError;
use crate::market;
use crate::state::*;
use crate::{MULT_ONE, SHARES_PER_LISTING};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

/// One-time setup. `oracle_authority` should be a separate key from admin.
pub fn initialize_config(ctx: Context<InitializeConfig>, oracle_authority: Pubkey) -> Result<()> {
    require!(oracle_authority != Pubkey::default(), SharpsError::ZeroAddress);
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.pending_admin = Pubkey::default();
    config.oracle_authority = oracle_authority;
    config.paused = false;
    config.protocol_treasury = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
#[instruction(kol_wallet: Pubkey)]
pub struct CreateListing<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ SharpsError::Unauthorized)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", kol_wallet.as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,

    pub system_program: Program<'info, System>,
}

/// Opens a listing at score 50 (1.0x on the curve) — every listing starts
/// identically and all divergence is earned.
pub fn create_listing(ctx: Context<CreateListing>, kol_wallet: Pubkey) -> Result<()> {
    let l = &mut ctx.accounts.listing;
    l.kol_wallet = kol_wallet;
    l.score = 50;
    l.score_mult = MULT_ONE;
    l.target_mult = MULT_ONE;
    l.shares_outstanding = 0;
    l.shares_cap = SHARES_PER_LISTING;
    l.vault_balance = 0;
    l.trader_escrow = 0;
    l.last_update_ts = 0;
    l.created_at = Clock::get()?.unix_timestamp;
    l.paused = false;
    l.bump = ctx.bumps.listing;
    market::refresh_price(l)?;

    emit!(ListingCreated { kol_wallet, open_price_lamports: l.price_lamports });
    Ok(())
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ SharpsError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

/// Global emergency stop for buy/sell. Oracle updates keep running.
pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    emit!(MarketPausedSet { paused });
    Ok(())
}

pub fn set_oracle_authority(ctx: Context<AdminOnly>, new_oracle_authority: Pubkey) -> Result<()> {
    require!(new_oracle_authority != Pubkey::default(), SharpsError::ZeroAddress);
    ctx.accounts.config.oracle_authority = new_oracle_authority;
    emit!(OracleAuthoritySet { new_oracle_authority });
    Ok(())
}

/// Step one of a two-step handover; the nominee must accept. Nominating
/// the default pubkey cancels a pending handover.
pub fn transfer_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.pending_admin = new_admin;
    emit!(AdminTransferStarted { current_admin: config.admin, pending_admin: new_admin });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub new_admin: Signer<'info>,
}

pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let signer = ctx.accounts.new_admin.key();
    require!(
        config.pending_admin != Pubkey::default() && config.pending_admin == signer,
        SharpsError::Unauthorized
    );
    let previous_admin = config.admin;
    config.admin = signer;
    config.pending_admin = Pubkey::default();
    emit!(AdminTransferred { previous_admin, new_admin: signer });
    Ok(())
}

#[derive(Accounts)]
pub struct SetListingPaused<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ SharpsError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"listing", listing.kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,
}

pub fn set_listing_paused(ctx: Context<SetListingPaused>, paused: bool) -> Result<()> {
    let l = &mut ctx.accounts.listing;
    l.paused = paused;
    emit!(ListingPausedSet { kol_wallet: l.kol_wallet, paused });
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawProtocol<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ SharpsError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    /// CHECK: any account may receive lamports; chosen by the admin.
    #[account(mut)]
    pub to: UncheckedAccount<'info>,
}

/// Spends only `protocol_treasury` — never a listing's reserve or escrow,
/// which live in the listing accounts.
pub fn withdraw_protocol(ctx: Context<WithdrawProtocol>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(amount > 0 && amount <= config.protocol_treasury, SharpsError::ZeroAmount);
    config.protocol_treasury -= amount;
    market::move_lamports(&config.to_account_info(), &ctx.accounts.to.to_account_info(), amount)?;
    emit!(ProtocolWithdrawn {
        to: ctx.accounts.to.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
