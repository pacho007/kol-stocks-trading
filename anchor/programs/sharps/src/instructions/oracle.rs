use anchor_lang::prelude::*;

use crate::errors::SharpsError;
use crate::market;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = oracle_authority @ SharpsError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub oracle_authority: Signer<'info>,
    #[account(mut, seeds = [b"listing", listing.kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,
}

/// Oracle-only. Moves score (rate-capped) and the multiplier (reserve-capped);
/// never touches a reserve, escrow or shares.
pub fn update_price(ctx: Context<UpdatePrice>, score: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let l = &mut ctx.accounts.listing;
    market::update_listing_score(l, score, now)?;
    emit!(PriceUpdated {
        kol_wallet: l.kol_wallet,
        score: l.score,
        price_lamports: l.price_lamports,
        timestamp: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct BatchUpdatePrice<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = oracle_authority @ SharpsError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub oracle_authority: Signer<'info>,
}

pub fn batch_update_price<'info>(
    ctx: Context<'info, BatchUpdatePrice<'info>>,
    scores: Vec<u8>,
) -> Result<()> {
    require!(scores.len() == ctx.remaining_accounts.len(), SharpsError::LengthMismatch);
    let now = Clock::get()?.unix_timestamp;

    for (info, &score) in ctx.remaining_accounts.iter().zip(scores.iter()) {
        // Account::try_from checks owner + discriminator, so a non-listing
        // account can't be passed off as one.
        let mut l: Account<Listing> = match Account::try_from(info) {
            Ok(l) => l,
            Err(_) => continue,
        };
        let expected = Pubkey::create_program_address(
            &[b"listing", l.kol_wallet.as_ref(), &[l.bump]],
            &crate::ID,
        );
        if expected.ok() != Some(info.key()) {
            continue;
        }
        // Per-listing staleness or a bad score skips that entry only.
        if market::update_listing_score(&mut l, score, now).is_err() {
            continue;
        }
        emit!(PriceUpdated {
            kol_wallet: l.kol_wallet,
            score: l.score,
            price_lamports: l.price_lamports,
            timestamp: now,
        });
        l.exit(&crate::ID)?;
    }
    Ok(())
}
