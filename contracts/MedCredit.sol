// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MedCredit {
    string public name = "Medical Access Credit";
    string public symbol = "MEDC";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor() {
        // Mint initial reserve of 1,000,000 MEDC to deployer
        _mint(msg.sender, 1000000 * 10**uint256(decimals));
    }
    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient MEDC balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    // Demo faucet: airdrops 100 MEDC to any address
    function faucet(address recipient) public {
        _mint(recipient, 100 * 10**uint256(decimals));
    }
    // Burn / spend credits for accessing records
    function burn(address from, uint256 amount) public {
        require(balanceOf[from] >= amount, "Insufficient MEDC to burn");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}