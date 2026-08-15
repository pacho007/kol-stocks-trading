use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

use crate::errors::SharpsError;
use crate::state::{Config, Listing, SellEvent};

#[derive(Accounts)]
#[instruction(kol_wallet: Pubkey)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [b"listing", kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,

    /// CHECK: SOL-only PDA, validated by seeds/bump; pays out the seller.
    #[account(mut, seeds = [b"vault", listing.key().as_ref()], bump = listing.vault_bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, address = listing.mint)]
    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = seller)]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// THE solvency-critical instruction. Payout is min(quoted price, pro-rata
/// share of the vault's actual balance) — this makes it structurally
/// impossible to overdraw the vault, at the cost of `price_lamports` being a
/// *quoted* price rather than a *guaranteed* one: if a listing is
/// undercollateralized (shares were bought cheap, score then rose, and the
/// vault never received enough inflow to back the new quote), sellers get
/// their pro-rata NAV share instead of the full quote. When a listing IS
/// fully collateralized, NAV >= quote and this resolves to paying the full
/// quote exactly, so well-backed listings see no behavior change at all.
///
/// NAV-per-share is preserved across sequential sells: paying
/// `vault * shares_in / shares_outstanding` out of both leaves
/// `vault' / shares_outstanding'` unchanged, so selling order never
/// advantages one holder over another once a listing is thin.
pub fn handler(ctx: Context<Sell>, _kol_wallet: Pubkey, shares_in: u64, min_sol_out: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, SharpsError::MarketPaused);
    require!(!ctx.accounts.listing.paused, SharpsError::ListingPaused);
    require!(shares_in > 0, SharpsError::ZeroAmount);
    require!(
        shares_in <= ctx.accounts.listing.shares_outstanding,
        SharpsError::InsufficientShares
    );

    let listing = &ctx.accounts.listing;
    let price = listing.price_lamports as u128;
    let requested = (shares_in as u128) * price;

    // Spendable balance excludes the vault's own rent-exempt reserve, never
    // the raw lamport count — otherwise a payout could leave the vault with
    // a positive-but-sub-rent-exempt remainder, which the runtime rejects
    // outright (a system account must end at exactly 0 or >= rent-exempt
    // minimum). Excluding the reserve up front makes that impossible: any
    // payout <= spendable leaves >= rent_exempt_min behind, or drains to 0.
    let rent_exempt_min = Rent::get()?.minimum_balance(0) as u128;
    let spendable = (ctx.accounts.vault.lamports() as u128).saturating_sub(rent_exempt_min);
    let nav = spendable * (shares_in as u128) / (listing.shares_outstanding as u128);

    let payout_u128 = requested.min(nav);
    let payout: u64 = payout_u128
        .try_into()
        .map_err(|_| error!(SharpsError::MathOverflow))?;
    require!(payout >= min_sol_out, SharpsError::SlippageExceeded);

    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.seller_token_account.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        shares_in,
    )?;

    let listing_key = ctx.accounts.listing.key();
    let vault_bump = ctx.accounts.listing.vault_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"vault", listing_key.as_ref(), &[vault_bump]]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.seller.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
    )?;

    let listing = &mut ctx.accounts.listing;
    listing.shares_outstanding = listing
        .shares_outstanding
        .checked_sub(shares_in)
        .ok_or(SharpsError::MathOverflow)?;

    emit!(SellEvent {
        listing: listing_key,
        seller: ctx.accounts.seller.key(),
        shares: shares_in,
        sol_out: payout,
        haircut: payout_u128 < requested,
    });

    Ok(())
}
