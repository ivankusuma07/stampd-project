// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {MarketHub} from "../src/MarketHub.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {FpmmMath} from "../src/libraries/FpmmMath.sol";

contract MarketFactoryTest is Base {
    function test_opensAt50c() public {
        uint256 id = _createMarket(300 * USD, 5_000, 0);
        (,, uint256 priceAfter) = hub.quoteBuy(id, 1, 0);
        assertEq(priceAfter, 5_000);
        assertEq(hub.priceYesBps(id), 5_000);
        // no surplus at even odds
        assertEq(tokens.balanceOf(creator, _yesId(id)), 0);
        assertEq(tokens.balanceOf(creator, _noId(id)), 0);
    }

    function test_opensAt60c() public {
        uint256 id = _createMarket(300 * USD, 6_000, 0);
        (,, uint256 priceAfter) = hub.quoteBuy(id, 1, 0);
        assertEq(priceAfter, 6_000);

        MarketHub.Market memory m = hub.getMarket(id);
        assertEq(m.noReserve, 300 * USD);
        assertEq(m.yesReserve, 200 * USD);
        // the seeder holds the 100 YES surplus
        assertEq(tokens.balanceOf(creator, _yesId(id)), 100 * USD);
    }

    function test_opensAt25c() public {
        uint256 id = _createMarket(300 * USD, 2_500, 0);
        assertEq(hub.priceYesBps(id), 2_500);
        assertEq(tokens.balanceOf(creator, _noId(id)), 200 * USD);
    }

    function testFuzz_openingPriceWithin1Bps(uint256 seed, uint16 priceBps) public {
        seed = bound(seed, 10 * USD, 10_000 * USD);
        priceBps = uint16(bound(priceBps, 100, 9_900));
        uint256 id = _createMarket(seed, priceBps, 0);
        uint256 p = hub.priceYesBps(id);
        assertLe(p, priceBps);
        assertGe(p + 1, priceBps);
    }

    function test_pullsSeedIntoHub() public {
        uint256 before = usd.balanceOf(creator);
        uint256 id = _createMarket(300 * USD, 5_000, 0);
        assertEq(usd.balanceOf(creator), before - 300 * USD);
        assertEq(usd.balanceOf(address(hub)), 300 * USD);
        assertEq(hub.getMarket(id).collateral, 300 * USD);
    }

    function test_emitsMarketCreated() public {
        bytes32 q = keccak256("btc-90k");
        vm.expectEmit(true, true, false, true, address(factory));
        emit MarketFactory.MarketCreated(1, q, 42, closeTime, closeTime + 1 days, 100, 300 * USD, 5_000, creator);
        vm.prank(creator);
        factory.createMarket(q, 42, closeTime, closeTime + 1 days, 100, 300 * USD, 5_000);
    }

    function test_onlyCreator() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.createMarket(keccak256("q"), 1, closeTime, closeTime, 0, 100 * USD, 5_000);
    }

    function test_rejectsDuplicateQuestion() public {
        bytes32 q = keccak256("same rules");
        uint256 id = _createMarket(q, 100 * USD, 5_000, 0);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.Duplicate.selector, id));
        factory.createMarket(q, 1, closeTime, closeTime, 0, 100 * USD, 5_000);
    }

    function test_seedLimits() public {
        vm.startPrank(creator);
        vm.expectRevert(MarketFactory.SeedOutOfRange.selector);
        factory.createMarket(keccak256("a"), 1, closeTime, closeTime, 0, 10 * USD - 1, 5_000);
        vm.expectRevert(MarketFactory.SeedOutOfRange.selector);
        factory.createMarket(keccak256("b"), 1, closeTime, closeTime, 0, 10_000 * USD + 1, 5_000);
        vm.stopPrank();
    }

    function test_rejectsExtremePrice() public {
        vm.startPrank(creator);
        vm.expectRevert(FpmmMath.BadPrice.selector);
        factory.createMarket(keccak256("a"), 1, closeTime, closeTime, 0, 100 * USD, 99);
        vm.expectRevert(FpmmMath.BadPrice.selector);
        factory.createMarket(keccak256("b"), 1, closeTime, closeTime, 0, 100 * USD, 9_901);
        vm.stopPrank();
    }

    function test_marketIdsIncrement() public {
        assertEq(_createMarket(keccak256("1"), 100 * USD, 5_000, 0), 1);
        assertEq(_createMarket(keccak256("2"), 100 * USD, 5_000, 0), 2);
        assertEq(hub.marketCount(), 2);
    }
}
