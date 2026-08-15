use anchor_lang::prelude::*;

#[error_code]
pub enum SharpsError {
    #[msg("Score must be between 0 and 100")]
    InvalidScore,
    #[msg("Price update is too soon since the last update for this listing")]
    UpdateTooSoon,
    #[msg("Trading is paused market-wide")]
    MarketPaused,
    #[msg("Trading is paused for this listing")]
    ListingPaused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Computed shares out is zero at this price/pool state")]
    ZeroSharesOut,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Insufficient outstanding shares to sell that amount")]
    InsufficientShares,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Only the config admin may perform this action")]
    Unauthorized,
}
