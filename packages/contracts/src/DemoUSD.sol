// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title DemoUSD
/// @notice Play-money collateral (6 decimals). It is minted only through the faucet, which needs a
///         voucher signed by the backend after a captcha (plan R12), and at most once per address
///         per `claimCooldown`. While `transfersRestricted` is on, tokens can only move to or from
///         protocol contracts, so the token cannot trade on a DEX or be passed around (plan R2).
contract DemoUSD is ERC20, AccessControl, Pausable, EIP712 {
    bytes32 public constant FAUCET_SIGNER_ROLE = keccak256("FAUCET_SIGNER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bytes32 private constant CLAIM_TYPEHASH =
        keccak256("Claim(address to,uint256 amount,uint256 nonce,uint256 deadline)");

    uint256 public maxClaimAmount;
    uint256 public claimCooldown;
    bool public transfersRestricted = true;

    mapping(address => uint256) public lastClaimAt;
    mapping(address => uint256) public claimNonces;
    mapping(address => bool) public isProtocol;

    event Claimed(address indexed to, uint256 amount, uint256 nonce);
    event ClaimLimitsSet(uint256 maxClaimAmount, uint256 claimCooldown);
    event ProtocolSet(address indexed account, bool allowed);
    event TransfersRestrictedSet(bool restricted);

    error VoucherExpired();
    error InvalidSigner();
    error OverLimit();
    error CooldownActive(uint256 availableAt);
    error TransferRestricted();

    constructor(address admin, uint256 maxClaimAmount_, uint256 claimCooldown_)
        ERC20("STAMPD Demo USD", "dUSD")
        EIP712("STAMPD Demo USD", "1")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        maxClaimAmount = maxClaimAmount_;
        claimCooldown = claimCooldown_;
        emit ClaimLimitsSet(maxClaimAmount_, claimCooldown_);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ---------------------------------------------------------------- faucet

    /// @notice Claim demo USD with a voucher signed by a `FAUCET_SIGNER_ROLE` key.
    /// @dev The voucher binds the caller, amount, the caller's current nonce and a deadline, so it
    ///      cannot be replayed or used by another address.
    function claim(uint256 amount, uint256 deadline, bytes calldata signature) external whenNotPaused {
        if (block.timestamp > deadline) revert VoucherExpired();
        if (amount == 0 || amount > maxClaimAmount) revert OverLimit();

        uint256 last = lastClaimAt[msg.sender];
        if (last != 0 && block.timestamp < last + claimCooldown) revert CooldownActive(last + claimCooldown);

        uint256 nonce = claimNonces[msg.sender];
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, msg.sender, amount, nonce, deadline)));
        address signer = ECDSA.recover(digest, signature);
        if (!hasRole(FAUCET_SIGNER_ROLE, signer)) revert InvalidSigner();

        claimNonces[msg.sender] = nonce + 1;
        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, amount);
        emit Claimed(msg.sender, amount, nonce);
    }

    /// @notice Timestamp from which `account` may claim again (0 = now).
    function nextClaimAt(address account) external view returns (uint256) {
        uint256 last = lastClaimAt[account];
        return last == 0 ? 0 : last + claimCooldown;
    }

    // ---------------------------------------------------------------- admin

    /// @notice Treasury mint, used to fund market seed liquidity.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function setClaimLimits(uint256 maxClaimAmount_, uint256 claimCooldown_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxClaimAmount = maxClaimAmount_;
        claimCooldown = claimCooldown_;
        emit ClaimLimitsSet(maxClaimAmount_, claimCooldown_);
    }

    function setProtocol(address account, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isProtocol[account] = allowed;
        emit ProtocolSet(account, allowed);
    }

    function setTransfersRestricted(bool restricted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        transfersRestricted = restricted;
        emit TransfersRestrictedSet(restricted);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _update(address from, address to, uint256 value) internal override {
        if (transfersRestricted && from != address(0) && to != address(0) && !isProtocol[from] && !isProtocol[to]) {
            revert TransferRestricted();
        }
        super._update(from, to, value);
    }
}
