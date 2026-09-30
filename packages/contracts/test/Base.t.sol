// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {OutcomeTokens} from "../src/OutcomeTokens.sol";
import {MarketHub} from "../src/MarketHub.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Resolver} from "../src/Resolver.sol";

abstract contract Base is Test {
    uint256 internal constant USD = 1e6;
    uint16 internal constant MAX_FEE_BPS = 1000;
    uint64 internal constant DISPUTE_WINDOW = 21_600;
    uint128 internal constant BOND = 50 * 1e6;

    DemoUSD internal usd;
    OutcomeTokens internal tokens;
    MarketHub internal hub;
    MarketFactory internal factory;
    Resolver internal resolver;

    address internal admin = makeAddr("admin");
    address internal creator = makeAddr("creator");
    address internal resolverBot = makeAddr("resolverBot");
    address internal arbiter = makeAddr("arbiter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal faucetSignerKey = 0xFA0CE7;
    address internal faucetSigner;

    uint64 internal closeTime;

    function setUp() public virtual {
        vm.warp(1_790_000_000); // Sep 2026
        faucetSigner = vm.addr(faucetSignerKey);
        closeTime = uint64(block.timestamp + 7 days);

        vm.startPrank(admin);
        usd = new DemoUSD(admin, 1_000 * USD, 24 hours);
        tokens = new OutcomeTokens(admin, "https://stampd.example/api/tokens/{id}.json");
        hub = new MarketHub(admin, usd, tokens, MAX_FEE_BPS);
        factory = new MarketFactory(admin, hub, 10 * USD, 10_000 * USD);
        resolver = new Resolver(admin, hub, BOND, DISPUTE_WINDOW);

        tokens.grantRole(tokens.MINTER_ROLE(), address(hub));
        hub.grantRole(hub.FACTORY_ROLE(), address(factory));
        hub.grantRole(hub.RESOLVER_ROLE(), address(resolver));
        factory.grantRole(factory.CREATOR_ROLE(), creator);
        resolver.grantRole(resolver.RESOLVER_ROLE(), resolverBot);
        resolver.grantRole(resolver.ARBITER_ROLE(), arbiter);
        usd.grantRole(usd.FAUCET_SIGNER_ROLE(), faucetSigner);
        usd.grantRole(usd.MINTER_ROLE(), admin);
        usd.setProtocol(address(hub), true);
        usd.setProtocol(address(factory), true);
        usd.setProtocol(address(resolver), true);

        usd.mint(creator, 1_000_000 * USD);
        usd.mint(resolverBot, 10_000 * USD);
        usd.mint(alice, 10_000 * USD);
        usd.mint(bob, 10_000 * USD);
        vm.stopPrank();

        _approveAll(creator);
        _approveAll(resolverBot);
        _approveAll(alice);
        _approveAll(bob);
    }

    function _approveAll(address who) internal {
        vm.startPrank(who);
        usd.approve(address(hub), type(uint256).max);
        usd.approve(address(factory), type(uint256).max);
        usd.approve(address(resolver), type(uint256).max);
        vm.stopPrank();
    }

    function _createMarket(uint256 seed, uint16 priceBps, uint16 feeBps) internal returns (uint256 id) {
        return _createMarket(keccak256(abi.encode(seed, priceBps, feeBps, block.timestamp)), seed, priceBps, feeBps);
    }

    function _createMarket(bytes32 questionHash, uint256 seed, uint16 priceBps, uint16 feeBps)
        internal
        returns (uint256 id)
    {
        vm.prank(creator);
        id = factory.createMarket(questionHash, 1_873_000_000_000_000_000, closeTime, closeTime + 1 days, feeBps, seed, priceBps);
    }

    function _yesId(uint256 marketId) internal pure returns (uint256) {
        return (marketId << 1) | 1;
    }

    function _noId(uint256 marketId) internal pure returns (uint256) {
        return marketId << 1;
    }

    function _buy(address who, uint256 id, uint8 outcome, uint256 amount) internal returns (uint256) {
        vm.prank(who);
        return hub.buy(id, outcome, amount, 0, block.timestamp);
    }

    function _voucher(address to, uint256 amount, uint256 nonce, uint256 deadline, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("STAMPD Demo USD"),
                keccak256("1"),
                block.chainid,
                address(usd)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(keccak256("Claim(address to,uint256 amount,uint256 nonce,uint256 deadline)"), to, amount, nonce, deadline)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }
}
