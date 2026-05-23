// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Interface del token $Ronke (0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb).
///         ERC-20 standard, 18 decimals, supply 1B (fully minted).
interface IRonkeToken is IERC20 {}
