use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::errors::SharpsError;
use crate::state::{BuyEvent, Config, Listing};

#[derive(Accounts)]
#[instruction(kol_wallet: Pubkey)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [b"listing", kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,

    /// CHECK: SOL-only PDA, validated by seeds/bump; receives the buyer's payment.
    #[account(mut, seeds = [b"vault", listing.key().as_ref()], bump = listing.vault_bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, address = listing.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// `min_shares_out` guards against the price moving between quote and
/// confirm — with a real on-chain price, unlike the old simulated version,
/// that gap is real. Only the exact SOL cost of the whole shares actually
/// minted is taken from the buyer; any sub-share remainder of `sol_in`
/// stays in their wallet rather than being silently absorbed.
pub fn handler(ctx: Context<Buy>, _kol_wallet: Pubkey, sol_in: u64, min_shares_out: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, SharpsError::MarketPaused);
    require!(!ctx.accounts.listing.paused, SharpsError::ListingPaused);
    require!(sol_in > 0, SharpsError::ZeroAmount);

    let listing = &ctx.accounts.listing;
    let price = listing.price_lamports as u128;
    let capacity = listing.shares_cap.saturating_sub(listing.shares_outstanding) as u128;

    let raw_shares = (sol_in as u128) / price;
    let shares_u128 = raw_shares.min(capacity);
    require!(shares_u128 > 0, SharpsError::ZeroSharesOut);
    require!(shares_u128 >= min_shares_out as u128, SharpsError::SlippageExceeded);

    let shares: u64 = shares_u128.try_into().map_err(|_| error!(SharpsError::MathOverflow))?;
    let sol_cost: u64 = (shares_u128 * price)
        .try_into()
        .map_err(|_| error!(SharpsError::MathOverflow))?;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        sol_cost,
    )?;

    let kol_wallet = ctx.accounts.listing.kol_wallet;
    let listing_bump = ctx.accounts.listing.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"listing", kol_wallet.as_ref(), &[listing_bump]]];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            },
            signer_seeds,
        ),
        shares,
    )?;

    let listing = &mut ctx.accounts.listing;
    listing.shares_outstanding = listing
        .shares_outstanding
        .checked_add(shares)
        .ok_or(SharpsError::MathOverflow)?;

    emit!(BuyEvent {
        listing: listing.key(),
        buyer: ctx.accounts.buyer.key(),
        shares,
        sol_cost,
    });

    Ok(())
}
