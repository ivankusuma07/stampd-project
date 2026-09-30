// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Base} from "../Base.t.sol";
import {MarketHub} from "../../src/MarketHub.sol";
import {OutcomeTokens} from "../../src/OutcomeTokens.sol";
import {DemoUSD} from "../../src/DemoUSD.sol";

/// Random buys and sells by a few actors across two markets.
contract Handler is Test {
    MarketHub internal hub;
    OutcomeTokens internal tokens;
    uint256[] internal ids;
    address[] public actors;

    mapping(uint256 => uint256) public lastK;
    bool public kDecreased;
    uint256 public trades;

    constructor(MarketHub hub_, OutcomeTokens tokens_, uint256[] memory ids_, address[] memory actors_) {
        hub = hub_;
        tokens = tokens_;
        ids = ids_;
        actors = actors_;
        for (uint256 i = 0; i < ids_.length; ++i) {
            MarketHub.Market memory m = hub_.getMarket(ids_[i]);
            lastK[ids_[i]] = uint256(m.yesReserve) * m.noReserve;
        }
    }

    function buy(uint256 actorSeed, uint256 idSeed, uint8 outcome, uint256 amount) external {
        address actor = actors[actorSeed % actors.length];
        uint256 id = ids[idSeed % ids.length];
        outcome = outcome % 2;
        amount = bound(amount, 1, 500e6);
        vm.prank(actor);
        try hub.buy(id, outcome, amount, 0, block.timestamp) {
            trades++;
        } catch {}
        _checkK(id);
    }

    function sell(uint256 actorSeed, uint256 idSeed, uint8 outcome, uint256 amount) external {
        address actor = actors[actorSeed % actors.length];
        uint256 id = ids[idSeed % ids.length];
        outcome = outcome % 2;
        uint256 held = tokens.balanceOf(actor, (id << 1) | outcome);
        if (held == 0) return;
        // aim for a collateral amount the actor can afford: at most half their shares' face value
        amount = bound(amount, 1, held / 2 + 1);
        vm.prank(actor);
        try hub.sell(id, outcome, amount, held, block.timestamp) {
            trades++;
        } catch {}
        _checkK(id);
    }

    function _checkK(uint256 id) internal {
        MarketHub.Market memory m = hub.getMarket(id);
        uint256 k = uint256(m.yesReserve) * m.noReserve;
        if (k < lastK[id]) kDecreased = true;
        lastK[id] = k;
    }
}

contract MarketInvariants is Base {
    Handler internal handler;
    uint256[] internal ids;

    function setUp() public override {
        super.setUp();
        ids.push(_createMarket(keccak256("m1"), 200 * USD, 5_000, 100));
        ids.push(_createMarket(keccak256("m2"), 50 * USD, 7_300, 0));

        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = makeAddr("carol");
        vm.prank(admin);
        usd.mint(actors[2], 10_000 * USD);
        _approveAll(actors[2]);

        handler = new Handler(hub, tokens, ids, actors);
        targetContract(address(handler));
    }

    /// Guards against a handler that silently reverts every call.
    function afterInvariant() public view {
        assertGt(handler.trades(), 0, "handler made no trades");
    }

    /// y * n never decreases after a trade.
    function invariant_kNeverDecreases() public view {
        assertFalse(handler.kDecreased());
    }

    /// Outcome token supply equals collateral minus the pool's reserve, for both sides.
    function invariant_supplyMatchesReserves() public view {
        for (uint256 i = 0; i < ids.length; ++i) {
            MarketHub.Market memory m = hub.getMarket(ids[i]);
            assertEq(tokens.totalSupply(_yesId(ids[i])), uint256(m.collateral) - m.yesReserve, "YES supply");
            assertEq(tokens.totalSupply(_noId(ids[i])), uint256(m.collateral) - m.noReserve, "NO supply");
        }
    }

    /// Collateral held covers the worst-case payout of every market plus fees.
    function invariant_solvent() public view {
        uint256 owed;
        for (uint256 i = 0; i < ids.length; ++i) {
            MarketHub.Market memory m = hub.getMarket(ids[i]);
            uint256 yesOut = tokens.totalSupply(_yesId(ids[i]));
            uint256 noOut = tokens.totalSupply(_noId(ids[i]));
            uint256 worst = yesOut > noOut ? yesOut : noOut;
            assertLe(worst, m.collateral, "market under-collateralised");
            owed += uint256(m.collateral) + m.fees;
        }
        assertEq(usd.balanceOf(address(hub)), owed, "hub balance != collateral + fees");
    }
}
