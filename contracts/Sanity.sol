// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Sanity
/// @notice Minimal contract used only to smoke-test the Hardhat + TypeScript
///         mocha/chai test pipeline. Not part of the product surface.
contract Sanity {
    /// @notice Returns a fixed constant so tests can assert the pipeline works.
    function answer() external pure returns (uint256) {
        return 42;
    }
}
