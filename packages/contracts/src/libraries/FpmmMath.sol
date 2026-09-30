// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title FpmmMath
/// @notice Binary fixed-product market maker math (Gnosis FPMM), plan file B5.
///         Every rounding goes against the trader: shares out are rounded down, shares in and fees
///         are rounded up, so the pool invariant `yes * no` never decreases.
///         Mirrored exactly in TypeScript by `packages/core/src/fpmm.ts`.
library FpmmMath {
    uint256 internal constant BPS = 10_000;

    error EmptyPool();
    error InsufficientLiquidity();
    error BadPrice();

    /// @notice YES price in bps: no / (yes + no), rounded down.
    function priceYesBps(uint256 yesReserve, uint256 noReserve) internal pure returns (uint256) {
        uint256 total = yesReserve + noReserve;
        if (total == 0) revert EmptyPool();
        return (noReserve * BPS) / total;
    }

    /// @notice Buy the outcome whose reserve is `buyR`.
    /// @dev Fee is taken first; the rest mints complete sets into the pool, then the pool keeps
    ///      `ceil(buyR * otherR / (otherR + net))` of the bought side and pays out the remainder.
    function buy(uint256 buyR, uint256 otherR, uint256 amountIn, uint256 feeBps)
        internal
        pure
        returns (uint256 sharesOut, uint256 fee, uint256 newBuyR, uint256 newOtherR)
    {
        if (buyR == 0 || otherR == 0) revert EmptyPool();
        fee = Math.mulDiv(amountIn, feeBps, BPS, Math.Rounding.Ceil);
        uint256 net = amountIn - fee;
        newOtherR = otherR + net;
        newBuyR = Math.mulDiv(buyR, otherR, newOtherR, Math.Rounding.Ceil);
        sharesOut = buyR + net - newBuyR;
    }

    /// @notice Sell the outcome whose reserve is `sellR` for exactly `amountOut` collateral.
    /// @dev The pool burns `ceil(amountOut / (1 - fee))` complete sets; the trader deposits enough
    ///      shares to keep `sellR * otherR` constant (rounded up).
    function sell(uint256 sellR, uint256 otherR, uint256 amountOut, uint256 feeBps)
        internal
        pure
        returns (uint256 sharesIn, uint256 fee, uint256 newSellR, uint256 newOtherR)
    {
        if (sellR == 0 || otherR == 0) revert EmptyPool();
        uint256 gross = Math.mulDiv(amountOut, BPS, BPS - feeBps, Math.Rounding.Ceil);
        if (gross >= otherR) revert InsufficientLiquidity();
        fee = gross - amountOut;
        newOtherR = otherR - gross;
        uint256 ending = Math.mulDiv(sellR, otherR, newOtherR, Math.Rounding.Ceil);
        sharesIn = gross + ending - sellR;
        newSellR = ending;
    }

    /// @notice Reserves for a pool seeded with `seed` complete sets that opens at `yesPriceBps`.
    ///         The cheaper side's reserve stays at `seed`; the expensive side is scaled down and its
    ///         surplus goes to the seeder.
    function seedReserves(uint256 seed, uint256 yesPriceBps) internal pure returns (uint256 y, uint256 n) {
        if (yesPriceBps < 100 || yesPriceBps > 9_900) revert BadPrice();
        if (yesPriceBps >= 5_000) {
            n = seed;
            y = Math.mulDiv(seed, BPS - yesPriceBps, yesPriceBps);
        } else {
            y = seed;
            n = Math.mulDiv(seed, yesPriceBps, BPS - yesPriceBps);
        }
        if (y == 0 || n == 0) revert EmptyPool();
    }
}
