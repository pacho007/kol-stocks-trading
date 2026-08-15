use anchor_lang::prelude::*;

use crate::state::{Config, CONFIG_SPACE};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = CONFIG_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

/// One-time setup. `oracle_authority` is a separate, limited-privilege key
/// (see state::Config doc comment) — never the same key as `admin`.
pub fn handler(ctx: Context<InitializeConfig>, oracle_authority: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.oracle_authority = oracle_authority;
    config.paused = false;
    config.bump = ctx.bumps.config;
    Ok(())
}
