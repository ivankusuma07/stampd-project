// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DemoUSD} from "../src/DemoUSD.sol";

contract DemoUSDTest is Base {
    address internal carol = makeAddr("carol");

    function test_decimals() public view {
        assertEq(usd.decimals(), 6);
    }

    function test_claim_validVoucher() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _voucher(carol, 100 * USD, 0, deadline, faucetSignerKey);
        vm.prank(carol);
        usd.claim(100 * USD, deadline, sig);
        assertEq(usd.balanceOf(carol), 100 * USD);
        assertEq(usd.claimNonces(carol), 1);
        assertEq(usd.nextClaimAt(carol), block.timestamp + 24 hours);
    }

    function test_claim_expiredVoucher() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _voucher(carol, 100 * USD, 0, deadline, faucetSignerKey);
        vm.warp(deadline + 1);
        vm.prank(carol);
        vm.expectRevert(DemoUSD.VoucherExpired.selector);
        usd.claim(100 * USD, deadline, sig);
    }

    function test_claim_reusedVoucher() public {
        uint256 deadline = block.timestamp + 48 hours;
        bytes memory sig = _voucher(carol, 100 * USD, 0, deadline, faucetSignerKey);
        vm.prank(carol);
        usd.claim(100 * USD, deadline, sig);
        // even after the cooldown, the same voucher is bound to the old nonce
        vm.warp(block.timestamp + 25 hours);
        vm.prank(carol);
        vm.expectRevert(DemoUSD.InvalidSigner.selector);
        usd.claim(100 * USD, deadline, sig);
    }

    function test_claim_voucherForAnotherAddress() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _voucher(carol, 100 * USD, 0, deadline, faucetSignerKey);
        vm.prank(bob);
        vm.expectRevert(DemoUSD.InvalidSigner.selector);
        usd.claim(100 * USD, deadline, sig);
    }

    function test_claim_wrongSigner() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _voucher(carol, 100 * USD, 0, deadline, 0xBAD);
        vm.prank(carol);
        vm.expectRevert(DemoUSD.InvalidSigner.selector);
        usd.claim(100 * USD, deadline, sig);
    }

    function test_claim_overLimit() public {
        uint256 deadline = block.timestamp + 10 minutes;
        uint256 amount = usd.maxClaimAmount() + 1;
        bytes memory sig = _voucher(carol, amount, 0, deadline, faucetSignerKey);
        vm.prank(carol);
        vm.expectRevert(DemoUSD.OverLimit.selector);
        usd.claim(amount, deadline, sig);
    }

    function test_claim_cooldown() public {
        uint256 deadline = block.timestamp + 48 hours;
        vm.prank(carol);
        usd.claim(100 * USD, deadline, _voucher(carol, 100 * USD, 0, deadline, faucetSignerKey));

        bytes memory second = _voucher(carol, 100 * USD, 1, deadline, faucetSignerKey);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(DemoUSD.CooldownActive.selector, block.timestamp + 24 hours));
        usd.claim(100 * USD, deadline, second);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(carol);
        usd.claim(100 * USD, deadline, second);
        assertEq(usd.balanceOf(carol), 200 * USD);
    }

    function test_transfer_restrictedBetweenUsers() public {
        vm.prank(alice);
        vm.expectRevert(DemoUSD.TransferRestricted.selector);
        usd.transfer(bob, 1 * USD);
    }

    function test_transfer_allowedWhenUnrestricted() public {
        vm.prank(admin);
        usd.setTransfersRestricted(false);
        vm.prank(alice);
        usd.transfer(bob, 1 * USD);
        assertEq(usd.balanceOf(bob), 10_001 * USD);
    }

    function test_mint_onlyMinter() public {
        vm.prank(alice);
        vm.expectRevert();
        usd.mint(alice, 1);
    }

    function test_claim_paused() public {
        vm.prank(admin);
        usd.pause();
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _voucher(carol, 100 * USD, 0, deadline, faucetSignerKey);
        vm.prank(carol);
        vm.expectRevert();
        usd.claim(100 * USD, deadline, sig);
    }
}
