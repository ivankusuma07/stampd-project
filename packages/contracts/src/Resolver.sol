// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MarketHub} from "./MarketHub.sol";

/// @title Resolver
/// @notice Optimistic resolution. The resolver bot proposes an outcome with a bond and an evidence
///         URI; anyone may dispute within `disputeWindowSec` by posting the same bond; a disputed
///         market is decided by `ARBITER_ROLE` (a multisig) and the losing side's bond goes to the
///         winner. Undisputed proposals are finalized by anyone once the window has passed.
contract Resolver is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

    enum Status {
        None,
        Proposed,
        Disputed,
        Finalized
    }

    struct Proposal {
        address proposer;
        uint64 disputeEnds;
        MarketHub.Result outcome;
        Status status;
        address disputer;
        uint128 bond;
        bytes32 evidenceHash;
    }

    MarketHub public immutable hub;
    IERC20 public immutable bondToken;

    uint128 public bondAmount;
    uint64 public disputeWindowSec;

    mapping(uint256 => Proposal) public proposals;

    event OutcomeProposed(
        uint256 indexed marketId,
        MarketHub.Result outcome,
        address indexed proposer,
        string evidenceURI,
        uint64 disputeEnds,
        uint128 bond
    );
    event Disputed(uint256 indexed marketId, address indexed disputer);
    event Arbitrated(uint256 indexed marketId, MarketHub.Result outcome, address indexed bondWinner);
    event Resolved(uint256 indexed marketId, MarketHub.Result outcome);
    event ParamsSet(uint128 bondAmount, uint64 disputeWindowSec);

    error BadOutcome();
    error WrongStatus(Status status);
    error MarketNotClosed();
    error WindowClosed();
    error WindowOpen();
    error SelfDispute();

    constructor(address admin, MarketHub hub_, uint128 bondAmount_, uint64 disputeWindowSec_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        hub = hub_;
        bondToken = hub_.collateralToken();
        bondAmount = bondAmount_;
        disputeWindowSec = disputeWindowSec_;
        emit ParamsSet(bondAmount_, disputeWindowSec_);
    }

    function propose(uint256 marketId, MarketHub.Result outcome, string calldata evidenceURI)
        external
        onlyRole(RESOLVER_ROLE)
        nonReentrant
    {
        if (outcome == MarketHub.Result.None) revert BadOutcome();
        Proposal storage p = proposals[marketId];
        if (p.status != Status.None) revert WrongStatus(p.status);
        if (block.timestamp < hub.getMarket(marketId).closeTime) revert MarketNotClosed();

        uint128 bond = bondAmount;
        uint64 ends = uint64(block.timestamp) + disputeWindowSec;
        p.proposer = msg.sender;
        p.disputeEnds = ends;
        p.outcome = outcome;
        p.status = Status.Proposed;
        p.bond = bond;
        p.evidenceHash = keccak256(bytes(evidenceURI));

        if (bond > 0) bondToken.safeTransferFrom(msg.sender, address(this), bond);
        emit OutcomeProposed(marketId, outcome, msg.sender, evidenceURI, ends, bond);
    }

    function dispute(uint256 marketId) external nonReentrant {
        Proposal storage p = proposals[marketId];
        if (p.status != Status.Proposed) revert WrongStatus(p.status);
        if (block.timestamp >= p.disputeEnds) revert WindowClosed();
        if (msg.sender == p.proposer) revert SelfDispute();

        p.status = Status.Disputed;
        p.disputer = msg.sender;
        if (p.bond > 0) bondToken.safeTransferFrom(msg.sender, address(this), p.bond);
        emit Disputed(marketId, msg.sender);
    }

    /// @notice Decide a disputed market. If the arbiter agrees with the proposal the proposer takes
    ///         both bonds, otherwise the disputer does.
    function arbitrate(uint256 marketId, MarketHub.Result outcome) external onlyRole(ARBITER_ROLE) nonReentrant {
        if (outcome == MarketHub.Result.None) revert BadOutcome();
        Proposal storage p = proposals[marketId];
        if (p.status != Status.Disputed) revert WrongStatus(p.status);

        address winner = outcome == p.outcome ? p.proposer : p.disputer;
        p.status = Status.Finalized;
        p.outcome = outcome;

        hub.settle(marketId, outcome);
        if (p.bond > 0) bondToken.safeTransfer(winner, uint256(p.bond) * 2);
        emit Arbitrated(marketId, outcome, winner);
        emit Resolved(marketId, outcome);
    }

    function finalize(uint256 marketId) external nonReentrant {
        Proposal storage p = proposals[marketId];
        if (p.status != Status.Proposed) revert WrongStatus(p.status);
        if (block.timestamp < p.disputeEnds) revert WindowOpen();

        p.status = Status.Finalized;
        hub.settle(marketId, p.outcome);
        if (p.bond > 0) bondToken.safeTransfer(p.proposer, p.bond);
        emit Resolved(marketId, p.outcome);
    }

    function setParams(uint128 bondAmount_, uint64 disputeWindowSec_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bondAmount = bondAmount_;
        disputeWindowSec = disputeWindowSec_;
        emit ParamsSet(bondAmount_, disputeWindowSec_);
    }
}
