// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FpmmMath} from "../src/libraries/FpmmMath.sol";

/// Exposes the internal library so reverts surface as external calls.
contract FpmmHarness {
    function buy(uint256 buyR, uint256 otherR, uint256 amountIn, uint256 feeBps)
        external
        pure
        returns (uint256, uint256, uint256, uint256)
    {
        return FpmmMath.buy(buyR, otherR, amountIn, feeBps);
    }

    function sell(uint256 sellR, uint256 otherR, uint256 amountOut, uint256 feeBps)
        external
        pure
        returns (uint256, uint256, uint256, uint256)
    {
        return FpmmMath.sell(sellR, otherR, amountOut, feeBps);
    }
}

contract FpmmMathFuzzTest is Test {
    FpmmHarness internal h = new FpmmHarness();

    uint256 internal constant MIN_R = 1e6; // 1 dUSD
    uint256 internal constant MAX_R = 1e14; // 100M dUSD

    function testFuzz_buyNeverDecreasesK(uint256 y, uint256 n, uint256 a, uint256 fee) public view {
        y = bound(y, MIN_R, MAX_R);
        n = bound(n, MIN_R, MAX_R);
        a = bound(a, 1, MAX_R);
        fee = bound(fee, 0, 1000);
        (uint256 out, uint256 f, uint256 newY, uint256 newN) = h.buy(y, n, a, fee);
        assertGe(newY * newN, y * n, "k decreased");
        assertEq(newN, n + a - f);
        assertEq(newY, y + (a - f) - out);
        // a buyer can never receive more than the net amount they could win with (1 share = 1 USD max)
        assertGe(out, a - f);
    }

    function testFuzz_sellNeverDecreasesK(uint256 y, uint256 n, uint256 r, uint256 fee) public view {
        y = bound(y, MIN_R, MAX_R);
        n = bound(n, MIN_R, MAX_R);
        fee = bound(fee, 0, 1000);
        r = bound(r, 1, (n * (10_000 - fee)) / 10_000 - 1);
        (uint256 sharesIn, uint256 f, uint256 newY, uint256 newN) = h.sell(y, n, r, fee);
        assertGe(newY * newN, y * n, "k decreased");
        assertEq(newN, n - r - f);
        // selling r collateral always costs at least r shares
        assertGe(sharesIn, r + f);
    }

    /// sell(buy(x)) <= x: buying with x then selling for x needs at least the shares you got.
    function testFuzz_noFreeRoundTrip(uint256 y, uint256 n, uint256 a, uint256 fee) public view {
        y = bound(y, MIN_R, MAX_R);
        n = bound(n, MIN_R, MAX_R);
        a = bound(a, 1, MAX_R);
        fee = bound(fee, 0, 1000);
        (uint256 out,, uint256 y1, uint256 n1) = h.buy(y, n, a, fee);
        // selling back `a` may exceed the pool; if so there is trivially no profit
        uint256 gross = (a * 10_000 + (10_000 - fee) - 1) / (10_000 - fee);
        if (gross >= n1) return;
        (uint256 sharesIn,,,) = h.sell(y1, n1, a, fee);
        assertGe(sharesIn, out, "round trip returned more than paid");
    }

    function testFuzz_priceMovesTowardBoughtSide(uint256 y, uint256 n, uint256 a) public view {
        y = bound(y, MIN_R, MAX_R);
        n = bound(n, MIN_R, MAX_R);
        a = bound(a, 1e4, MAX_R);
        (,, uint256 y1, uint256 n1) = h.buy(y, n, a, 0);
        // YES price = n / (y + n); compare cross-multiplied to avoid rounding
        assertGe(n1 * (y + n), n * (y1 + n1));
    }
}
