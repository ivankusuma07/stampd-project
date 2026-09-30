// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";

contract OutcomeTokensTest is Base {
    function test_tokenIdLayout() public view {
        assertEq(tokens.tokenId(7, 0), 14);
        assertEq(tokens.tokenId(7, 1), 15);
    }

    function test_tokenId_rejectsBadOutcome() public {
        vm.expectRevert(bytes("outcome"));
        tokens.tokenId(7, 2);
    }

    function test_onlyHubCanMint(address caller) public {
        vm.assume(caller != address(hub));
        vm.prank(caller);
        vm.expectRevert();
        tokens.mint(caller, 3, 1);
    }

    function test_onlyHubCanBurn(address caller) public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        _buy(alice, id, 1, 10 * USD);
        vm.assume(caller != address(hub));
        vm.prank(caller);
        vm.expectRevert();
        tokens.burn(alice, _yesId(id), 1);
    }

    function test_adminCannotMintWithoutRole() public {
        vm.prank(admin);
        vm.expectRevert();
        tokens.mint(admin, 3, 1);
    }

    function test_totalSupplyTracksMintAndBurn() public {
        uint256 id = _createMarket(100 * USD, 5_000, 0);
        uint256 out = _buy(alice, id, 1, 10 * USD);
        assertEq(tokens.totalSupply(_yesId(id)), out);
    }
}
