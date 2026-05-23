// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Interface mínima del Ronkeverse NFT (0x810b6d1374ac7ba0e83612e7d49f49a13f1de019).
///         ERC-721 standard. Supply 6969.
interface IRonkeverseNFT is IERC721 {
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
