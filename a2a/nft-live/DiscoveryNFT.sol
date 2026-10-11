// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal owned ERC721; only the collection owner can create tokens.
/// @dev No public paid mint, no upgrade hooks, no royalties, no external spending.
contract DiscoveryNFT is ERC721URIStorage, Ownable {
    uint256 public nextTokenId = 1;
    constructor(string memory name_, string memory symbol_, address owner_)
        ERC721(name_, symbol_) Ownable(owner_) {}

    function mintTo(address recipient, string calldata uri)
        external onlyOwner returns (uint256 tokenId)
    {
        tokenId = nextTokenId++;
        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, uri);
    }
}
