// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {MarketHub} from "../src/MarketHub.sol";
import {OutcomeTokens} from "../src/OutcomeTokens.sol";
import {FpmmMath} from "../src/libraries/FpmmMath.sol";

contract MarketHubTest is Base {
    uint8 internal constant NO = 0;
    uint8 internal constant YES = 1;

    /// Plan file B5 worked example: y = n = 100, buy YES with 10 -> 19.09 YES (avg 52.4c).
    function test_workedExample_B5() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        (uint256 quoted,,) = hub.quoteBuy(id, YES, 10 * USD);
        uint256 out = _buy(alice, id, YES, 10 * USD);

        // y' = ceil(100e6 * 100e6 / 110e6) = 90_909_091 -> out = 110e6 - 90_909_091
        assertEq(out, 19_090_909);
        assertEq(quoted, out);
        assertEq(tokens.balanceOf(alice, _yesId(id)), 19_090_909);

        MarketHub.Market memory m = hub.getMarket(id);
        assertEq(m.yesReserve, 90_909_091);
        assertEq(m.noReserve, 110 * USD);
        assertEq(m.collateral, 110 * USD);
        // YES price = 110 / 200.909091 = 54.75%
        assertEq(hub.priceYesBps(id), 5475);
    }

    function test_buy_chargesFeeAndKeepsItOutsidePool() public {
        uint256 id = _createMarket(100 * USD, 5_000, 200); // 2%
        (uint256 quoted, uint256 fee,) = hub.quoteBuy(id, YES, 10 * USD);
        assertEq(fee, 200_000);
        uint256 out = _buy(alice, id, YES, 10 * USD);
        assertEq(out, quoted);

        MarketHub.Market memory m = hub.getMarket(id);
        assertEq(m.fees, 200_000);
        assertEq(m.collateral, 100 * USD + 10 * USD - 200_000);
        assertEq(usd.balanceOf(address(hub)), uint256(m.collateral) + m.fees);
    }

    function test_buy_emitsTrade() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.expectEmit(true, true, false, true, address(hub));
        emit MarketHub.Trade(id, alice, YES, true, 10 * USD, 19_090_909, 0, 5475);
        _buy(alice, id, YES, 10 * USD);
    }

    function test_buyNo_movesPriceDown() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        uint256 out = _buy(alice, id, NO, 10 * USD);
        assertEq(out, 19_090_909);
        assertEq(hub.priceYesBps(id), 10_000 - 5475 - 1); // symmetric, rounded down
        assertEq(tokens.balanceOf(alice, _noId(id)), out);
    }

    function test_buy_slippage() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.prank(alice);
        vm.expectRevert(MarketHub.Slippage.selector);
        hub.buy(id, YES, 10 * USD, 19_090_910, block.timestamp);
    }

    function test_buy_deadline() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.prank(alice);
        vm.expectRevert(MarketHub.Expired.selector);
        hub.buy(id, YES, 10 * USD, 0, block.timestamp - 1);
    }

    function test_buy_zeroAmount() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.prank(alice);
        vm.expectRevert(MarketHub.ZeroAmount.selector);
        hub.buy(id, YES, 0, 0, block.timestamp);
    }

    function test_buy_badOutcome() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.prank(alice);
        vm.expectRevert(MarketHub.BadOutcome.selector);
        hub.buy(id, 2, 1 * USD, 0, block.timestamp);
    }

    function test_buy_unknownMarket() public {
        vm.prank(alice);
        vm.expectRevert(MarketHub.UnknownMarket.selector);
        hub.buy(99, YES, 1 * USD, 0, block.timestamp);
    }

    function test_trading_blockedAfterClose() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        _buy(alice, id, YES, 10 * USD);
        vm.warp(closeTime);
        vm.startPrank(alice);
        vm.expectRevert(MarketHub.TradingClosed.selector);
        hub.buy(id, YES, 1 * USD, 0, block.timestamp);
        vm.expectRevert(MarketHub.TradingClosed.selector);
        hub.sell(id, YES, 1 * USD, type(uint256).max, block.timestamp);
        vm.stopPrank();
        assertFalse(hub.isTradingOpen(id));
    }

    function test_marketPause() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.prank(admin);
        hub.setMarketPaused(id, true);
        vm.prank(alice);
        vm.expectRevert(MarketHub.MarketIsPaused.selector);
        hub.buy(id, YES, 1 * USD, 0, block.timestamp);

        vm.prank(admin);
        hub.setMarketPaused(id, false);
        _buy(alice, id, YES, 1 * USD);
    }

    function test_globalPause() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.prank(admin);
        hub.pause();
        vm.prank(alice);
        vm.expectRevert();
        hub.buy(id, YES, 1 * USD, 0, block.timestamp);
    }

    function test_setMarketPaused_onlyPauser() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.prank(alice);
        vm.expectRevert();
        hub.setMarketPaused(id, true);
    }

    function test_sell_matchesQuoteAndPaysOut() public {
        uint256 id = _createMarket(100 * USD, 5_000, 100);
        uint256 shares = _buy(alice, id, YES, 50 * USD);
        uint256 balBefore = usd.balanceOf(alice);

        (uint256 sharesIn, uint256 fee,) = hub.quoteSell(id, YES, 20 * USD);
        vm.prank(alice);
        uint256 burned = hub.sell(id, YES, 20 * USD, sharesIn, block.timestamp);

        assertEq(burned, sharesIn);
        assertGt(fee, 0);
        assertEq(usd.balanceOf(alice), balBefore + 20 * USD);
        assertEq(tokens.balanceOf(alice, _yesId(id)), shares - sharesIn);
        MarketHub.Market memory m = hub.getMarket(id);
        assertEq(usd.balanceOf(address(hub)), uint256(m.collateral) + m.fees);
    }

    function test_sell_slippage() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        _buy(alice, id, YES, 50 * USD);
        (uint256 sharesIn,,) = hub.quoteSell(id, YES, 20 * USD);
        vm.prank(alice);
        vm.expectRevert(MarketHub.Slippage.selector);
        hub.sell(id, YES, 20 * USD, sharesIn - 1, block.timestamp);
    }

    function test_sell_withoutSharesReverts() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        _buy(alice, id, YES, 50 * USD);
        vm.prank(bob);
        vm.expectRevert();
        hub.sell(id, YES, 1 * USD, type(uint256).max, block.timestamp);
    }

    function test_sell_cannotDrainPool() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        _buy(alice, id, YES, 10 * USD);
        vm.prank(alice);
        vm.expectRevert(FpmmMath.InsufficientLiquidity.selector);
        hub.sell(id, YES, 110 * USD, type(uint256).max, block.timestamp);
    }

    function test_roundTrip_noProfitWithoutFee() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        uint256 out = _buy(alice, id, YES, 10 * USD);
        (uint256 sharesIn,,) = hub.quoteSell(id, YES, 10 * USD);
        assertGe(sharesIn, out);
    }

    // ---------------------------------------------------------------- settlement

    function _settle(uint256 id, MarketHub.Result r) internal {
        vm.warp(closeTime);
        vm.prank(address(resolver));
        hub.settle(id, r);
    }

    function test_settle_onlyResolverRole() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.warp(closeTime);
        vm.prank(admin);
        vm.expectRevert();
        hub.settle(id, MarketHub.Result.Yes);
    }

    function test_settle_notBeforeClose() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        vm.prank(address(resolver));
        vm.expectRevert(MarketHub.NotClosed.selector);
        hub.settle(id, MarketHub.Result.Yes);
    }

    function test_settle_once() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        _settle(id, MarketHub.Result.Yes);
        vm.prank(address(resolver));
        vm.expectRevert(MarketHub.AlreadyResolved.selector);
        hub.settle(id, MarketHub.Result.No);
    }

    function test_redeem_yes() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        uint256 yes = _buy(alice, id, YES, 10 * USD);
        uint256 no = _buy(bob, id, NO, 10 * USD);
        _settle(id, MarketHub.Result.Yes);

        uint256 before = usd.balanceOf(alice);
        vm.prank(alice);
        assertEq(hub.redeem(id), yes);
        assertEq(usd.balanceOf(alice), before + yes);
        assertEq(tokens.balanceOf(alice, _yesId(id)), 0);

        vm.prank(bob);
        assertEq(hub.redeem(id), 0);
        assertEq(tokens.balanceOf(bob, _noId(id)), 0);
        assertGt(no, 0);
    }

    function test_redeem_no() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        uint256 no = _buy(bob, id, NO, 10 * USD);
        _settle(id, MarketHub.Result.No);
        vm.prank(bob);
        assertEq(hub.redeem(id), no);
    }

    function test_redeem_invalidPaysHalf() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        uint256 yes = _buy(alice, id, YES, 10 * USD);
        uint256 no = _buy(alice, id, NO, 3 * USD);
        _settle(id, MarketHub.Result.Invalid);
        vm.prank(alice);
        assertEq(hub.redeem(id), (yes + no) / 2);
    }

    function test_redeem_beforeResolution() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        _buy(alice, id, YES, 10 * USD);
        vm.prank(alice);
        vm.expectRevert(MarketHub.NotResolved.selector);
        hub.redeem(id);
    }

    function test_redeem_nothing() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        _settle(id, MarketHub.Result.Yes);
        vm.prank(alice);
        vm.expectRevert(MarketHub.NothingToRedeem.selector);
        hub.redeem(id);
    }

    function test_redeem_everyoneCanBePaid() public {
        uint256 id = _createMarket(100 * USD, 6_000, 100);
        _buy(alice, id, YES, 400 * USD);
        _buy(bob, id, YES, 250 * USD);
        _settle(id, MarketHub.Result.Yes);

        vm.prank(alice);
        hub.redeem(id);
        vm.prank(bob);
        hub.redeem(id);
        vm.prank(creator); // seed surplus holder
        hub.redeem(id);

        MarketHub.Market memory m = hub.getMarket(id);
        assertEq(tokens.totalSupply(_yesId(id)), 0);
        // what is left is the pool's own YES reserve plus fees
        assertEq(m.collateral, m.yesReserve);
        assertEq(usd.balanceOf(address(hub)), uint256(m.collateral) + m.fees);
    }

    // ---------------------------------------------------------------- openMarket guards

    function test_openMarket_onlyFactory() public {
        vm.prank(creator);
        vm.expectRevert();
        hub.openMarket(bytes32(0), 1, closeTime, closeTime, 0, 100 * USD, 5_000, creator);
    }

    function test_openMarket_feeAboveCap() public {
        vm.prank(creator);
        vm.expectRevert(MarketHub.BadParams.selector);
        factory.createMarket(keccak256("q"), 1, closeTime, closeTime, MAX_FEE_BPS + 1, 100 * USD, 5_000);
    }

    function test_openMarket_closeInPast() public {
        vm.prank(creator);
        vm.expectRevert(MarketHub.BadParams.selector);
        factory.createMarket(keccak256("q"), 1, uint64(block.timestamp), uint64(block.timestamp), 0, 100 * USD, 5_000);
    }

    function test_openMarket_resolveBeforeClose() public {
        vm.prank(creator);
        vm.expectRevert(MarketHub.BadParams.selector);
        factory.createMarket(keccak256("q"), 1, closeTime, closeTime - 1, 0, 100 * USD, 5_000);
    }

    function test_constructor_rejectsHugeFeeCap() public {
        vm.expectRevert(MarketHub.BadParams.selector);
        new MarketHub(admin, usd, OutcomeTokens(address(tokens)), 1001);
    }
}
