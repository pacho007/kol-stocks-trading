use anchor_lang::prelude::*;

use crate::errors::SharpsError;
use crate::lut::ANCHOR_LUT;
use crate::state::{Config, Listing, PriceUpdateEvent};
use crate::{MAX_PRICE_LAMPORTS, MIN_PRICE_LAMPORTS, MIN_UPDATE_INTERVAL_SECS, RATE_CAP_DEN, RATE_CAP_NUM};

#[derive(Accounts)]
#[instruction(kol_wallet: Pubkey)]
pub struct UpdatePrice<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(address = config.oracle_authority @ SharpsError::Unauthorized)]
    pub oracle_authority: Signer<'info>,

    #[account(mut, seeds = [b"listing", kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,
}

/// oracle_authority-only. This instruction's account context never includes
/// a vault or mint, so it structurally cannot move funds — the worst a
/// compromised oracle key can do is nudge a quoted price, and only within
/// the rate-cap/rails enforced below. That bounded blast radius is why this
/// key is kept separate from `config.admin` (see state::Config doc comment).
pub fn handler(ctx: Context<UpdatePrice>, _kol_wallet: Pubkey, score: u8) -> Result<()> {
    require!(score <= 100, SharpsError::InvalidScore);

    let listing = &mut ctx.accounts.listing;
    let now = Clock::get()?.unix_timestamp;
    let is_first_update = listing.last_update_ts == listing.created_at;
    require!(
        is_first_update || now - listing.last_update_ts >= MIN_UPDATE_INTERVAL_SECS,
        SharpsError::UpdateTooSoon
    );

    // target = ANCHOR_LUT[score], byte-exact with oracle/score.ts::scoreToAnchor.
    let target = ANCHOR_LUT[score as usize] as i128;
    let current = listing.price_lamports as i128;

    // Port of oracle/score.ts::applyRateCap — current moves at most
    // RATE_CAP_NUM/RATE_CAP_DEN of the way toward target per update, so a
    // single manufactured/erroneous score can't reprice a listing instantly.
    let delta = target - current;
    let step = delta * RATE_CAP_NUM / RATE_CAP_DEN;
    let mut new_price = current + step;

    // Belt-and-suspenders: ANCHOR_LUT is already bounded to this range and a
    // convex combination of two in-range values stays in range, so this
    // should never actually clamp — kept as a hard backstop regardless.
    new_price = new_price.clamp(MIN_PRICE_LAMPORTS as i128, MAX_PRICE_LAMPORTS as i128);

    listing.price_lamports = new_price as u64;
    listing.score = score;
    listing.last_update_ts = now;

    emit!(PriceUpdateEvent {
        listing: listing.key(),
        score,
        price_lamports: listing.price_lamports,
    });

    Ok(())
}
