# Security findings (development plan 7.1)

Status of the security pass so far. An **external review is still required before mainnet** (plan B12 review gate) and a full audit before any real-value collateral.

## Tests that back the contracts

- 86 Foundry tests: unit tests for every function and revert path, plus the plan's worked example (`y = n = 100`, buy 10 → 19.090909 YES).
- Fuzz, 10,000 runs in CI: `y·n` never decreases on buy or sell; no free round trip; opening price within 1 bps.
- Invariants (256 runs × 64 calls, random buys/sells by 3 actors over 2 markets): `k` never decreases; outcome token supply equals `collateral − reserve` for both sides; the hub's balance equals Σ(collateral + fees) and covers the worst-case payout of every market. A guard fails the run if the handler never manages a trade.
- 2,000 Solidity quote vectors reproduced to the unit by the TypeScript port the UI uses.

## Slither (slither-analyzer, 81 detectors, 30 Sep 2026)

No high-severity findings.

| Detector | Where | Severity | Status |
|---|---|---|---|
| reentrancy-no-eth | `MarketFactory.createMarket` | Medium | **Fixed** (decisions D12): id recorded before external calls; `nonReentrant`. |
| incorrect-equality | `DemoUSD.nextClaimAt` (`last == 0`) | Medium | **False positive**: checks the "never claimed" sentinel in storage, not a balance. |
| reentrancy-events | `MarketFactory.createMarket`, `MarketHub.openMarket` | Low | **Accepted**: events follow calls to our own collateral token / hub, both trusted. |
| timestamp ×9 | claim cooldown, trading close, dispute window | Low | **By design**: deadlines are hours or days; a sequencer's few seconds of timestamp leeway don't matter. The market rules say `closeTime` is enforced onchain (plan R19). |

## Design properties worth reviewing

- **Rounding** always favours the pool: shares out rounded down, shares in and fees rounded up (`FpmmMath`).
- **Fee cap** `maxFeeBps` is immutable and at most 10%.
- **No withdrawal** of fees or leftover seed liquidity in v1 (development plan §0 decision) — funds can't be taken out, only redeemed by holders.
- **Roles are separate**: `CREATOR_ROLE` (factory), `RESOLVER_ROLE` / `ARBITER_ROLE` (resolver), `FAUCET_SIGNER_ROLE`, `PAUSER_ROLE`, `DEFAULT_ADMIN_ROLE`. `Deploy.s.sol` can hand every admin role to a separate address and renounce the deployer's.
- **Resolution**: the proposer can't dispute itself; a disputed market can only be settled by the arbiter; the bond is snapshotted per proposal.
- **Faucet**: vouchers are bound to address + nonce + deadline and reject replays; per-address 24 h limit on chain; captcha and per-IP limit in the API.

## Off-chain

- API input validated with Zod on every route; global rate limit plus tighter limits on auth, faucet, submissions, callouts and takedowns.
- Sessions are signed httpOnly `SameSite=Lax` cookies; SIWE nonces are single-use and expire in 10 minutes; domain and chain id are checked.
- The web app sends a Content-Security-Policy (`frame-ancestors 'none'`, same-origin by default, RPC and Turnstile allowlisted), `nosniff`, a strict referrer policy and a permissions policy.
- Post text is data only in both AI passes (plan R14): it sits inside `<post>` tags, the system prompt says to ignore instructions in it, the output is schema-constrained, and code validators run on it. The model has no tools.

## Open before mainnet

- [ ] External review of the contracts, findings fixed.
- [ ] Multisig + timelock for admin and arbiter (check what's deployed on Robinhood Chain, V5).
- [ ] Dependency pinning review of the lockfile.
- [ ] Look-alike domain monitoring (R20).
