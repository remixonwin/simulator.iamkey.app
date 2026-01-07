// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title TestDaiToken
 * @dev A mintable ERC20 token for testing purposes on Sepolia testnet
 * Mimics DAI functionality with mint capability for testing escrow funding
 */
contract MockDAI is ERC20, ERC20Permit {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "TestDai: caller is not owner");
        _;
    }

    constructor() ERC20("Test DAI", "DAI") ERC20Permit("Test DAI") {
        owner = msg.sender;
    }

    /**
     * @dev Mint new tokens to a specified address
     * @param to The address to receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens from a specified address
     * @param from The address to burn tokens from
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /**
     * @dev Transfer ownership of the contract
     * @param newOwner The new owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "TestDai: new owner is zero address");
        owner = newOwner;
    }
}
