// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {NababaToken} from "./NababaToken.sol";

/// @title FarmCore — Ronkeverse Banana Plantations (pool emission model)
/// @notice Global pool emits NABABA/sec, divided among all active workers worldwide.
///         User output = (their active workers / total active workers) × pool × (1 + boosts).
///         Boosts: NFT linear (+4% per NFT, cap 10), $Ronke staked (linear with cap), restake mode (+20%).
///         Workers need feed every 6h or they stop counting (stamina expired).
/// @dev MasterChef-style accumulator + lazy stamina expiration (anyone can call expireStamina).
contract FarmCore is Ownable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 private constant ACC_PRECISION = 1e12;
    uint256 private constant BPS = 10_000;

    // ─────────────────────────────────────────────────────────────────────
    //                              EXTERNAL REFS
    // ─────────────────────────────────────────────────────────────────────

    NababaToken public immutable nababa;
    IERC721 public immutable ronkeverseNFT;
    IERC20 public immutable ronkeToken;
    address public treasury;

    // ─────────────────────────────────────────────────────────────────────
    //                              POOL ACCOUNTING
    // ─────────────────────────────────────────────────────────────────────

    uint256 public poolEmissionPerSec;     // NABABA/sec (settable)
    uint256 public accNababaPerWorker;     // accumulator, scaled by ACC_PRECISION
    uint256 public totalActiveWorkers;     // sum of workers across plantations with stamina alive
    uint64  public lastUpdateTime;

    // ─────────────────────────────────────────────────────────────────────
    //                              PARAMETERS
    // ─────────────────────────────────────────────────────────────────────

    struct PlantationTier {
        uint128 ronkeCost;       // $Ronke to buy
        uint16  maxWorkers;      // cap per plantation
        uint16  requiredNFTs;    // 0 = none
        bool    enabled;
    }
    PlantationTier[] public tiers;

    uint128 public workerHireCostRonke;
    uint64  public workerStaminaSeconds;
    uint128 public feedCostPerWorker;     // in NABABA, paid on feed

    // NFT boost: linear bps per NFT, capped
    uint16 public nftBoostPerNftBps;      // ej 400 = +4%
    uint16 public nftBoostMaxNfts;        // ej 10 → cap +40%

    // Token boost: linear bps per N tokens, capped
    uint64 public tokenBoostPer1kBps;     // ej 100 = +1% per 1000 staked
    uint16 public tokenBoostMaxBps;       // ej 3000 = +30% cap

    // Restake
    uint16 public restakeFeeBps;          // 200 = 2%
    uint16 public restakeAprBoostBps;     // 2000 = +20%

    // Jeet jail
    uint64[] public jailThresholds;
    uint16[] public jailPenaltyBps;

    uint64 public seasonStartedAt;
    uint64 public seasonDurationSeconds;
    uint64 public seasonNumber;

    // ─────────────────────────────────────────────────────────────────────
    //                              USER STATE
    // ─────────────────────────────────────────────────────────────────────

    struct Plantation {
        uint8   tierId;
        uint64  createdAt;
        uint64  lastSettleAt;
        uint64  workers;
        uint64  staminaUntil;
        uint128 accruedNababa;   // settled pending
        uint128 rewardDebt;      // accNababaPerWorker snapshot at last settle
        bool    restakeMode;
        bool    countedActive;   // tracked-state: is currently counted in totalActiveWorkers
    }

    mapping(address => Plantation[]) private _plantations;
    mapping(address => uint256[]) public stakedNFTsOf;
    mapping(uint256 => address) public nftStakerOf;
    mapping(address => uint256) public ronkeStakedOf;

    uint256 public restakerPool;  // accumulated penalties + fees (for future v1.1 distribution)

    // ─────────────────────────────────────────────────────────────────────
    //                                EVENTS
    // ─────────────────────────────────────────────────────────────────────

    event PlantationBought(address indexed user, uint256 plantId, uint8 tierId);
    event WorkersHired(address indexed user, uint256 plantId, uint64 added, uint64 total);
    event WorkersFed(address indexed user, uint256 plantId, uint64 newStaminaUntil);
    event NFTStaked(address indexed user, uint256 indexed tokenId);
    event NFTUnstaked(address indexed user, uint256 indexed tokenId);
    event RonkeStaked(address indexed user, uint256 amount);
    event RonkeUnstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 plantId, uint256 gross, uint256 penalty, uint256 net);
    event Restaked(address indexed user, uint256 plantId, uint256 boostedAdded);
    event StaminaExpired(address indexed user, uint256 plantId, uint64 workersRemoved);
    event PoolEmissionUpdated(uint256 newRate);
    event SeasonStarted(uint64 number, uint64 startedAt);

    // ─────────────────────────────────────────────────────────────────────
    //                                ERRORS
    // ─────────────────────────────────────────────────────────────────────

    error TierNotFound();
    error TierDisabled();
    error NFTRequirementNotMet();
    error NotPlantationOwner();
    error MaxWorkersExceeded();
    error NotNFTStaker();
    error ZeroAmount();
    error InsufficientStake();
    error StaminaStillActive();

    // ─────────────────────────────────────────────────────────────────────
    //                              CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────

    constructor(
        address initialOwner,
        NababaToken _nababa,
        IERC721 _ronkeverseNFT,
        IERC20 _ronkeToken,
        address _treasury
    ) Ownable(initialOwner) {
        nababa = _nababa;
        ronkeverseNFT = _ronkeverseNFT;
        ronkeToken = _ronkeToken;
        treasury = _treasury;
        lastUpdateTime = uint64(block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              ADMIN
    // ─────────────────────────────────────────────────────────────────────

    function addTier(PlantationTier calldata t) external onlyOwner {
        tiers.push(t);
    }

    function updateTier(uint8 id, PlantationTier calldata t) external onlyOwner {
        if (id >= tiers.length) revert TierNotFound();
        tiers[id] = t;
    }

    function setPoolEmission(uint256 ratePerSec) external onlyOwner {
        _updatePool();
        poolEmissionPerSec = ratePerSec;
        emit PoolEmissionUpdated(ratePerSec);
    }

    function setWorkerParams(
        uint128 _hireCost,
        uint64 _staminaSeconds,
        uint128 _feedCost
    ) external onlyOwner {
        workerHireCostRonke = _hireCost;
        workerStaminaSeconds = _staminaSeconds;
        feedCostPerWorker = _feedCost;
    }

    function setNFTBoost(uint16 _perNftBps, uint16 _maxNfts) external onlyOwner {
        nftBoostPerNftBps = _perNftBps;
        nftBoostMaxNfts = _maxNfts;
    }

    function setTokenBoost(uint64 _per1kBps, uint16 _maxBps) external onlyOwner {
        tokenBoostPer1kBps = _per1kBps;
        tokenBoostMaxBps = _maxBps;
    }

    function setRestakeParams(uint16 _feeBps, uint16 _aprBoostBps) external onlyOwner {
        restakeFeeBps = _feeBps;
        restakeAprBoostBps = _aprBoostBps;
    }

    function setJailCurve(uint64[] calldata thresholds, uint16[] calldata penalties) external onlyOwner {
        require(thresholds.length == penalties.length, "len");
        jailThresholds = thresholds;
        jailPenaltyBps = penalties;
    }

    function setSeasonDuration(uint64 d) external onlyOwner {
        seasonDurationSeconds = d;
    }

    function setTreasury(address t) external onlyOwner {
        treasury = t;
    }

    function startNewSeason() external onlyOwner {
        seasonNumber++;
        seasonStartedAt = uint64(block.timestamp);
        emit SeasonStarted(seasonNumber, seasonStartedAt);
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              POOL UPDATE
    // ─────────────────────────────────────────────────────────────────────

    function _updatePool() internal {
        uint64 now64 = uint64(block.timestamp);
        if (now64 <= lastUpdateTime) return;
        if (totalActiveWorkers == 0 || poolEmissionPerSec == 0) {
            lastUpdateTime = now64;
            return;
        }
        uint256 elapsed = now64 - lastUpdateTime;
        accNababaPerWorker += (elapsed * poolEmissionPerSec * ACC_PRECISION) / totalActiveWorkers;
        lastUpdateTime = now64;
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              PLANTATION
    // ─────────────────────────────────────────────────────────────────────

    function buyPlantation(uint8 tierId) external nonReentrant returns (uint256 plantId) {
        if (tierId >= tiers.length) revert TierNotFound();
        PlantationTier memory t = tiers[tierId];
        if (!t.enabled) revert TierDisabled();
        if (t.requiredNFTs > 0 && stakedNFTsOf[msg.sender].length < t.requiredNFTs) {
            revert NFTRequirementNotMet();
        }

        if (t.ronkeCost > 0) {
            ronkeToken.safeTransferFrom(msg.sender, treasury, t.ronkeCost);
        }

        _plantations[msg.sender].push(Plantation({
            tierId: tierId,
            createdAt: uint64(block.timestamp),
            lastSettleAt: uint64(block.timestamp),
            workers: 0,
            staminaUntil: 0,
            accruedNababa: 0,
            rewardDebt: 0,
            restakeMode: false,
            countedActive: false
        }));

        plantId = _plantations[msg.sender].length - 1;
        emit PlantationBought(msg.sender, plantId, tierId);
    }

    function hireWorkers(uint256 plantId, uint64 count) external nonReentrant {
        if (count == 0) revert ZeroAmount();
        Plantation storage p = _getPlantation(msg.sender, plantId);
        PlantationTier memory t = tiers[p.tierId];
        if (uint256(p.workers) + uint256(count) > uint256(t.maxWorkers)) revert MaxWorkersExceeded();

        _settle(msg.sender, plantId);

        ronkeToken.safeTransferFrom(msg.sender, treasury, uint256(workerHireCostRonke) * count);

        // Remove previous active workers from total (if any), then re-add with new state
        _removeFromActive(p);
        if (p.staminaUntil <= block.timestamp) {
            p.staminaUntil = uint64(block.timestamp + workerStaminaSeconds);
        }
        p.workers += count;
        _addToActive(p);

        emit WorkersHired(msg.sender, plantId, count, p.workers);
    }

    function feedWorkers(uint256 plantId) external nonReentrant {
        Plantation storage p = _getPlantation(msg.sender, plantId);
        if (p.workers == 0) revert ZeroAmount();

        _settle(msg.sender, plantId);

        uint256 cost = uint256(feedCostPerWorker) * p.workers;
        nababa.burnFrom(msg.sender, cost);

        _removeFromActive(p);
        uint64 base = p.staminaUntil > block.timestamp ? p.staminaUntil : uint64(block.timestamp);
        p.staminaUntil = base + workerStaminaSeconds;
        _addToActive(p);

        emit WorkersFed(msg.sender, plantId, p.staminaUntil);
    }

    /// @notice Lazy stamina expiration. Anyone can call. If stamina expired, removes workers from pool.
    function expireStamina(address user, uint256 plantId) external nonReentrant {
        Plantation storage p = _getPlantation(user, plantId);
        if (p.staminaUntil > block.timestamp) revert StaminaStillActive();
        if (!p.countedActive) return;

        _settle(user, plantId);
        uint64 removed = p.workers;
        totalActiveWorkers -= removed;
        p.countedActive = false;
        emit StaminaExpired(user, plantId, removed);
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              NFT STAKING
    // ─────────────────────────────────────────────────────────────────────

    function stakeNFTs(uint256[] calldata tokenIds) external nonReentrant {
        _settleAll(msg.sender);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            ronkeverseNFT.safeTransferFrom(msg.sender, address(this), tokenIds[i]);
            nftStakerOf[tokenIds[i]] = msg.sender;
            stakedNFTsOf[msg.sender].push(tokenIds[i]);
            emit NFTStaked(msg.sender, tokenIds[i]);
        }
    }

    function unstakeNFTs(uint256[] calldata tokenIds) external nonReentrant {
        _settleAll(msg.sender);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (nftStakerOf[tokenIds[i]] != msg.sender) revert NotNFTStaker();
            nftStakerOf[tokenIds[i]] = address(0);
            _removeFromArray(stakedNFTsOf[msg.sender], tokenIds[i]);
            ronkeverseNFT.safeTransferFrom(address(this), msg.sender, tokenIds[i]);
            emit NFTUnstaked(msg.sender, tokenIds[i]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              $RONKE STAKING
    // ─────────────────────────────────────────────────────────────────────

    function stakeRonke(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _settleAll(msg.sender);
        ronkeToken.safeTransferFrom(msg.sender, address(this), amount);
        ronkeStakedOf[msg.sender] += amount;
        emit RonkeStaked(msg.sender, amount);
    }

    function unstakeRonke(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (ronkeStakedOf[msg.sender] < amount) revert InsufficientStake();
        _settleAll(msg.sender);
        ronkeStakedOf[msg.sender] -= amount;
        ronkeToken.safeTransfer(msg.sender, amount);
        emit RonkeUnstaked(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              CLAIM / RESTAKE
    // ─────────────────────────────────────────────────────────────────────

    function claim(uint256 plantId) external nonReentrant returns (uint256 net) {
        _settle(msg.sender, plantId);
        Plantation storage p = _plantations[msg.sender][plantId];
        uint256 gross = p.accruedNababa;
        if (gross == 0) return 0;
        p.accruedNababa = 0;

        uint256 penalty = 0;
        if (!p.restakeMode) {
            penalty = (gross * _jailPenaltyFor(block.timestamp - p.createdAt)) / BPS;
            if (penalty > 0) {
                nababa.mint(address(this), penalty);
                restakerPool += penalty;
            }
        }
        net = gross - penalty;
        if (net > 0) nababa.mint(msg.sender, net);
        emit Claimed(msg.sender, plantId, gross, penalty, net);
    }

    function restake(uint256 plantId) external nonReentrant returns (uint256 boostedAdded) {
        _settle(msg.sender, plantId);
        Plantation storage p = _plantations[msg.sender][plantId];
        uint256 gross = p.accruedNababa;
        if (gross == 0) return 0;
        p.accruedNababa = 0;

        uint256 fee = (gross * restakeFeeBps) / BPS;
        if (fee > 0) {
            nababa.mint(address(this), fee);
            restakerPool += fee;
        }
        p.restakeMode = true;
        uint256 reinvested = gross - fee;
        boostedAdded = reinvested + (reinvested * restakeAprBoostBps) / BPS;
        p.accruedNababa = uint128(boostedAdded);
        emit Restaked(msg.sender, plantId, boostedAdded);
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              VIEWS
    // ─────────────────────────────────────────────────────────────────────

    function plantationsOf(address user) external view returns (Plantation[] memory) {
        return _plantations[user];
    }

    function plantationCount(address user) external view returns (uint256) {
        return _plantations[user].length;
    }

    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    function userBoostBps(address user) public view returns (uint256) {
        return _userBoostBps(user);
    }

    function pendingRewards(address user, uint256 plantId) external view returns (uint256) {
        Plantation memory p = _plantations[user][plantId];
        if (p.workers == 0) return p.accruedNababa;

        uint256 acc = accNababaPerWorker;
        if (block.timestamp > lastUpdateTime && totalActiveWorkers > 0 && poolEmissionPerSec > 0) {
            uint256 elapsed = block.timestamp - lastUpdateTime;
            acc += (elapsed * poolEmissionPerSec * ACC_PRECISION) / totalActiveWorkers;
        }

        uint256 newAcc = acc;
        uint256 totalPeriod = block.timestamp > p.lastSettleAt ? block.timestamp - p.lastSettleAt : 0;
        uint256 effectiveEnd = p.staminaUntil < block.timestamp ? p.staminaUntil : block.timestamp;
        uint256 activePeriod = effectiveEnd > p.lastSettleAt ? effectiveEnd - p.lastSettleAt : 0;

        uint256 gross = 0;
        if (activePeriod > 0 && totalPeriod > 0 && p.countedActive) {
            gross = (uint256(p.workers) * (newAcc - p.rewardDebt)) / ACC_PRECISION;
            gross = (gross * activePeriod) / totalPeriod;

            uint256 boost = _userBoostBps(user);
            if (p.restakeMode) boost += restakeAprBoostBps;
            gross += (gross * boost) / BPS;
        }
        return p.accruedNababa + gross;
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              INTERNAL
    // ─────────────────────────────────────────────────────────────────────

    function _getPlantation(address user, uint256 plantId) internal view returns (Plantation storage) {
        if (plantId >= _plantations[user].length) revert NotPlantationOwner();
        return _plantations[user][plantId];
    }

    function _settleAll(address user) internal {
        uint256 n = _plantations[user].length;
        for (uint256 i = 0; i < n; i++) {
            _settle(user, i);
        }
    }

    function _settle(address user, uint256 plantId) internal {
        _updatePool();
        Plantation storage p = _plantations[user][plantId];

        if (p.workers > 0 && p.countedActive) {
            uint64 now64 = uint64(block.timestamp);
            uint64 effectiveEnd = p.staminaUntil < now64 ? p.staminaUntil : now64;
            uint256 totalPeriod = now64 > p.lastSettleAt ? now64 - p.lastSettleAt : 0;
            uint256 activePeriod = effectiveEnd > p.lastSettleAt ? effectiveEnd - p.lastSettleAt : 0;

            if (activePeriod > 0 && totalPeriod > 0) {
                uint256 gross = (uint256(p.workers) * (accNababaPerWorker - p.rewardDebt)) / ACC_PRECISION;
                gross = (gross * activePeriod) / totalPeriod;

                uint256 boost = _userBoostBps(user);
                if (p.restakeMode) boost += restakeAprBoostBps;
                gross += (gross * boost) / BPS;
                p.accruedNababa += uint128(gross);
            }
        }

        p.rewardDebt = uint128(accNababaPerWorker);
        p.lastSettleAt = uint64(block.timestamp);
    }

    /// @dev Remove plantation's contribution to totalActiveWorkers (if any).
    function _removeFromActive(Plantation storage p) internal {
        if (p.countedActive) {
            totalActiveWorkers -= p.workers;
            p.countedActive = false;
        }
    }

    /// @dev Add plantation to totalActiveWorkers if it should be active now.
    function _addToActive(Plantation storage p) internal {
        if (!p.countedActive && p.workers > 0 && p.staminaUntil > block.timestamp) {
            totalActiveWorkers += p.workers;
            p.countedActive = true;
        }
    }

    function _userBoostBps(address user) internal view returns (uint256) {
        uint256 nftCount = stakedNFTsOf[user].length;
        if (nftCount > nftBoostMaxNfts) nftCount = nftBoostMaxNfts;
        uint256 nftBoost = nftCount * nftBoostPerNftBps;

        uint256 tokenUnits = ronkeStakedOf[user] / 1000 ether;
        uint256 tokenBoost = tokenUnits * tokenBoostPer1kBps;
        if (tokenBoost > tokenBoostMaxBps) tokenBoost = tokenBoostMaxBps;

        return nftBoost + tokenBoost;
    }

    function _jailPenaltyFor(uint256 ageSeconds) internal view returns (uint256) {
        for (uint256 i = 0; i < jailThresholds.length; i++) {
            if (ageSeconds < jailThresholds[i]) return jailPenaltyBps[i];
        }
        return 0;
    }

    function _removeFromArray(uint256[] storage arr, uint256 value) internal {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == value) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                return;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //                              ERC721 RECEIVER
    // ─────────────────────────────────────────────────────────────────────

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
