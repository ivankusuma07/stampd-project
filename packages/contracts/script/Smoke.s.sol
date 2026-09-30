// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {MarketHub} from "../src/MarketHub.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

/// Opens a throwaway market and buys YES once, so there is a real trade on the explorer
/// (development plan step 1.8). The creator key must hold CREATOR_ROLE and seed dUSD.
///
///   forge script script/Smoke.s.sol --rpc-url $RPC_URL --broadcast
contract Smoke is Script {
    function run() external {
        uint256 pk = vm.envUint("CREATOR_PRIVATE_KEY");
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        DemoUSD usd = DemoUSD(vm.parseJsonAddress(json, ".contracts.DemoUSD"));
        MarketHub hub = MarketHub(vm.parseJsonAddress(json, ".contracts.MarketHub"));
        MarketFactory factory = MarketFactory(vm.parseJsonAddress(json, ".contracts.MarketFactory"));

        uint64 closeTime = uint64(block.timestamp + 1 days);
        vm.startBroadcast(pk);
        usd.approve(address(factory), type(uint256).max);
        usd.approve(address(hub), type(uint256).max);
        uint256 id = factory.createMarket(
            keccak256(abi.encode("smoke", block.timestamp)), 0, closeTime, closeTime + 1 hours, 100, 20e6, 5_000
        );
        uint256 out = hub.buy(id, 1, 1e6, 0, block.timestamp + 10 minutes);
        vm.stopBroadcast();

        console2.log("market", id);
        console2.log("YES shares bought", out);
        console2.log("YES price bps", hub.priceYesBps(id));
    }
}
