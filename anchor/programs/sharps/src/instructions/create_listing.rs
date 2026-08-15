use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{Mint, Token};

use crate::errors::SharpsError;
use crate::state::{Config, Listing, LISTING_SPACE};
use crate::OPEN_PRICE_LAMPORTS;

#[derive(Accounts)]
#[instruction(kol_wallet: Pubkey)]
pub struct CreateListing<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, address = config.admin @ SharpsError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = LISTING_SPACE,
        seeds = [b"listing", kol_wallet.as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,

    /// PDA that holds this listing's SOL. Deliberately NOT created via
    /// Anchor's `init` (which would make our program the owner and break the
    /// plain system_program::transfer used to pay out sells) — it stays a
    /// System-Program-owned account, funded to rent-exempt minimum below.
    /// CHECK: address is fully determined by the seeds/bump constraint; it
    /// holds no data, only lamports.
    #[account(mut, seeds = [b"vault", listing.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,

    /// decimals = 0: buy()/sell() mint/burn raw integer share counts with no
    /// base-unit scaling (see buy.rs), so the SPL mint's own decimal scale
    /// must match that exactly or every wallet/explorer displays holdings
    /// 10^decimals times smaller than shares_outstanding actually tracks.
    #[account(
        init,
        payer = admin,
        seeds = [b"mint", listing.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = listing,
    )]
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Admin-only. Opens a listing for `kol_wallet` at the fixed open price
/// (score 50, matching oracle/score.ts's neutral "fresh start" score) and
/// funds its vault to rent-exempt minimum so it exists as a spendable
/// SystemAccount before any user deposits arrive.
pub fn handler(ctx: Context<CreateListing>, kol_wallet: Pubkey) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let rent_exempt_min = Rent::get()?.minimum_balance(0);
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.admin.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        rent_exempt_min,
    )?;

    let listing = &mut ctx.accounts.listing;
    listing.kol_wallet = kol_wallet;
    listing.mint = ctx.accounts.mint.key();
    listing.vault = ctx.accounts.vault.key();
    listing.score = 50;
    listing.price_lamports = OPEN_PRICE_LAMPORTS;
    listing.shares_outstanding = 0;
    listing.shares_cap = crate::SHARES_PER_LISTING;
    listing.last_update_ts = now;
    listing.created_at = now;
    listing.paused = false;
    listing.bump = ctx.bumps.listing;
    listing.vault_bump = ctx.bumps.vault;
    listing.mint_bump = ctx.bumps.mint;

    Ok(())
}
