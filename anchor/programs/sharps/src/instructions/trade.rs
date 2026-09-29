use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::SharpsError;
use crate::market;
use crate::state::*;

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [b"listing", listing.kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", listing.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

/// Buys as many whole shares as `lamports_in` covers (capped by the share
/// cap). Only the exact cost is taken; the remainder never leaves the wallet.
pub fn buy(ctx: Context<Buy>, lamports_in: u64, min_shares_out: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, SharpsError::MarketPaused);
    require!(!ctx.accounts.listing.paused, SharpsError::ListingPaused);
    require!(lamports_in > 0, SharpsError::ZeroAmount);

    let shares = market::shares_for_budget(&ctx.accounts.listing, lamports_in);
    require!(shares > 0, SharpsError::ZeroSharesOut);
    require!(shares >= min_shares_out, SharpsError::SlippageExceeded);

    let q = market::quote_buy_breakdown(&ctx.accounts.listing, shares)?;

    // Everything except the protocol slice goes to the listing account; the
    // protocol slice goes straight to the config (treasury) account.
    for (to, amount) in [
        (ctx.accounts.listing.to_account_info(), q.total - q.protocol_cut),
        (ctx.accounts.config.to_account_info(), q.protocol_cut),
    ] {
        if amount == 0 {
            continue;
        }
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer { from: ctx.accounts.buyer.to_account_info(), to },
            ),
            amount,
        )?;
    }

    let now = Clock::get()?.unix_timestamp;
    let buyer = ctx.accounts.buyer.key();
    let listing_key = ctx.accounts.listing.key();

    let pos = &mut ctx.accounts.position;
    if pos.owner == Pubkey::default() {
        pos.owner = buyer;
        pos.listing = listing_key;
        pos.bump = ctx.bumps.position;
    }
    pos.shares = pos.shares.checked_add(shares).ok_or(SharpsError::MathOverflow)?;

    let config = &mut ctx.accounts.config;
    config.protocol_treasury += q.protocol_cut;

    let l = &mut ctx.accounts.listing;
    l.shares_outstanding += shares;
    l.vault_balance += q.total - q.trader_cut - q.protocol_cut;
    l.trader_escrow += q.trader_cut;
    market::refresh_price(l)?;

    emit!(Bought { kol_wallet: l.kol_wallet, buyer, shares, lamports_cost: q.total, timestamp: now });
    emit!(PriceUpdated {
        kol_wallet: l.kol_wallet,
        score: l.score,
        price_lamports: l.price_lamports,
        timestamp: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [b"listing", listing.kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        seeds = [b"position", listing.key().as_ref(), seller.key().as_ref()],
        bump = position.bump,
        has_one = listing,
    )]
    pub position: Account<'info, Position>,
}

/// Sells back into the curve at the full curve price. Always payable: the
/// reserve is kept at or above the scaled curve integral of the supply.
pub fn sell(ctx: Context<Sell>, shares_in: u64, min_lamports_out: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, SharpsError::MarketPaused);
    require!(!ctx.accounts.listing.paused, SharpsError::ListingPaused);
    require!(shares_in > 0, SharpsError::ZeroAmount);
    require!(ctx.accounts.position.shares >= shares_in, SharpsError::InsufficientShares);

    let q = market::quote_sell(&ctx.accounts.listing, shares_in)?;
    require!(q.payout >= min_lamports_out, SharpsError::SlippageExceeded);

    let leaving = q.payout + q.trader_cut + q.protocol_cut;
    let l = &mut ctx.accounts.listing;
    // trader_cut stays in the listing account (it moves from reserve to
    // escrow), so only payout + protocol_cut physically leave it.
    l.vault_balance = l.vault_balance.checked_sub(leaving).ok_or(SharpsError::MathOverflow)?;
    l.trader_escrow += q.trader_cut;
    l.shares_outstanding -= shares_in;
    market::refresh_price(l)?;

    ctx.accounts.position.shares -= shares_in;
    ctx.accounts.config.protocol_treasury += q.protocol_cut;

    let listing_info = ctx.accounts.listing.to_account_info();
    market::move_lamports(&listing_info, &ctx.accounts.seller.to_account_info(), q.payout)?;
    market::move_lamports(&listing_info, &ctx.accounts.config.to_account_info(), q.protocol_cut)?;

    let now = Clock::get()?.unix_timestamp;
    let l = &ctx.accounts.listing;
    emit!(Sold {
        kol_wallet: l.kol_wallet,
        seller: ctx.accounts.seller.key(),
        shares: shares_in,
        lamports_out: q.payout,
        timestamp: now,
    });
    emit!(PriceUpdated {
        kol_wallet: l.kol_wallet,
        score: l.score,
        price_lamports: l.price_lamports,
        timestamp: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct TransferShares<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    /// CHECK: recipient wallet; only used as a PDA seed and recorded owner.
    pub recipient: UncheckedAccount<'info>,

    #[account(seeds = [b"listing", listing.kol_wallet.as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        seeds = [b"position", listing.key().as_ref(), sender.key().as_ref()],
        bump = from_position.bump,
        has_one = listing,
    )]
    pub from_position: Account<'info, Position>,

    #[account(
        init_if_needed,
        payer = sender,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", listing.key().as_ref(), recipient.key().as_ref()],
        bump,
    )]
    pub to_position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

pub fn transfer_shares(ctx: Context<TransferShares>, amount: u64) -> Result<()> {
    require!(amount > 0, SharpsError::ZeroAmount);
    require!(ctx.accounts.sender.key() != ctx.accounts.recipient.key(), SharpsError::Unauthorized);
    require!(ctx.accounts.from_position.shares >= amount, SharpsError::InsufficientShares);

    ctx.accounts.from_position.shares -= amount;
    let to = &mut ctx.accounts.to_position;
    if to.owner == Pubkey::default() {
        to.owner = ctx.accounts.recipient.key();
        to.listing = ctx.accounts.listing.key();
        to.bump = ctx.bumps.to_position;
    }
    to.shares = to.shares.checked_add(amount).ok_or(SharpsError::MathOverflow)?;

    emit!(SharesTransferred {
        kol_wallet: ctx.accounts.listing.kol_wallet,
        from: ctx.accounts.sender.key(),
        to: ctx.accounts.recipient.key(),
        shares: amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimTraderFees<'info> {
    #[account(mut)]
    pub kol_wallet: Signer<'info>,

    #[account(
        mut,
        seeds = [b"listing", kol_wallet.key().as_ref()],
        bump = listing.bump,
        has_one = kol_wallet @ SharpsError::Unauthorized,
    )]
    pub listing: Account<'info, Listing>,
}

/// Only the listed wallet can claim its own escrow — identity is the
/// signature, no verification flow needed.
pub fn claim_trader_fees(ctx: Context<ClaimTraderFees>) -> Result<()> {
    let amount = ctx.accounts.listing.trader_escrow;
    require!(amount > 0, SharpsError::ZeroAmount);
    ctx.accounts.listing.trader_escrow = 0;
    market::move_lamports(
        &ctx.accounts.listing.to_account_info(),
        &ctx.accounts.kol_wallet.to_account_info(),
        amount,
    )?;
    emit!(TraderFeesClaimed {
        kol_wallet: ctx.accounts.kol_wallet.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
