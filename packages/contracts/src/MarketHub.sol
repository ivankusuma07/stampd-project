// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {OutcomeTokens} from "./OutcomeTokens.sol";
import {FpmmMath} from "./libraries/FpmmMath.sol";

/// @title MarketHub
/// @notice Holds every market's state and collateral. Each market is a binary fixed-product market
///         maker (Gnosis FPMM). The pool's YES/NO reserves are kept as numbers here; outcome tokens
///         exist only in traders' wallets. For every market:
///             YES held by traders = collateral − yesReserve
///             NO  held by traders = collateral − noReserve
///         Fees stay in this contract (no withdrawal in v1, see development plan §0).
contract MarketHub is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint8 public constant NO = 0;
    uint8 public constant YES = 1;

    enum Result {
        None,
        No,
        Yes,
        Invalid
    }

    struct Market {
        uint128 yesReserve;
        uint128 noReserve;
        uint128 collateral; // collateral backing complete sets (excludes fees)
        uint128 fees;
        uint64 closeTime;
        uint64 resolveBy;
        uint16 feeBps;
        bool paused;
        Result result;
        bytes32 questionHash;
        uint64 sourcePostId;
    }

    IERC20 public immutable collateralToken;
    OutcomeTokens public immutable outcomeTokens;
    uint16 public immutable maxFeeBps;

    uint256 public marketCount;
    mapping(uint256 => Market) internal _markets;

    event MarketOpened(
        uint256 indexed marketId, uint128 yesReserve, uint128 noReserve, uint128 collateral, address seedRecipient
    );
    event Trade(
        uint256 indexed marketId,
        address indexed trader,
        uint8 outcome,
        bool isBuy,
        uint256 collateral,
        uint256 shares,
        uint256 fee,
        uint256 priceAfterBps
    );
    event Redeemed(uint256 indexed marketId, address indexed user, uint256 yesBurned, uint256 noBurned, uint256 payout);
    event MarketSettled(uint256 indexed marketId, Result result);
    event MarketPaused(uint256 indexed marketId, bool paused);

    error UnknownMarket();
    error BadOutcome();
    error ZeroAmount();
    error Expired();
    error TradingClosed();
    error MarketIsPaused();
    error Slippage();
    error NotResolved();
    error AlreadyResolved();
    error NotClosed();
    error BadParams();
    error NothingToRedeem();

    constructor(address admin, IERC20 collateral_, OutcomeTokens outcomeTokens_, uint16 maxFeeBps_) {
        if (maxFeeBps_ > 1000) revert BadParams(); // never above 10%
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        collateralToken = collateral_;
        outcomeTokens = outcomeTokens_;
        maxFeeBps = maxFeeBps_;
    }

    // ================================================================ views

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    /// @notice YES price in basis points (0–10000). NO price = 10000 − this.
    function priceYesBps(uint256 marketId) public view returns (uint256) {
        Market storage m = _market(marketId);
        return FpmmMath.priceYesBps(m.yesReserve, m.noReserve);
    }

    function isTradingOpen(uint256 marketId) public view returns (bool) {
        Market storage m = _market(marketId);
        return m.result == Result.None && block.timestamp < m.closeTime && !m.paused && !paused();
    }

    /// @return sharesOut shares the trader receives
    /// @return fee fee kept by the protocol
    /// @return priceAfterBps YES price after the trade
    function quoteBuy(uint256 marketId, uint8 outcome, uint256 amountIn)
        public
        view
        returns (uint256 sharesOut, uint256 fee, uint256 priceAfterBps)
    {
        if (outcome > 1) revert BadOutcome();
        Market storage m = _market(marketId);
        (uint256 buyR, uint256 otherR) = _sides(m, outcome);
        uint256 newBuyR;
        uint256 newOtherR;
        (sharesOut, fee, newBuyR, newOtherR) = FpmmMath.buy(buyR, otherR, amountIn, m.feeBps);
        priceAfterBps = outcome == YES ? FpmmMath.priceYesBps(newBuyR, newOtherR) : FpmmMath.priceYesBps(newOtherR, newBuyR);
    }

    /// @return sharesIn shares the trader must give up to receive `amountOut` collateral
    /// @return fee fee kept by the protocol
    /// @return priceAfterBps YES price after the trade
    function quoteSell(uint256 marketId, uint8 outcome, uint256 amountOut)
        public
        view
        returns (uint256 sharesIn, uint256 fee, uint256 priceAfterBps)
    {
        if (outcome > 1) revert BadOutcome();
        Market storage m = _market(marketId);
        (uint256 sellR, uint256 otherR) = _sides(m, outcome);
        uint256 newSellR;
        uint256 newOtherR;
        (sharesIn, fee, newSellR, newOtherR) = FpmmMath.sell(sellR, otherR, amountOut, m.feeBps);
        priceAfterBps =
            outcome == YES ? FpmmMath.priceYesBps(newSellR, newOtherR) : FpmmMath.priceYesBps(newOtherR, newSellR);
    }

    // ================================================================ trading

    function buy(uint256 marketId, uint8 outcome, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 sharesOut)
    {
        Market storage m = _tradable(marketId, outcome, deadline);
        if (amountIn == 0) revert ZeroAmount();

        uint256 fee;
        (sharesOut, fee) = _applyBuy(m, outcome, amountIn);
        if (sharesOut == 0 || sharesOut < minOut) revert Slippage();

        collateralToken.safeTransferFrom(msg.sender, address(this), amountIn);
        outcomeTokens.mint(msg.sender, _tokenId(marketId, outcome), sharesOut);

        emit Trade(marketId, msg.sender, outcome, true, amountIn, sharesOut, fee, _price(m));
    }

    function sell(uint256 marketId, uint8 outcome, uint256 amountOut, uint256 maxIn, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 sharesIn)
    {
        Market storage m = _tradable(marketId, outcome, deadline);
        if (amountOut == 0) revert ZeroAmount();

        uint256 fee;
        (sharesIn, fee) = _applySell(m, outcome, amountOut);
        if (sharesIn > maxIn) revert Slippage();

        outcomeTokens.burn(msg.sender, _tokenId(marketId, outcome), sharesIn);
        collateralToken.safeTransfer(msg.sender, amountOut);

        emit Trade(marketId, msg.sender, outcome, false, amountOut, sharesIn, fee, _price(m));
    }

    /// @notice Burn all of the caller's YES and NO shares in a settled market and pay out:
    ///         winning share 1.00, losing share 0, INVALID 0.50 per share of either side.
    function redeem(uint256 marketId) external nonReentrant returns (uint256 payout) {
        Market storage m = _market(marketId);
        Result r = m.result;
        if (r == Result.None) revert NotResolved();

        uint256 yesId = _tokenId(marketId, YES);
        uint256 noId = _tokenId(marketId, NO);
        uint256 yesBal = outcomeTokens.balanceOf(msg.sender, yesId);
        uint256 noBal = outcomeTokens.balanceOf(msg.sender, noId);
        if (yesBal == 0 && noBal == 0) revert NothingToRedeem();

        if (r == Result.Yes) payout = yesBal;
        else if (r == Result.No) payout = noBal;
        else payout = (yesBal + noBal) / 2;

        if (yesBal > 0) outcomeTokens.burn(msg.sender, yesId, yesBal);
        if (noBal > 0) outcomeTokens.burn(msg.sender, noId, noBal);
        m.collateral -= SafeCast.toUint128(payout);
        if (payout > 0) collateralToken.safeTransfer(msg.sender, payout);

        emit Redeemed(marketId, msg.sender, yesBal, noBal, payout);
    }

    // ================================================================ privileged

    /// @notice Open a market. Called by MarketFactory after it has moved `seed` collateral here.
    /// @dev Mints `seed` complete sets into the pool, then hands the surplus of the side that should
    ///      be expensive to `seedRecipient`, so the pool opens at `initialYesPriceBps`.
    function openMarket(
        bytes32 questionHash,
        uint64 sourcePostId,
        uint64 closeTime,
        uint64 resolveBy,
        uint16 feeBps,
        uint256 seed,
        uint16 initialYesPriceBps,
        address seedRecipient
    ) external onlyRole(FACTORY_ROLE) returns (uint256 marketId) {
        if (feeBps > maxFeeBps || closeTime <= block.timestamp || resolveBy < closeTime || seed == 0) {
            revert BadParams();
        }
        (uint256 y, uint256 n) = FpmmMath.seedReserves(seed, initialYesPriceBps);

        marketId = ++marketCount;
        Market storage m = _markets[marketId];
        m.yesReserve = SafeCast.toUint128(y);
        m.noReserve = SafeCast.toUint128(n);
        m.collateral = SafeCast.toUint128(seed);
        m.closeTime = closeTime;
        m.resolveBy = resolveBy;
        m.feeBps = feeBps;
        m.questionHash = questionHash;
        m.sourcePostId = sourcePostId;

        if (seed > y) outcomeTokens.mint(seedRecipient, _tokenId(marketId, YES), seed - y);
        if (seed > n) outcomeTokens.mint(seedRecipient, _tokenId(marketId, NO), seed - n);

        emit MarketOpened(marketId, m.yesReserve, m.noReserve, m.collateral, seedRecipient);
    }

    /// @notice Final outcome, set by the Resolver contract after the dispute process.
    function settle(uint256 marketId, Result result) external onlyRole(RESOLVER_ROLE) {
        Market storage m = _market(marketId);
        if (result == Result.None) revert BadOutcome();
        if (m.result != Result.None) revert AlreadyResolved();
        if (block.timestamp < m.closeTime) revert NotClosed();
        m.result = result;
        emit MarketSettled(marketId, result);
    }

    function setMarketPaused(uint256 marketId, bool paused_) external onlyRole(PAUSER_ROLE) {
        _market(marketId).paused = paused_;
        emit MarketPaused(marketId, paused_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ================================================================ internal

    function _market(uint256 marketId) internal view returns (Market storage m) {
        if (marketId == 0 || marketId > marketCount) revert UnknownMarket();
        m = _markets[marketId];
    }

    function _tradable(uint256 marketId, uint8 outcome, uint256 deadline) internal view returns (Market storage m) {
        if (outcome > 1) revert BadOutcome();
        if (block.timestamp > deadline) revert Expired();
        m = _market(marketId);
        if (m.result != Result.None || block.timestamp >= m.closeTime) revert TradingClosed();
        if (m.paused) revert MarketIsPaused();
    }

    function _applyBuy(Market storage m, uint8 outcome, uint256 amountIn)
        internal
        returns (uint256 sharesOut, uint256 fee)
    {
        (uint256 buyR, uint256 otherR) = _sides(m, outcome);
        uint256 newBuyR;
        uint256 newOtherR;
        (sharesOut, fee, newBuyR, newOtherR) = FpmmMath.buy(buyR, otherR, amountIn, m.feeBps);
        _setReserves(m, outcome, newBuyR, newOtherR);
        m.collateral += SafeCast.toUint128(amountIn - fee);
        m.fees += SafeCast.toUint128(fee);
    }

    function _applySell(Market storage m, uint8 outcome, uint256 amountOut)
        internal
        returns (uint256 sharesIn, uint256 fee)
    {
        (uint256 sellR, uint256 otherR) = _sides(m, outcome);
        uint256 newSellR;
        uint256 newOtherR;
        (sharesIn, fee, newSellR, newOtherR) = FpmmMath.sell(sellR, otherR, amountOut, m.feeBps);
        _setReserves(m, outcome, newSellR, newOtherR);
        // the pool burns amountOut + fee complete sets; the fee part moves to `fees`
        m.collateral -= SafeCast.toUint128(amountOut + fee);
        m.fees += SafeCast.toUint128(fee);
    }

    /// @return sideR reserve of `outcome`
    /// @return otherR reserve of the opposite outcome
    function _sides(Market storage m, uint8 outcome) internal view returns (uint256 sideR, uint256 otherR) {
        return outcome == YES ? (uint256(m.yesReserve), uint256(m.noReserve)) : (uint256(m.noReserve), uint256(m.yesReserve));
    }

    function _price(Market storage m) internal view returns (uint256) {
        return FpmmMath.priceYesBps(m.yesReserve, m.noReserve);
    }

    function _tokenId(uint256 marketId, uint8 outcome) internal pure returns (uint256) {
        return (marketId << 1) | outcome;
    }

    function _setReserves(Market storage m, uint8 outcome, uint256 sideR, uint256 otherR) internal {
        if (outcome == YES) {
            m.yesReserve = SafeCast.toUint128(sideR);
            m.noReserve = SafeCast.toUint128(otherR);
        } else {
            m.noReserve = SafeCast.toUint128(sideR);
            m.yesReserve = SafeCast.toUint128(otherR);
        }
    }
}
