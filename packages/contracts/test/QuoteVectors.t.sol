// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FpmmHarness} from "./FpmmMath.fuzz.t.sol";

/// Writes 1,000 buy and 1,000 sell quotes computed by the Solidity library to
/// packages/core/test/vectors/quotes.csv. The TypeScript port must reproduce every row exactly
/// (development plan step 1.7). Regenerate with `pnpm vectors` in this package.
contract QuoteVectors is Test {
    string internal constant PATH = "../core/test/vectors/quotes.csv";
    uint256 internal constant COUNT = 1000;

    function test_writeQuoteVectors() public {
        FpmmHarness h = new FpmmHarness();
        if (vm.exists(PATH)) vm.removeFile(PATH);
        vm.writeLine(PATH, "kind,sideR,otherR,amount,feeBps,shares,fee,newSideR,newOtherR");

        for (uint256 i = 0; i < COUNT; ++i) {
            uint256 r = uint256(keccak256(abi.encode("stampd", i)));
            // mix tiny, typical and large pools
            uint256 scale = 10 ** (6 + (r % 9)); // 1 .. 1e8 dUSD
            uint256 sideR = 1 + (uint256(keccak256(abi.encode(r, 1))) % scale);
            uint256 otherR = 1 + (uint256(keccak256(abi.encode(r, 2))) % scale);
            uint256 fee = uint256(keccak256(abi.encode(r, 3))) % 1001;

            uint256 buyAmt = 1 + (uint256(keccak256(abi.encode(r, 4))) % scale);
            (uint256 s, uint256 f, uint256 ns, uint256 no) = h.buy(sideR, otherR, buyAmt, fee);
            vm.writeLine(PATH, _row("buy", sideR, otherR, buyAmt, fee, s, f, ns, no));

            uint256 maxOut = (otherR * (10_000 - fee)) / 10_000;
            if (maxOut < 2) continue;
            uint256 sellAmt = 1 + (uint256(keccak256(abi.encode(r, 5))) % (maxOut - 1));
            (s, f, ns, no) = h.sell(sideR, otherR, sellAmt, fee);
            vm.writeLine(PATH, _row("sell", sideR, otherR, sellAmt, fee, s, f, ns, no));
        }
    }

    function _row(
        string memory kind,
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 f,
        uint256 g,
        uint256 h
    ) internal pure returns (string memory) {
        return string.concat(
            kind,
            ",",
            vm.toString(a),
            ",",
            vm.toString(b),
            ",",
            vm.toString(c),
            ",",
            string.concat(vm.toString(d), ",", vm.toString(e), ",", vm.toString(f), ",", vm.toString(g), ",", vm.toString(h))
        );
    }
}
