// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MedicalLedger {
    struct RecordEntry {
        string patientUID;
        address doctorWallet;
        bytes32 recordHash;
        uint256 timestamp;
    }

    mapping(string => RecordEntry[]) private records;

    event RecordAdded(
        string indexed patientUID,
        address indexed doctorWallet,
        bytes32 recordHash,
        uint256 timestamp
    );

    function addRecord(
        string memory patientUID,
        address doctorWallet,
        bytes32 recordHash
    ) public {
        records[patientUID].push(RecordEntry({
            patientUID: patientUID,
            doctorWallet: doctorWallet,
            recordHash: recordHash,
            timestamp: block.timestamp
        }));

        emit RecordAdded(patientUID, doctorWallet, recordHash, block.timestamp);
    }

    function getRecords(string memory patientUID) public view returns (RecordEntry[] memory) {
        return records[patientUID];
    }
}