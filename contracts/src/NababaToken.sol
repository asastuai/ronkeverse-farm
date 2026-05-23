// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title NababaToken — reward token del farm Ronkeverse
/// @notice $NABABA es el fruto sagrado del Ronkeverse (banana en idioma Monke).
///         ERC-20 capped a 100M, mintable solo por minters autorizados (FarmCore).
///         Burnable para sinks (restake fee, upgrades, early unlock penalty).
contract NababaToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 100_000_000 ether;

    mapping(address => bool) public isMinter;

    event MinterSet(address indexed account, bool enabled);

    error NotMinter();
    error CapExceeded();

    modifier onlyMinter() {
        if (!isMinter[msg.sender]) revert NotMinter();
        _;
    }

    constructor(address initialOwner) ERC20("Nababa", "NABABA") Ownable(initialOwner) {}

    function setMinter(address account, bool enabled) external onlyOwner {
        isMinter[account] = enabled;
        emit MinterSet(account, enabled);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        if (totalSupply() + amount > MAX_SUPPLY) revert CapExceeded();
        _mint(to, amount);
    }
}
