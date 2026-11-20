// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title RefundEscrow
/// @notice Holds each seller's USDC refund bond for an x402 endpoint on Base Sepolia. When the
/// GenLayer RefundCourt finalizes a REFUND, the relayer pays the buyer back from that bond: once per
/// case, never more than the bond holds, always naming the GenLayer judgment it carries out. The
/// court then checks this payout on Base before closing the case.
contract RefundEscrow {
    struct Bond {
        address seller;
        uint256 balance;
        uint64 unlockAt; // 0 = no withdrawal requested
    }

    uint256 public constant WITHDRAWAL_DELAY = 1 days;

    IERC20 public immutable usdc;
    address public immutable relayer;
    /// @notice Address of the GenLayer RefundCourt whose judgments this escrow pays. Set once.
    string public court;

    mapping(bytes32 => Bond) public bonds; // service key => bond
    mapping(bytes32 => bool) public refunded; // case key => paid

    event CourtSet(string court);
    event BondPosted(bytes32 indexed serviceKey, address indexed seller, uint256 amount, uint256 balance);
    event Refunded(bytes32 indexed caseKey, bytes32 indexed serviceKey, address indexed buyer, uint256 amount, bytes32 genlayerTx);
    event WithdrawalRequested(bytes32 indexed serviceKey, uint256 unlockAt);
    event Withdrawn(bytes32 indexed serviceKey, address indexed seller, uint256 amount);

    error OnlyRelayer();
    error OnlySeller();
    error CourtAlreadySet();
    error AlreadyRefunded();
    error BondTooSmall();
    error ZeroAmount();
    error TransferFailed();
    error NotUnlocked();

    constructor(IERC20 _usdc, address _relayer) {
        usdc = _usdc;
        relayer = _relayer;
    }

    function setCourt(string calldata _court) external {
        if (msg.sender != relayer) revert OnlyRelayer();
        if (bytes(court).length != 0) revert CourtAlreadySet();
        court = _court;
        emit CourtSet(_court);
    }

    /// @notice A seller adds USDC to the bond behind one promise. The first poster owns the bond.
    /// Posting again cancels a pending withdrawal.
    function postBond(bytes32 serviceKey, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Bond storage b = bonds[serviceKey];
        if (b.seller == address(0)) b.seller = msg.sender;
        else if (b.seller != msg.sender) revert OnlySeller();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        b.balance += amount;
        b.unlockAt = 0;
        emit BondPosted(serviceKey, msg.sender, amount, b.balance);
    }

    /// @notice Pays a buyer back for a case the GenLayer court finalized as REFUND.
    function refund(bytes32 caseKey, bytes32 serviceKey, address buyer, uint256 amount, bytes32 genlayerTx) external {
        if (msg.sender != relayer) revert OnlyRelayer();
        if (refunded[caseKey]) revert AlreadyRefunded();
        if (amount == 0) revert ZeroAmount();
        Bond storage b = bonds[serviceKey];
        if (b.balance < amount) revert BondTooSmall();
        refunded[caseKey] = true;
        b.balance -= amount;
        if (!usdc.transfer(buyer, amount)) revert TransferFailed();
        emit Refunded(caseKey, serviceKey, buyer, amount, genlayerTx);
    }

    /// @notice A seller who wants the bond back must wait a day; refunds stay payable meanwhile.
    function requestWithdrawal(bytes32 serviceKey) external {
        Bond storage b = bonds[serviceKey];
        if (msg.sender != b.seller) revert OnlySeller();
        b.unlockAt = uint64(block.timestamp + WITHDRAWAL_DELAY);
        emit WithdrawalRequested(serviceKey, b.unlockAt);
    }

    function withdraw(bytes32 serviceKey) external {
        Bond storage b = bonds[serviceKey];
        if (msg.sender != b.seller) revert OnlySeller();
        if (b.unlockAt == 0 || block.timestamp < b.unlockAt) revert NotUnlocked();
        uint256 amount = b.balance;
        b.balance = 0;
        b.unlockAt = 0;
        if (!usdc.transfer(b.seller, amount)) revert TransferFailed();
        emit Withdrawn(serviceKey, b.seller, amount);
    }
}
