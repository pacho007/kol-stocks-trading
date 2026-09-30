//! The bonding curve every SHARPS listing trades against.
//!
//! Discrete linear: the i-th share (0-indexed) costs `BASE + SLOPE * i`,
//! before the score multiplier.
//!
//! On Solana the natural unit is the lamport, which is too coarse for a
//! per-share slope (BASE / 250_000 is a fraction of a lamport). So the curve
//! is evaluated in sub-lamport units (1 / SCALE lamport) and the reserve is
//! floored to whole lamports ONCE, as a function of supply:
//!
//!     R(s)       = floor(Rsub(s) / SCALE)
//!     cost(s, n) = R(s + n) - R(s)
//!
//! Defining every cost as a difference of the same R() makes buys and sells
//! telescope exactly: any sequence of buys taking supply from a to b pays
//! precisely R(b) - R(a), and selling back down unwinds the same amount. No
//! rounding drift can accumulate between a buy and the matching sell, which
//! is what keeps the reserve invariant exact.

/// Sub-lamport units per lamport.
pub const SCALE: u128 = 10;

/// Price of share index 0 in sub-lamports: 100_000 lamports = 0.0001 SOL.
pub const BASE_SUB: u128 = 1_000_000;

/// Added per share already outstanding, in sub-lamports: BASE / 250_000, so
/// the price roughly doubles across the first ~250k shares.
pub const SLOPE_SUB: u128 = 4;

/// Base (pre-multiplier) reserve backing a supply of `s`, in lamports.
pub fn reserve_at(s: u64) -> u128 {
    let s = s as u128;
    if s == 0 {
        return 0;
    }
    // s*(s-1) is always even, so the /2 is exact.
    (BASE_SUB * s + SLOPE_SUB * (s * (s - 1) / 2)) / SCALE
}

/// Base (pre-multiplier) cost of buying `n` shares at supply `s` — and,
/// read the other way, what selling `n` shares from supply `s + n` pays.
pub fn cost(s: u64, n: u64) -> u128 {
    reserve_at(s + n) - reserve_at(s)
}

/// Base (pre-multiplier) marginal price of the NEXT share at supply `s`, in
/// lamports. Display only — trades always go through `cost`.
pub fn spot_price(s: u64) -> u128 {
    (BASE_SUB + SLOPE_SUB * s as u128) / SCALE
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_price_is_point_0001_sol() {
        assert_eq!(spot_price(0), 100_000);
        assert_eq!(cost(0, 1), 100_000);
    }

    #[test]
    fn buys_and_sells_telescope_exactly() {
        let mut paid = 0u128;
        let mut s = 0u64;
        for n in [1u64, 7, 3, 1000, 12_345, 2] {
            paid += cost(s, n);
            s += n;
        }
        assert_eq!(paid, reserve_at(s));
        assert_eq!(cost(0, s), paid);
    }

    #[test]
    fn full_supply_fits_comfortably_in_u128() {
        let r = reserve_at(10_000_000);
        assert!(r < u64::MAX as u128);
    }
}
