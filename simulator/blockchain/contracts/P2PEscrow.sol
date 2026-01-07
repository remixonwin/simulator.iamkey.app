// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IdentityContract.sol";

/**
 * @title P2PEscrow
 * @notice Decentralized escrow for P2P mobile balance marketplace
 * @dev Uses DAI stablecoin, gasless until trade creation, time-locked with decentralized dispute
 */
contract P2PEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Custom Errors ============
    error InvalidAddress();
    error InvalidAmount();
    error TradeAlreadyExists();
    error TradeNotFound();
    error InvalidTradeStatus();
    error NotBuyer();
    error NotPartyToTrade();
    error TooEarly();
    error DisputeWindowClosed();
    error NotDisputed();
    error Unauthorized();
    error NoFeesToWithdraw();
    error FeeTooHigh();
    error CannotTradeWithSelf();
    error InsufficientStake();
    error WithdrawLocked();
    error VoteAlreadyCommitted();
    error VoteNotCommitted();
    error InvalidReveal();
    error AlreadyResolved();

    // ============ Constants ============
    
    uint256 public constant AUTO_RELEASE_DELAY = 48 hours;
    uint256 public constant DISPUTE_WINDOW = 24 hours;
    uint256 public constant PLATFORM_FEE_BPS = 100; // 1%
    uint256 public constant STAKE_LOCK_DURATION = 30 days;
    uint256 public constant SLASHING_DELAY = 90 days;
    uint256 public constant MIN_RESOLVER_STAKE = 100 * 1e18; // 100 DAI

    // ============ State Variables ============
    
    IERC20 public immutable daiToken;
    IdentityContract public immutable identityContract;
    
    address public feeRecipient;
    uint256 public platformFeeBps;
    uint256 public accumulatedFees;

    // ============ Staking & Resolvers ============
    
    struct Resolver {
        uint256 stake;
        uint64 lastStakedAt;
        uint64 withdrawAvailableAt;
        bool isActive;
    }

    mapping(address => Resolver) public resolvers;
    address[] public activeResolvers;

    // ============ Disputes ============
    
    struct Dispute {
        address[] assignedResolvers;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 votesForSeller;
        uint256 votesForBuyer;
        bool resolved;
        uint256 disputeFee;
        mapping(address => bytes32) commits;
        mapping(address => bool) revealed;
        mapping(address => bool) votedForSeller;
    }

    struct PendingSlash {
        address resolver;
        uint256 amount;
        uint64 availableAt;
        bool vetoed;
    }

    mapping(uint256 => PendingSlash) public pendingSlashes;
    uint256 public nextSlashId;

    mapping(bytes32 => Dispute) public disputes;

    // ============ Enums & Structs ============
    
    enum TradeStatus {
        NONEXISTENT,
        FUNDED,
        RELEASED,
        REFUNDED,
        DISPUTED
    }

    struct Trade {
        uint256 amount;
        address buyer;
        uint64 fundedAt;
        TradeStatus status;
        address seller;
        uint64 releaseTime;
        uint32 disputeDeadline;
        string offChainOrderId;
        bytes32 balanceProofHash;
    }

    mapping(bytes32 => Trade) public trades;
    mapping(address => uint64) public completedTrades;

    // ============ Events ============
    
    event TradeFunded(bytes32 indexed tradeId, address indexed buyer, address indexed seller, uint256 amount);
    event DisputeOpened(bytes32 indexed tradeId, address indexed disputedBy, address[] resolvers);
    event VoteCommitted(bytes32 indexed tradeId, address indexed resolver);
    event VoteRevealed(bytes32 indexed tradeId, address indexed resolver, bool voteForSeller);
    event DisputeResolved(bytes32 indexed tradeId, bool releasedToSeller);
    event Staked(address indexed resolver, uint256 amount);
    event Unstaked(address indexed resolver, uint256 amount);
    event ResolverSlashed(address indexed resolver, uint256 amount, string reason);
    event SchellingReward(address indexed resolver, uint256 amount);

    // ============ Modifiers ============
    
    modifier onlyActiveIdentity(address user) {
        IdentityContract.Identity memory id = identityContract.getIdentityByPhoneHash(identityContract.getPhoneHash(user));
        if (id.isFrozen || id.trustLevel < 20) revert Unauthorized();
        _;
    }

    modifier tradeExists(bytes32 tradeId) {
        if (trades[tradeId].status == TradeStatus.NONEXISTENT) revert TradeNotFound();
        _;
    }
    
    constructor(
        address _daiToken,
        address _identityContract,
        address _feeRecipient
    ) Ownable(msg.sender) {
        if (_daiToken == address(0) || _identityContract == address(0) || _feeRecipient == address(0)) {
            revert InvalidAddress();
        }
        
        daiToken = IERC20(_daiToken);
        identityContract = IdentityContract(_identityContract);
        feeRecipient = _feeRecipient;
        platformFeeBps = PLATFORM_FEE_BPS;
    }

    // ============ Staking Functions ============
    
    function stake(uint256 amount) external nonReentrant {
        if (amount < MIN_RESOLVER_STAKE && resolvers[msg.sender].stake == 0) revert InsufficientStake();
        
        daiToken.safeTransferFrom(msg.sender, address(this), amount);
        
        if (resolvers[msg.sender].stake == 0) {
            activeResolvers.push(msg.sender);
            resolvers[msg.sender].isActive = true;
        }
        
        resolvers[msg.sender].stake += amount;
        resolvers[msg.sender].lastStakedAt = uint64(block.timestamp);
        resolvers[msg.sender].withdrawAvailableAt = uint64(block.timestamp + STAKE_LOCK_DURATION);
        
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        Resolver storage res = resolvers[msg.sender];
        if (block.timestamp < res.withdrawAvailableAt) revert WithdrawLocked();
        if (res.stake < amount) revert InvalidAmount();
        
        res.stake -= amount;
        if (res.stake < MIN_RESOLVER_STAKE) {
            res.isActive = false;
            _removeFromActiveResolvers(msg.sender);
        }
        
        daiToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function _removeFromActiveResolvers(address res) internal {
        for (uint i = 0; i < activeResolvers.length; i++) {
            if (activeResolvers[i] == res) {
                activeResolvers[i] = activeResolvers[activeResolvers.length - 1];
                activeResolvers.pop();
                break;
            }
        }
    }

    // ============ Internal Functions ============
    
    function calculateDisputeFee(address caller) public view returns (uint256) {
        bytes32 phoneHash = identityContract.getPhoneHash(caller);
        IdentityContract.Identity memory id = identityContract.getIdentityByPhoneHash(phoneHash);
        
        // Exponential-like scaling: lower trust = higher fee
        // base 200 bps for 100 trust level. Min 50, max 1000.
        uint256 fee = (200 * 100) / id.trustLevel;
        if (fee < 50) return 50;
        if (fee > 1000) return 1000;
        return fee;
    }

    function _selectResolvers(bytes32 tradeId) internal view returns (address[] memory) {
        address[] memory assigned = new address[](3);
        uint256 totalWeight = 0;
        
        // This is gas-intensive if pool is huge, but for now we iterate
        // In production, we'd use a more optimized checkpointed tree or off-chain selection + proof
        for (uint i = 0; i < activeResolvers.length; i++) {
            totalWeight += _getResolverWeight(activeResolvers[i]);
        }
        
        uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, tradeId, totalWeight)));
        
        for (uint i = 0; i < 3 && i < activeResolvers.length; i++) {
            uint256 target = uint256(keccak256(abi.encodePacked(seed, i))) % totalWeight;
            uint256 current = 0;
            for (uint j = 0; j < activeResolvers.length; j++) {
                current += _getResolverWeight(activeResolvers[j]);
                if (current > target) {
                    assigned[i] = activeResolvers[j];
                    break;
                }
            }
        }
        return assigned;
    }

    function _getResolverWeight(address resAddr) internal view returns (uint256) {
        bytes32 phoneHash = identityContract.getPhoneHash(resAddr);
        IdentityContract.Identity memory id = identityContract.getIdentityByPhoneHash(phoneHash);
        return (id.trustLevel * resolvers[resAddr].stake) / 1e18;
    }

    // ============ Dispute Functions ============

    function openDispute(bytes32 tradeId) external tradeExists(tradeId) onlyActiveIdentity(msg.sender) {
        Trade storage trade = trades[tradeId];
        if (trade.status != TradeStatus.FUNDED) revert InvalidTradeStatus();
        if (msg.sender != trade.buyer && msg.sender != trade.seller) revert NotPartyToTrade();
        if (block.timestamp >= trade.disputeDeadline) revert DisputeWindowClosed();
        
        // Charge dispute fee upfront from the trade amount or separate deposit?
        // Usually, dispute fee is deducted from the escrowed amount.
        // For now, we'll mark it to be deducted on resolution.
        // Note: dispute fee is calculated in _resolveDispute using calculateDisputeFee(trade.buyer)
        
        trade.status = TradeStatus.DISPUTED;
        
        address[] memory assigned = _selectResolvers(tradeId);
        
        Dispute storage d = disputes[tradeId];
        d.assignedResolvers = assigned;
        d.commitDeadline = block.timestamp + 24 hours;
        d.revealDeadline = d.commitDeadline + 24 hours;
        
        emit DisputeOpened(tradeId, msg.sender, assigned);
    }

    function commitVote(bytes32 tradeId, bytes32 commit) external {
        Dispute storage d = disputes[tradeId];
        if (trades[tradeId].status != TradeStatus.DISPUTED) revert NotDisputed();
        if (block.timestamp > d.commitDeadline) revert DisputeWindowClosed();
        if (!_isAssigned(tradeId, msg.sender)) revert Unauthorized();
        if (d.commits[msg.sender] != bytes32(0)) revert VoteAlreadyCommitted();
        
        d.commits[msg.sender] = commit;
        emit VoteCommitted(tradeId, msg.sender);
    }

    function revealVote(bytes32 tradeId, bool voteForSeller, bytes32 salt) external {
        Dispute storage d = disputes[tradeId];
        if (block.timestamp <= d.commitDeadline) revert TooEarly();
        if (block.timestamp > d.revealDeadline) revert DisputeWindowClosed();
        if (d.commits[msg.sender] == bytes32(0)) revert VoteNotCommitted();
        if (d.revealed[msg.sender]) revert InvalidReveal();
        
        bytes32 expected = keccak256(abi.encodePacked(voteForSeller, salt));
        if (d.commits[msg.sender] != expected) revert InvalidReveal();
        
        d.revealed[msg.sender] = true;
        if (voteForSeller) {
            d.votesForSeller++;
            d.votedForSeller[msg.sender] = true;
        } else {
            d.votesForBuyer++;
            d.votedForSeller[msg.sender] = false;
        }
        
        emit VoteRevealed(tradeId, msg.sender, voteForSeller);
        
        // Auto-resolve if majoritiy reached
        if (d.votesForSeller >= 2 || d.votesForBuyer >= 2) {
            _resolveDispute(tradeId, d.votesForSeller >= 2);
        }
    }

    function _resolveDispute(bytes32 tradeId, bool releaseToSeller) internal {
        Dispute storage d = disputes[tradeId];
        if (d.resolved) return;
        d.resolved = true;
        
        Trade storage trade = trades[tradeId];
        uint256 disputeFee = (trade.amount * calculateDisputeFee(trade.buyer)) / 10000;
        
        if (releaseToSeller) {
            _releaseFunds(tradeId, trade, (disputeFee * 10000) / trade.amount);
        } else {
            trade.status = TradeStatus.REFUNDED;
            accumulatedFees += disputeFee;
            daiToken.safeTransfer(trade.buyer, trade.amount - disputeFee);
        }
        
        // Schelling Point distribution
        uint256 rewardPool = (disputeFee * 80) / 100; // 80% of dispute fee goes to resolvers
        uint256 winnerCount = releaseToSeller ? d.votesForSeller : d.votesForBuyer;
        
        for (uint i = 0; i < d.assignedResolvers.length; i++) {
            address res = d.assignedResolvers[i];
            if (!d.revealed[res]) {
                _slashResolver(res, MIN_RESOLVER_STAKE / 10, "Failure to reveal");
                continue;
            }
            
            bool votedCorrectly = (d.votedForSeller[res] == releaseToSeller);
            if (votedCorrectly) {
                uint256 reward = rewardPool / winnerCount;
                daiToken.safeTransfer(res, reward);
                emit SchellingReward(res, reward);
                
                // Boost trust level of honest resolver
                bytes32 ph = identityContract.getPhoneHash(res);
                identityContract.adjustTrustLevel(ph, 1); // Internal boost (simulated)
            } else {
                _slashResolver(res, MIN_RESOLVER_STAKE / 20, "Voted against majority");
            }
        }
        
        emit DisputeResolved(tradeId, releaseToSeller);
    }

    function _slashResolver(address resolver, uint256 amount, string memory reason) internal {
        uint256 slashId = nextSlashId++;
        pendingSlashes[slashId] = PendingSlash({
            resolver: resolver,
            amount: amount,
            availableAt: uint64(block.timestamp + SLASHING_DELAY),
            vetoed: false
        });
        emit ResolverSlashed(resolver, amount, reason);
    }

    function executeSlash(uint256 slashId) external nonReentrant {
        PendingSlash storage s = pendingSlashes[slashId];
        if (block.timestamp < s.availableAt) revert TooEarly();
        if (s.vetoed || s.amount == 0) revert Unauthorized();
        
        uint256 amount = s.amount;
        s.amount = 0;
        
        if (resolvers[s.resolver].stake >= amount) {
            resolvers[s.resolver].stake -= amount;
        } else {
            amount = resolvers[s.resolver].stake;
            resolvers[s.resolver].stake = 0;
        }
        
        if (resolvers[s.resolver].stake < MIN_RESOLVER_STAKE) {
            resolvers[s.resolver].isActive = false;
        }
        
        accumulatedFees += amount;
    }

    function vetoSlash(uint256 slashId) external {
        // Only high-trust guardians or admin can veto
        // For MVP, only owner for now
        if (msg.sender != owner()) revert Unauthorized();
        pendingSlashes[slashId].vetoed = true;
    }

    function _isAssigned(bytes32 tradeId, address resolver) internal view returns (bool) {
        address[] memory assigned = disputes[tradeId].assignedResolvers;
        for (uint i = 0; i < assigned.length; i++) {
            if (assigned[i] == resolver) return true;
        }
        return false;
    }

    // ============ Core Escrow Functions ============
    
    function fundTrade(bytes32 tradeId, address seller, uint256 amount, string calldata offChainOrderId) external nonReentrant {
        if (trades[tradeId].status != TradeStatus.NONEXISTENT) revert TradeAlreadyExists();
        if (seller == msg.sender) revert CannotTradeWithSelf();
        
        daiToken.safeTransferFrom(msg.sender, address(this), amount);
        
        trades[tradeId] = Trade({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            fundedAt: uint64(block.timestamp),
            releaseTime: uint64(block.timestamp + AUTO_RELEASE_DELAY),
            disputeDeadline: uint32(block.timestamp + DISPUTE_WINDOW),
            status: TradeStatus.FUNDED,
            offChainOrderId: offChainOrderId,
            balanceProofHash: bytes32(0)
        });
        
        emit TradeFunded(tradeId, msg.sender, seller, amount);
    }

    function confirmRelease(bytes32 tradeId) external nonReentrant tradeExists(tradeId) {
        Trade storage trade = trades[tradeId];
        if (trade.status != TradeStatus.FUNDED) revert InvalidTradeStatus();
        if (msg.sender != trade.buyer) revert NotBuyer();
        _releaseFunds(tradeId, trade, 0);
    }

    function _releaseFunds(bytes32 /*tradeId*/, Trade storage trade, uint256 extraFeeBps) internal {
        // Note: extraFeeBps reserved for future use - allows additional fee calculation
        trade.status = TradeStatus.RELEASED;
        uint256 fee = (trade.amount * (platformFeeBps + extraFeeBps)) / 10000;
        accumulatedFees += fee;
        daiToken.safeTransfer(trade.seller, trade.amount - fee);
        completedTrades[trade.buyer]++;
        completedTrades[trade.seller]++;
    }

    // ============ View Functions ============
    
    function getTrade(bytes32 tradeId) external view returns (Trade memory) {
        return trades[tradeId];
    }

    function getDispute(bytes32 tradeId) external view returns (
        address[] memory assignedResolvers,
        uint256 commitDeadline,
        uint256 revealDeadline,
        uint256 votesForSeller,
        uint256 votesForBuyer,
        bool resolved
    ) {
        Dispute storage d = disputes[tradeId];
        return (d.assignedResolvers, d.commitDeadline, d.revealDeadline, d.votesForSeller, d.votesForBuyer, d.resolved);
    }

    // ============ Admin Functions ============
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _feeRecipient;
    }

    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        if (_feeBps > 500) revert FeeTooHigh();
        platformFeeBps = _feeBps;
    }

    function withdrawFees() external nonReentrant {
        if (msg.sender != feeRecipient) revert Unauthorized();
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NoFeesToWithdraw();
        accumulatedFees = 0;
        daiToken.safeTransfer(feeRecipient, amount);
    }
}
