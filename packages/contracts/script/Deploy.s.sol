// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {OutcomeTokens} from "../src/OutcomeTokens.sol";
import {MarketHub} from "../src/MarketHub.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Resolver} from "../src/Resolver.sol";

/// Deploys the full STAMPD contract set and wires the roles.
///
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast \
///     --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
///
/// Env: DEPLOYER_PRIVATE_KEY (required); ADMIN_ADDRESS, CREATOR_ADDRESS, RESOLVER_ADDRESS,
/// ARBITER_ADDRESS, FAUCET_SIGNER_ADDRESS, TOKEN_URI (optional, default to the deployer / a
/// placeholder). Use separate keys per role outside local dev (development plan 7.2).
contract Deploy is Script {
    uint256 internal constant USD = 1e6;

    struct Roles {
        address admin;
        address creator;
        address resolverBot;
        address arbiter;
        address faucetSigner;
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        Roles memory r = Roles({
            admin: vm.envOr("ADMIN_ADDRESS", deployer),
            creator: vm.envOr("CREATOR_ADDRESS", deployer),
            resolverBot: vm.envOr("RESOLVER_ADDRESS", deployer),
            arbiter: vm.envOr("ARBITER_ADDRESS", deployer),
            faucetSigner: vm.envOr("FAUCET_SIGNER_ADDRESS", deployer)
        });
        string memory tokenUri = vm.envOr("TOKEN_URI", string("https://stampd.xyz/api/tokens/{id}.json"));
        uint256 startBlock = block.number;

        vm.startBroadcast(pk);
        DemoUSD usd = new DemoUSD(deployer, 1_000 * USD, 24 hours);
        OutcomeTokens tokens = new OutcomeTokens(deployer, tokenUri);
        MarketHub hub = new MarketHub(deployer, usd, tokens, 1000);
        MarketFactory factory = new MarketFactory(deployer, hub, 10 * USD, 10_000 * USD);
        Resolver resolver = new Resolver(deployer, hub, uint128(50 * USD), 21_600);

        tokens.grantRole(tokens.MINTER_ROLE(), address(hub));
        hub.grantRole(hub.FACTORY_ROLE(), address(factory));
        hub.grantRole(hub.RESOLVER_ROLE(), address(resolver));
        factory.grantRole(factory.CREATOR_ROLE(), r.creator);
        resolver.grantRole(resolver.RESOLVER_ROLE(), r.resolverBot);
        resolver.grantRole(resolver.ARBITER_ROLE(), r.arbiter);
        usd.grantRole(usd.FAUCET_SIGNER_ROLE(), r.faucetSigner);
        usd.setProtocol(address(hub), true);
        usd.setProtocol(address(factory), true);
        usd.setProtocol(address(resolver), true);

        // Seed-liquidity treasury for the creator key and bond float for the resolver bot.
        usd.grantRole(usd.MINTER_ROLE(), deployer);
        usd.mint(r.creator, 100_000 * USD);
        usd.mint(r.resolverBot, 5_000 * USD);

        if (r.admin != deployer) {
            _handOver(usd, tokens, hub, factory, resolver, deployer, r.admin);
        }
        vm.stopBroadcast();

        _write(usd, tokens, hub, factory, resolver, r, startBlock);
    }

    function _handOver(
        DemoUSD usd,
        OutcomeTokens tokens,
        MarketHub hub,
        MarketFactory factory,
        Resolver resolver,
        address deployer,
        address admin
    ) internal {
        bytes32 a = 0x00; // DEFAULT_ADMIN_ROLE
        usd.grantRole(a, admin);
        usd.grantRole(usd.PAUSER_ROLE(), admin);
        tokens.grantRole(a, admin);
        hub.grantRole(a, admin);
        hub.grantRole(hub.PAUSER_ROLE(), admin);
        factory.grantRole(a, admin);
        resolver.grantRole(a, admin);

        usd.renounceRole(usd.MINTER_ROLE(), deployer);
        usd.renounceRole(usd.PAUSER_ROLE(), deployer);
        usd.renounceRole(a, deployer);
        tokens.renounceRole(a, deployer);
        hub.renounceRole(hub.PAUSER_ROLE(), deployer);
        hub.renounceRole(a, deployer);
        factory.renounceRole(a, deployer);
        resolver.renounceRole(a, deployer);
    }

    function _write(
        DemoUSD usd,
        OutcomeTokens tokens,
        MarketHub hub,
        MarketFactory factory,
        Resolver resolver,
        Roles memory r,
        uint256 startBlock
    ) internal {
        string memory c = "contracts";
        vm.serializeAddress(c, "DemoUSD", address(usd));
        vm.serializeAddress(c, "OutcomeTokens", address(tokens));
        vm.serializeAddress(c, "MarketHub", address(hub));
        vm.serializeAddress(c, "MarketFactory", address(factory));
        string memory contractsJson = vm.serializeAddress(c, "Resolver", address(resolver));

        string memory ro = "roles";
        vm.serializeAddress(ro, "admin", r.admin);
        vm.serializeAddress(ro, "creator", r.creator);
        vm.serializeAddress(ro, "resolver", r.resolverBot);
        vm.serializeAddress(ro, "arbiter", r.arbiter);
        string memory rolesJson = vm.serializeAddress(ro, "faucetSigner", r.faucetSigner);

        string memory root = "root";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeUint(root, "deployBlock", startBlock);
        vm.serializeString(root, "roles", rolesJson);
        string memory json = vm.serializeString(root, "contracts", contractsJson);

        // Only a real broadcast records addresses: a dry run's addresses were never deployed.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console2.log("dry run: deployments file not written");
            return;
        }
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("wrote", path);
    }
}
