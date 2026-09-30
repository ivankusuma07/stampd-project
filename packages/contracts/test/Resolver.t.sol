// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {MarketHub} from "../src/MarketHub.sol";
import {Resolver} from "../src/Resolver.sol";

contract ResolverTest is Base {
    uint256 internal id;
    string internal constant EVIDENCE = "ipfs://bafyevidence";

    function setUp() public override {
        super.setUp();
        id = _createMarket(100 * USD, 5_000, 0);
        _buy(alice, id, 1, 10 * USD);
    }

    function _propose(MarketHub.Result r) internal {
        vm.warp(closeTime);
        vm.prank(resolverBot);
        resolver.propose(id, r, EVIDENCE);
    }

    function test_undisputedFinalize() public {
        uint256 botBefore = usd.balanceOf(resolverBot);
        _propose(MarketHub.Result.Yes);
        assertEq(usd.balanceOf(resolverBot), botBefore - BOND);

        vm.warp(block.timestamp + DISPUTE_WINDOW);
        vm.prank(bob); // anyone can finalize
        resolver.finalize(id);

        assertEq(uint8(hub.getMarket(id).result), uint8(MarketHub.Result.Yes));
        assertEq(usd.balanceOf(resolverBot), botBefore);
        (,,, Resolver.Status status,,,) = resolver.proposals(id);
        assertEq(uint8(status), uint8(Resolver.Status.Finalized));
    }

    function test_finalizeTooEarly() public {
        _propose(MarketHub.Result.Yes);
        vm.warp(block.timestamp + DISPUTE_WINDOW - 1);
        vm.expectRevert(Resolver.WindowOpen.selector);
        resolver.finalize(id);
    }

    function test_doublePropose() public {
        _propose(MarketHub.Result.Yes);
        vm.prank(resolverBot);
        vm.expectRevert(abi.encodeWithSelector(Resolver.WrongStatus.selector, Resolver.Status.Proposed));
        resolver.propose(id, MarketHub.Result.No, EVIDENCE);
    }

    function test_proposeBeforeClose() public {
        vm.prank(resolverBot);
        vm.expectRevert(Resolver.MarketNotClosed.selector);
        resolver.propose(id, MarketHub.Result.Yes, EVIDENCE);
    }

    function test_proposeOnlyResolverRole() public {
        vm.warp(closeTime);
        vm.prank(alice);
        vm.expectRevert();
        resolver.propose(id, MarketHub.Result.Yes, EVIDENCE);
    }

    function test_proposeRejectsNone() public {
        vm.warp(closeTime);
        vm.prank(resolverBot);
        vm.expectRevert(Resolver.BadOutcome.selector);
        resolver.propose(id, MarketHub.Result.None, EVIDENCE);
    }

    function test_proposeEmitsEvidence() public {
        vm.warp(closeTime);
        vm.expectEmit(true, true, false, true, address(resolver));
        emit Resolver.OutcomeProposed(
            id, MarketHub.Result.Yes, resolverBot, EVIDENCE, uint64(block.timestamp) + DISPUTE_WINDOW, BOND
        );
        vm.prank(resolverBot);
        resolver.propose(id, MarketHub.Result.Yes, EVIDENCE);
    }

    /// Disputer is right: the arbiter flips the outcome and the disputer takes both bonds.
    function test_disputeUpheld() public {
        _propose(MarketHub.Result.Yes);
        uint256 bobBefore = usd.balanceOf(bob);
        vm.prank(bob);
        resolver.dispute(id);
        assertEq(usd.balanceOf(bob), bobBefore - BOND);

        vm.prank(arbiter);
        resolver.arbitrate(id, MarketHub.Result.No);

        assertEq(uint8(hub.getMarket(id).result), uint8(MarketHub.Result.No));
        assertEq(usd.balanceOf(bob), bobBefore + BOND);
    }

    /// Disputer is wrong: the proposal stands and the proposer takes both bonds.
    function test_disputeRejected() public {
        uint256 botBefore = usd.balanceOf(resolverBot);
        _propose(MarketHub.Result.Yes);
        vm.prank(bob);
        resolver.dispute(id);

        vm.prank(arbiter);
        resolver.arbitrate(id, MarketHub.Result.Yes);

        assertEq(uint8(hub.getMarket(id).result), uint8(MarketHub.Result.Yes));
        assertEq(usd.balanceOf(resolverBot), botBefore + BOND);
    }

    function test_disputedCannotBeFinalized() public {
        _propose(MarketHub.Result.Yes);
        vm.prank(bob);
        resolver.dispute(id);
        vm.warp(block.timestamp + DISPUTE_WINDOW);
        vm.expectRevert(abi.encodeWithSelector(Resolver.WrongStatus.selector, Resolver.Status.Disputed));
        resolver.finalize(id);
    }

    function test_disputeAfterWindow() public {
        _propose(MarketHub.Result.Yes);
        vm.warp(block.timestamp + DISPUTE_WINDOW);
        vm.prank(bob);
        vm.expectRevert(Resolver.WindowClosed.selector);
        resolver.dispute(id);
    }

    function test_selfDispute() public {
        _propose(MarketHub.Result.Yes);
        vm.prank(resolverBot);
        vm.expectRevert(Resolver.SelfDispute.selector);
        resolver.dispute(id);
    }

    function test_doubleDispute() public {
        _propose(MarketHub.Result.Yes);
        vm.prank(bob);
        resolver.dispute(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Resolver.WrongStatus.selector, Resolver.Status.Disputed));
        resolver.dispute(id);
    }

    function test_arbitrateOnlyArbiter() public {
        _propose(MarketHub.Result.Yes);
        vm.prank(bob);
        resolver.dispute(id);
        vm.prank(admin);
        vm.expectRevert();
        resolver.arbitrate(id, MarketHub.Result.No);
    }

    function test_arbitrateNeedsDispute() public {
        _propose(MarketHub.Result.Yes);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(Resolver.WrongStatus.selector, Resolver.Status.Proposed));
        resolver.arbitrate(id, MarketHub.Result.No);
    }

    function test_invalidEndToEnd() public {
        _propose(MarketHub.Result.Invalid);
        vm.warp(block.timestamp + DISPUTE_WINDOW);
        resolver.finalize(id);
        uint256 yes = tokens.balanceOf(alice, _yesId(id));
        vm.prank(alice);
        assertEq(hub.redeem(id), yes / 2);
    }

    function test_bondSnapshotSurvivesParamChange() public {
        _propose(MarketHub.Result.Yes);
        vm.prank(admin);
        resolver.setParams(BOND * 10, DISPUTE_WINDOW);
        uint256 bobBefore = usd.balanceOf(bob);
        vm.prank(bob);
        resolver.dispute(id);
        assertEq(usd.balanceOf(bob), bobBefore - BOND);
    }
}
