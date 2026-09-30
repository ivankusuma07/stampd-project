// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title OutcomeTokens
/// @notice YES/NO shares for every market in one ERC-1155. Token id = (marketId << 1) | outcome,
///         where outcome 0 = NO and 1 = YES. Only MarketHub (MINTER_ROLE) can mint or burn.
contract OutcomeTokens is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    mapping(uint256 => uint256) public totalSupply;

    constructor(address admin, string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function tokenId(uint256 marketId, uint8 outcome) public pure returns (uint256) {
        require(outcome <= 1, "outcome");
        return (marketId << 1) | outcome;
    }

    function mint(address to, uint256 id, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, "");
    }

    function burn(address from, uint256 id, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, id, amount);
    }

    function setURI(string calldata uri_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(uri_);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        super._update(from, to, ids, values);
        for (uint256 i = 0; i < ids.length; ++i) {
            if (from == address(0)) totalSupply[ids[i]] += values[i];
            if (to == address(0)) totalSupply[ids[i]] -= values[i];
        }
    }
}
