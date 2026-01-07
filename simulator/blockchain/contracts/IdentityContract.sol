// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract IdentityContract {
    using MessageHashUtils for bytes32;
    // Custom Errors for Gas Optimization
    error NotOwner();
    error InvalidOwner();
    error EmptyInput();
    error IdentityAlreadyExists();
    error IdentityNotFound();
    error NotIdentityOwner();
    error MaxGuardiansReached();
    error GuardianAlreadyRegistered();
    error GuardianNotFound();
    error NotAuthorized();
    error RecoveryAlreadyInProgress();
    error NoActiveRecoverySession();
    error AlreadyApproved();
    error InsufficientApprovals();
    error InvalidGuardianAddress();
    error InvalidNewOwner();
    error RecoveryInProgress();
    error RecoveryNotFound();
    error RecoveryCompleted();
    error NotGuardian();
    error InvalidCertificate();
    error BondTooLow();
    error AlreadyResolver();

    uint256 private _identityIds;

    // Owner management
    address private _owner;
    address private _signer; // Authorized backend signer for PCI-Certificates
    mapping(address => bool) public trustManagers;
    IERC20 public daiToken;

    constructor(address initialSigner, address _daiToken) {
        _owner = msg.sender;
        _signer = initialSigner;
        daiToken = IERC20(_daiToken);
        trustManagers[msg.sender] = true;
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert NotOwner();
        _;
    }

    modifier onlyTrustManager() {
        if (!trustManagers[msg.sender] && msg.sender != _owner) revert NotAuthorized();
        _;
    }

    function setTrustManager(address manager, bool active) external onlyOwner {
        trustManagers[manager] = active;
    }

    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidOwner();
        _signer = newSigner;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        _owner = newOwner;
    }

    // Optimized Identity structure (Storage Packing)
    struct Identity {
        bytes32 phoneHash;       // Slot 1
        bytes32 salt;            // Slot 2
        string username;         // Slot 3 (Partial) + Slot 4...
        address owner;           // Slot 5: 20 bytes
        uint64 registeredAt;     // Slot 5: 8 bytes
        uint32 trustLevel;       // Slot 5: 4 bytes (Replaces reputationScore)
        uint256 identityBond;    // Slot 6: 32 bytes (DAI staked)
        bool isBiometricEnabled; // Slot 7: 1 byte
        bool isFlagged;          // Slot 7: 1 byte
        bool isFrozen;           // Slot 7: 1 byte
        bool isResolver;         // Slot 7: 1 byte
    }

    // Recovery structures
    struct RecoverySession {
        bytes32 identityHash;
        address newOwner;
        uint64 createdAt;
        uint32 approvals;
        bool executed;
    }

    struct GuardianApproval {
        address guardian;
        uint64 timestamp;
    }

    // Guardian management structures
    enum GuardianStatus {
        PENDING,
        ACTIVE,
        INACTIVE,
        REVOKED
    }

    struct GuardianRegistration {
        address guardianAddress; // 20
        bytes32 identityHash;    // 32
        uint64 registeredAt;     // 8
        GuardianStatus status;   // 1
        bytes32 publicKeyHash;   // 32
    }

    // Mapping from identity ID to Identity
    mapping(uint256 => Identity) private _identities;

    // Mapping from phone hash to identity ID
    mapping(bytes32 => uint256) private _phoneHashToIdentityId;

    // Mapping from address to phone hash for easy lookup
    mapping(address => bytes32) private _addressToPhoneHash;

    // Identity ownership mapping (bytes32 identityHash -> owner address)
    mapping(bytes32 => address) private _identityOwners;

    // Off-chain metadata hash registry (privacy-preserving)
    mapping(bytes32 => bytes32) private _identityMetadataHash;
    
    // Guardian management mappings
    mapping(bytes32 => mapping(address => GuardianRegistration)) private _guardianRegistrations;
    mapping(bytes32 => uint256) private _guardianCount;
    mapping(bytes32 => address[]) private _identityGuardians;
    mapping(bytes32 => mapping(address => uint256)) private _guardianIndices; // Tracks index in _identityGuardians array

    // Recovery mappings
    mapping(bytes32 => RecoverySession) private _recoverySessions;
    mapping(bytes32 => mapping(address => bool)) private _guardianApprovals;

    // Events
    event IdentityCreated(
        uint256 indexed identityId,
        bytes32 phoneHash,
        address owner,
        uint256 timestamp
    );

    event IdentityUpdated(
        uint256 indexed identityId,
        bytes32 phoneHash,
        uint256 timestamp
    );

    event IdentityDeleted(
        uint256 indexed identityId,
        bytes32 phoneHash,
        uint256 timestamp
    );

    event ReputationUpdated(
        uint256 indexed identityId,
        uint256 newScore,
        uint256 timestamp
    );

    event FraudReported(
        uint256 indexed identityId,
        string reason,
        uint256 timestamp
    );

    event IdentityMetadataHashUpdated(
        bytes32 indexed phoneHash,
        bytes32 metadataHash,
        uint256 timestamp
    );

    event IdentityFrozen(bytes32 indexed phoneHash, bool frozen, uint256 timestamp);
    event TrustLevelUpdated(bytes32 indexed phoneHash, uint32 newLevel, uint256 timestamp);
    event AppealSubmitted(bytes32 indexed phoneHash, string reason, uint256 timestamp);

    // Guardian events
    event GuardianRegistered(
        bytes32 indexed identityHash,
        address indexed guardianAddress,
        uint256 timestamp
    );

    event GuardianStatusUpdated(
        bytes32 indexed identityHash,
        address indexed guardianAddress,
        GuardianStatus status,
        uint256 timestamp
    );

    event GuardianRemoved(
        bytes32 indexed identityHash,
        address indexed guardianAddress,
        uint256 timestamp
    );

    event RecoveryInitiated(
        bytes32 indexed identityHash,
        address indexed newOwner,
        uint256 timestamp
    );

    event RecoveryApproved(
        bytes32 indexed identityHash,
        address indexed guardian,
        uint256 timestamp
    );

    event RecoveryExecuted(
        bytes32 indexed identityHash,
        address indexed newOwner,
        uint256 timestamp
    );

    /**
     * @dev Creates a new identity
     * @param phoneHash The hashed phone number
     * @param salt The salt used for hashing
     * @param username The username
     * @param isBiometricEnabled Whether biometric authentication is enabled
     */
    function createIdentity(
        bytes32 phoneHash,
        bytes32 salt,
        string calldata username,
        bool isBiometricEnabled
    ) external returns (uint256) {
        if (phoneHash == bytes32(0)) revert EmptyInput();
        if (salt == bytes32(0)) revert EmptyInput();
        if (bytes(username).length == 0) revert EmptyInput();
        if (_phoneHashToIdentityId[phoneHash] != 0) revert IdentityAlreadyExists();

        _identityIds++;
        uint256 newIdentityId = _identityIds;

        _identities[newIdentityId] = Identity({
            phoneHash: phoneHash,
            salt: salt,
            username: username,
            registeredAt: uint64(block.timestamp),
            isBiometricEnabled: isBiometricEnabled,
            owner: msg.sender,
            trustLevel: 100, // Initial trust level
            identityBond: 0,
            isFlagged: false,
            isFrozen: false,
            isResolver: false
        });

        _phoneHashToIdentityId[phoneHash] = newIdentityId;
        _addressToPhoneHash[msg.sender] = phoneHash;
        
        // Register identity hash for guardian registry integration
        _identityOwners[phoneHash] = msg.sender;

        emit IdentityCreated(newIdentityId, phoneHash, msg.sender, block.timestamp);

        return newIdentityId;
    }

    /**
     * @dev Gets an identity by phone hash
     * @param phoneHash The hashed phone number
     */
    function getIdentityByPhoneHash(bytes32 phoneHash)
        external
        view
        returns (Identity memory)
    {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();
        return _identities[identityId];
    }

    /**
     * @dev Checks if an identity exists by phone hash
     * @param phoneHash The hashed phone number
     */
    function identityExists(bytes32 phoneHash) external view returns (bool) {
        return _phoneHashToIdentityId[phoneHash] != 0;
    }

    /**
     * @dev Gets the phone hash associated with an address
     * @param addr The address to lookup
     */
    function getPhoneHash(address addr) external view returns (bytes32) {
        return _addressToPhoneHash[addr];
    }

    /**
     * @dev Update metadata hash for an identity (off-chain data integrity).
     * @param phoneHash The hashed phone number of the identity
     * @param metadataHash Keccak-256 hash of metadata payload
     */
    function updateIdentityMetadataHash(bytes32 phoneHash, bytes32 metadataHash)
        external
        onlyOwner
    {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();
        _identityMetadataHash[phoneHash] = metadataHash;
        emit IdentityMetadataHashUpdated(phoneHash, metadataHash, block.timestamp);
    }

    /**
     * @dev Returns metadata hash for an identity.
     * @param phoneHash The hashed phone number of the identity
     */
    function getIdentityMetadataHash(bytes32 phoneHash)
        external
        view
        returns (bytes32)
    {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();
        return _identityMetadataHash[phoneHash];
    }

    /**
     * @dev Updates an identity
     * @param phoneHash The hashed phone number of the identity to update
     * @param newUsername The new username
     * @param isBiometricEnabled Whether biometric authentication is enabled
     */
    function updateIdentity(
        bytes32 phoneHash,
        string calldata newUsername,
        bool isBiometricEnabled
    ) external {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();
        if (_identities[identityId].owner != msg.sender) revert NotIdentityOwner();

        _identities[identityId].username = newUsername;
        _identities[identityId].isBiometricEnabled = isBiometricEnabled;

        emit IdentityUpdated(identityId, phoneHash, block.timestamp);
    }

    /**
     * @dev Deletes an identity
     * @param phoneHash The hashed phone number of the identity to delete
     */
    function deleteIdentity(bytes32 phoneHash) external {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();
        if (_identities[identityId].owner != msg.sender) revert NotIdentityOwner();

        delete _identities[identityId];
        delete _phoneHashToIdentityId[phoneHash];

        emit IdentityDeleted(identityId, phoneHash, block.timestamp);
    }

    /**
     * @dev Gets all identities (admin only)
     */
    function getAllIdentities() external view returns (Identity[] memory) {
        if (_owner != msg.sender) revert NotOwner();

        uint256 count = _identityIds;
        Identity[] memory identities = new Identity[](count);

        for (uint256 i = 1; i <= count; i++) {
            identities[i - 1] = _identities[i];
        }

        return identities;
    }

    /**
     * @dev Updates the trust level of an identity
     * @param phoneHash The hashed phone number
     * @param newLevel The new trust level
     */
    function updateTrustLevel(bytes32 phoneHash, uint32 newLevel) external onlyTrustManager {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();

        _identities[identityId].trustLevel = newLevel;
        emit TrustLevelUpdated(phoneHash, newLevel, block.timestamp);
    }

    /**
     * @dev Optimized batch update for trust levels (Gas Saving)
     * @param phoneHashes Array of hashed phone numbers
     * @param newLevels Array of corresponding new trust levels
     */
    function batchUpdateTrustLevels(bytes32[] calldata phoneHashes, uint32[] calldata newLevels) external onlyTrustManager {
        if (phoneHashes.length != newLevels.length) revert EmptyInput();
        
        for (uint256 i = 0; i < phoneHashes.length; i++) {
            bytes32 phoneHash = phoneHashes[i];
            uint256 identityId = _phoneHashToIdentityId[phoneHash];
            if (identityId != 0) {
                _identities[identityId].trustLevel = newLevels[i];
                emit TrustLevelUpdated(phoneHash, newLevels[i], block.timestamp);
            }
        }
    }

    /**
     * @dev Adjusts the trust level of an identity by a delta
     * @param phoneHash The hashed phone number
     * @param delta The amount to change the trust level by
     */
    function adjustTrustLevel(bytes32 phoneHash, int32 delta) external onlyTrustManager {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();

        uint32 current = _identities[identityId].trustLevel;
        if (delta > 0) {
            _identities[identityId].trustLevel = current + uint32(uint32(delta));
        } else {
            uint32 decrease = uint32(uint32(-delta));
            if (current > decrease) {
                _identities[identityId].trustLevel = current - decrease;
            } else {
                _identities[identityId].trustLevel = 0;
            }
        }
        emit TrustLevelUpdated(phoneHash, _identities[identityId].trustLevel, block.timestamp);
    }

    /**
     * @dev Freezes or unfreezes an identity
     * @param phoneHash The hashed phone number
     * @param freeze Whether to freeze or unfreeze
     */
    function setIdentityFreeze(bytes32 phoneHash, bool freeze) external onlyOwner {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();

        _identities[identityId].isFrozen = freeze;
        emit IdentityFrozen(phoneHash, freeze, block.timestamp);
    }

    /**
     * @dev Submits an appeal for a frozen identity
     * @param phoneHash The hashed phone number
     * @param reason The reason for the appeal
     */
    function submitAppeal(bytes32 phoneHash, string calldata reason) external {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();
        if (_identities[identityId].owner != msg.sender) revert NotIdentityOwner();
        if (!_identities[identityId].isFrozen) revert NotAuthorized();

        emit AppealSubmitted(phoneHash, reason, block.timestamp);
    }

    /**
     * @dev Reports fraud for an identity
     * @param phoneHash The hashed phone number
     * @param reason The reason for reporting fraud
     */
    function reportFraud(bytes32 phoneHash, string calldata reason) external {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();

        _identities[identityId].isFlagged = true;
        // Logic to decrease level
        if (_identities[identityId].trustLevel >= 50) {
            _identities[identityId].trustLevel -= 50;
        } else {
            _identities[identityId].trustLevel = 0;
        }

        // Auto-freeze if trust level drops too low
        if (_identities[identityId].trustLevel < 20) {
            _identities[identityId].isFrozen = true;
            emit IdentityFrozen(phoneHash, true, block.timestamp);
        }

        emit FraudReported(identityId, reason, block.timestamp);
    }

    /**
     * @dev Applies an identity bond based on a signed PCI-Certificate
     * @param phoneHash The hashed phone number
     * @param requestedBond The bond amount suggested by the certificate
     * @param countryCode The ISO country code (hashed)
     * @param signature The backend signature on (phoneHash, requestedBond, countryCode)
     */
    function applyIdentityBond(
        bytes32 phoneHash,
        uint256 requestedBond,
        bytes32 countryCode,
        bytes calldata signature
    ) external {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();
        if (_identities[identityId].owner != msg.sender) revert NotIdentityOwner();

        // Verify PCI-Certificate signature
        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encodePacked(phoneHash, requestedBond, countryCode))
        );
        if (ECDSA.recover(messageHash, signature) != _signer) revert InvalidCertificate();

        // Transfer DAI bond
        if (requestedBond > 0) {
            daiToken.transferFrom(msg.sender, address(this), requestedBond);
            _identities[identityId].identityBond += requestedBond;
        }

        // Boost trust level based on successful bonding
        _identities[identityId].trustLevel += 20;

        emit TrustLevelUpdated(phoneHash, _identities[identityId].trustLevel, block.timestamp);
    }

    /**
     * @dev Joins the resolver pool for marketplace disputes
     * @param phoneHash The hashed phone number
     * @param stakeAmount Additional DAI to stake for resolver eligibility
     */
    function joinResolverPool(bytes32 phoneHash, uint256 stakeAmount) external {
        uint256 identityId = _phoneHashToIdentityId[phoneHash];
        if (identityId == 0) revert IdentityNotFound();
        if (_identities[identityId].owner != msg.sender) revert NotIdentityOwner();
        if (_identities[identityId].isResolver) revert AlreadyResolver();
        
        // Minimum trust requirement (e.g., 150)
        if (_identities[identityId].trustLevel < 150) revert NotAuthorized();

        if (stakeAmount > 0) {
            daiToken.transferFrom(msg.sender, address(this), stakeAmount);
            _identities[identityId].identityBond += stakeAmount;
        }

        _identities[identityId].isResolver = true;
    }

    /**
     * @dev Gets identity count
     */
    function getIdentityCount() external view returns (uint256) {
        return _identityIds;
    }

    // Guardian Management Functions

    /**
     * @dev Registers a guardian for an identity
     * @param identityHash The hash of the identity (phone hash)
     * @param guardianAddress The address of the guardian
     * @param publicKeyHash The hash of the guardian's public key
     */
    function registerGuardian(
        bytes32 identityHash,
        address guardianAddress,
        bytes32 publicKeyHash
    ) external {
        // Validate guardian limit (max 5 per identity)
        if (_guardianCount[identityHash] >= 5) revert MaxGuardiansReached();
        if (guardianAddress == address(0)) revert InvalidGuardianAddress();
        
        // Check if guardian is already registered
        GuardianRegistration storage existing = _guardianRegistrations[identityHash][guardianAddress];
        if (existing.registeredAt != 0) revert GuardianAlreadyRegistered();

        // Register guardian with pending status
        _guardianRegistrations[identityHash][guardianAddress] = GuardianRegistration({
            guardianAddress: guardianAddress,
            identityHash: identityHash,
            registeredAt: uint64(block.timestamp),
            status: GuardianStatus.PENDING,
            publicKeyHash: publicKeyHash
        });

        _identityGuardians[identityHash].push(guardianAddress);
        _guardianIndices[identityHash][guardianAddress] = _identityGuardians[identityHash].length - 1;
        _guardianCount[identityHash]++;

        emit GuardianRegistered(identityHash, guardianAddress, block.timestamp);
    }

    /**
     * @dev Updates guardian status
     * @param identityHash The hash of the identity
     * @param guardianAddress The address of the guardian
     * @param newStatus The new status for the guardian
     */
    function updateGuardianStatus(
        bytes32 identityHash,
        address guardianAddress,
        GuardianStatus newStatus
    ) external {
        GuardianRegistration storage registration = _guardianRegistrations[identityHash][guardianAddress];
        if (registration.registeredAt == 0) revert GuardianNotFound();
        
        // Only identity owner or guardian themselves can update status
        if (msg.sender != registration.guardianAddress && !_isIdentityOwner(identityHash, msg.sender)) {
            revert NotAuthorized();
        }

        registration.status = newStatus;
        emit GuardianStatusUpdated(identityHash, guardianAddress, newStatus, block.timestamp);
    }

    /**
     * @dev Removes a guardian from an identity
     * @param identityHash The hash of the identity
     * @param guardianAddress The address of the guardian to remove
     */
    function removeGuardian(
        bytes32 identityHash,
        address guardianAddress
    ) external {
        GuardianRegistration storage registration = _guardianRegistrations[identityHash][guardianAddress];
        if (registration.registeredAt == 0) revert GuardianNotFound();
        
        // Only identity owner can remove guardians
        if (!_isIdentityOwner(identityHash, msg.sender)) revert NotIdentityOwner();

        delete _guardianRegistrations[identityHash][guardianAddress];
        
        // Remove from guardians array using O(1) removal
        address[] storage guardians = _identityGuardians[identityHash];
        uint256 index = _guardianIndices[identityHash][guardianAddress];
        uint256 lastIndex = guardians.length - 1;
        
        if (index != lastIndex) {
            // Move the last element to the deleted position
            address lastGuardian = guardians[lastIndex];
            guardians[index] = lastGuardian;
            _guardianIndices[identityHash][lastGuardian] = index;
        }
        
        guardians.pop();
        delete _guardianIndices[identityHash][guardianAddress];
        _guardianCount[identityHash]--;

        emit GuardianRemoved(identityHash, guardianAddress, block.timestamp);
    }

    /**
     * @dev Gets all guardians for an identity
     * @param identityHash The hash of the identity
     */
    function getGuardians(bytes32 identityHash) external view returns (GuardianRegistration[] memory) {
        address[] storage guardianAddresses = _identityGuardians[identityHash];
        GuardianRegistration[] memory guardians = new GuardianRegistration[](guardianAddresses.length);
        
        for (uint256 i = 0; i < guardianAddresses.length; i++) {
            guardians[i] = _guardianRegistrations[identityHash][guardianAddresses[i]];
        }
        
        return guardians;
    }

    /**
     * @dev Gets guardian registration details
     * @param identityHash The hash of the identity
     * @param guardianAddress The address of the guardian
     */
    function getGuardianRegistration(
        bytes32 identityHash,
        address guardianAddress
    ) external view returns (GuardianRegistration memory) {
        GuardianRegistration storage registration = _guardianRegistrations[identityHash][guardianAddress];
        if (registration.registeredAt == 0) revert GuardianNotFound();
        return registration;
    }

    /**
     * @dev Checks if a guardian is registered and active
     * @param identityHash The hash of the identity
     * @param guardianAddress The address of the guardian
     */
    function isGuardianActive(bytes32 identityHash, address guardianAddress) external view returns (bool) {
        GuardianRegistration storage registration = _guardianRegistrations[identityHash][guardianAddress];
        return registration.registeredAt != 0 && registration.status == GuardianStatus.ACTIVE;
    }

    /**
     * @dev Gets guardian count for an identity
     * @param identityHash The hash of the identity
     */
    function getGuardianCount(bytes32 identityHash) external view returns (uint256) {
        return _guardianCount[identityHash];
    }
    
    /**
     * @dev Checks if an address is the owner of an identity (public version for GuardianRegistry)
     * @param identityHash The hash of the identity
     * @param addr The address to check
     */
    function isIdentityOwner(bytes32 identityHash, address addr) external view returns (bool) {
        return _identityOwners[identityHash] == addr;
    }

    // Recovery Functions

    /**
     * @dev Initiates a recovery session for an identity
     * @param identityHash The hash of the identity to recover
     * @param newOwner The proposed new owner address
     */
    function createRecoverySession(bytes32 identityHash, address newOwner) external {
        if (newOwner == address(0)) revert InvalidNewOwner();
        if (_recoverySessions[identityHash].createdAt != 0 && !_recoverySessions[identityHash].executed) {
            revert RecoveryInProgress();
        }

        _recoverySessions[identityHash] = RecoverySession({
            identityHash: identityHash,
            newOwner: newOwner,
            approvals: 0,
            createdAt: uint64(block.timestamp),
            executed: false
        });

        emit RecoveryInitiated(identityHash, newOwner, block.timestamp);
    }

    /**
     * @dev Approves a recovery session (guardian only)
     * @param identityHash The hash of the identity
     */
    function approveRecovery(bytes32 identityHash) external {
        RecoverySession storage session = _recoverySessions[identityHash];
        if (session.createdAt == 0) revert RecoveryNotFound();
        if (session.executed) revert RecoveryCompleted();
        
        // Check if caller is an active guardian
        if (!this.isGuardianActive(identityHash, msg.sender)) revert NotGuardian();
        if (_guardianApprovals[identityHash][msg.sender]) revert AlreadyApproved();

        _guardianApprovals[identityHash][msg.sender] = true;
        session.approvals++;

        emit RecoveryApproved(identityHash, msg.sender, block.timestamp);

        // Auto-execute if threshold reached (e.g., 3/5 or majority)
        uint256 total = _guardianCount[identityHash];
        uint256 threshold = (total / 2) + 1;
        if (session.approvals >= threshold) {
            _executeRecovery(identityHash);
        }
    }

    /**
     * @dev Executes the recovery session (manual fallback)
     * @param identityHash The hash of the identity
     */
    function executeRecovery(bytes32 identityHash) external {
        RecoverySession storage session = _recoverySessions[identityHash];
        if (session.createdAt == 0) revert RecoveryNotFound();
        if (session.executed) revert RecoveryCompleted();
        
        uint256 total = _guardianCount[identityHash];
        uint256 threshold = (total / 2) + 1;
        if (session.approvals < threshold) revert InsufficientApprovals();

        _executeRecovery(identityHash);
    }

    function _executeRecovery(bytes32 identityHash) internal {
        RecoverySession storage session = _recoverySessions[identityHash];
        session.executed = true;
        
        address oldOwner = _identityOwners[identityHash];
        
        // Update identity owner in secondary mapping
        _identityOwners[identityHash] = session.newOwner;
        
        // Update identity owner in primary struct
        uint256 identityId = _phoneHashToIdentityId[identityHash];
        if (identityId != 0) {
            _identities[identityId].owner = session.newOwner;
        }

        // Update address to phone hash mapping
        if (oldOwner != address(0)) {
            delete _addressToPhoneHash[oldOwner];
        }
        _addressToPhoneHash[session.newOwner] = identityHash;
        
        emit RecoveryExecuted(identityHash, session.newOwner, block.timestamp);
    }

    /**
     * @dev Gets recovery session details
     */
    function getRecoverySession(bytes32 identityHash) external view returns (RecoverySession memory) {
        return _recoverySessions[identityHash];
    }
    
    // Internal helper functions

    function _isIdentityOwner(bytes32 identityHash, address addr) internal view returns (bool) {
        return _identityOwners[identityHash] == addr;
    }
}
