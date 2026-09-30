// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MarketHub} from "./MarketHub.sol";

/// @title MarketFactory
/// @notice The only way to open a market. `CREATOR_ROLE` (the worker's creator key) pays the seed
///         collateral; it receives the surplus outcome tokens that set the opening odds.
contract MarketFactory is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    MarketHub public immutable hub;
    IERC20 public immutable collateralToken;

    uint256 public minSeed;
    uint256 public maxSeed;

    /// @notice questionHash => marketId, so the same rules can never be listed twice.
    mapping(bytes32 => uint256) public marketByQuestion;

    event MarketCreated(
        uint256 indexed marketId,
        bytes32 indexed questionHash,
        uint64 sourcePostId,
        uint64 closeTime,
        uint64 resolveBy,
        uint16 feeBps,
        uint256 seedAmount,
        uint16 initialYesPriceBps,
        address creator
    );
    event SeedLimitsSet(uint256 minSeed, uint256 maxSeed);

    error Duplicate(uint256 marketId);
    error SeedOutOfRange();

    constructor(address admin, MarketHub hub_, uint256 minSeed_, uint256 maxSeed_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        hub = hub_;
        collateralToken = hub_.collateralToken();
        minSeed = minSeed_;
        maxSeed = maxSeed_;
        emit SeedLimitsSet(minSeed_, maxSeed_);
    }

    function createMarket(
        bytes32 questionHash,
        uint64 sourcePostId,
        uint64 closeTime,
        uint64 resolveBy,
        uint16 feeBps,
        uint256 seedAmount,
        uint16 initialYesPriceBps
    ) external onlyRole(CREATOR_ROLE) nonReentrant returns (uint256 marketId) {
        uint256 existing = marketByQuestion[questionHash];
        if (existing != 0) revert Duplicate(existing);
        if (seedAmount < minSeed || seedAmount > maxSeed) revert SeedOutOfRange();

        // The hub is the only market creator, so the next id is known: record it before any
        // external call (checks-effects-interactions). openMarket returns the same id.
        marketId = hub.marketCount() + 1;
        marketByQuestion[questionHash] = marketId;

        collateralToken.safeTransferFrom(msg.sender, address(hub), seedAmount);
        uint256 opened = hub.openMarket(
            questionHash, sourcePostId, closeTime, resolveBy, feeBps, seedAmount, initialYesPriceBps, msg.sender
        );
        assert(opened == marketId);

        emit MarketCreated(
            marketId,
            questionHash,
            sourcePostId,
            closeTime,
            resolveBy,
            feeBps,
            seedAmount,
            initialYesPriceBps,
            msg.sender
        );
    }

    function setSeedLimits(uint256 minSeed_, uint256 maxSeed_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minSeed = minSeed_;
        maxSeed = maxSeed_;
        emit SeedLimitsSet(minSeed_, maxSeed_);
    }
}
