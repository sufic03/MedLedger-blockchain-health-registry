# MedLedger

### Decentralized Medical Records & Blockchain Security

MedLedger is a blockchain-based medical records platform designed to provide secure medical record management, patient consent control, on-chain verification, and a tamper-evident audit trail.

The system combines a traditional application backend with Ethereum-compatible smart contracts running on a local Ganache blockchain.

---

## Features

- Patient registration with unique Health UID
- Doctor/clinical provider registration
- Doctor and patient directory
- Patient consent and access management
- MEDC-based access mechanism
- Secure medical record creation
- Blockchain-backed medical record verification
- On-chain record integrity verification
- Tamper detection
- Immutable audit trail
- Transaction and blockchain status monitoring
- Doctor MEDC balance tracking
- Audit and compliance activity logging

---

## Tech Stack

### Frontend

- HTML
- CSS
- JavaScript

### Backend

- Node.js
- Express.js
- SQLite

### Blockchain

- Solidity
- Hardhat
- Ganache
- ethers.js
- Ethereum-compatible local blockchain

### Smart Contracts

- `MedicalLedger.sol`
- `MedCredit.sol`

---

## Architecture

```text
                    ┌─────────────────────┐
                    │     MedLedger UI    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Node / Express   │
                    │       Server        │
                    └───────┬─────┬───────┘
                            │     │
                 ┌──────────┘     └──────────┐
                 ▼                           ▼
        ┌─────────────────┐        ┌─────────────────────┐
        │ SQLite Database │        │ Ethereum Blockchain │
        │                 │        │      Ganache        │
        └─────────────────┘        └──────────┬──────────┘
                                               │
                                               ▼
                                  ┌────────────────────────┐
                                  │    Smart Contracts     │
                                  │                        │
                                  │ MedicalLedger.sol      │
                                  │ MedCredit.sol          │
                                  └────────────────────────┘
```

---

## Project Structure

```text
medical-records-system/
│
├── contracts/
│   ├── MedCredit.sol
│   └── MedicalLedger.sol
│
├── public/
│   ├── index.html
│   └── style.css
│
├── scripts/
│   └── deploy.js
│
├── .gitignore
├── deployed-contract.json
├── hardhat.config.js
├── package.json
├── package-lock.json
└── server.js
```

---

## Getting Started

### Prerequisites

- Node.js
- npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/jxzib/MedLedger-blockchain-health-registry.git
cd MedLedger-blockchain-health-registry
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start Ganache

In a terminal:

```bash
npm run ganache
```

Ganache runs on:

```text
RPC: http://127.0.0.1:8545
Chain ID: 1337
```

Keep this terminal running.

### 4. Deploy the smart contracts

Open another terminal:

```bash
npm run deploy
```

### 5. Start MedLedger

Open another terminal:

```bash
npm start
```

Then open the application at:

```text
http://localhost:3000
```

---

## Available Commands

| Command | Description |
|---|---|
| `npm install` | Install dependencies |
| `npm run ganache` | Start local blockchain |
| `npm run compile` | Compile smart contracts |
| `npm run deploy` | Compile and deploy contracts |
| `npm start` | Start the MedLedger application |

---

## Application Workflow

```text
Identity & Directory
        ↓
Doctor Portal
        ↓
Consent / Access
        ↓
Medical Record
        ↓
Blockchain Transaction
        ↓
Patient Verification
        ↓
Audit Trail
```

---

## Security Notes

This repository excludes local and generated files such as:

```text
node_modules/
artifacts/
cache/
database.sqlite
.env
```

Never commit private keys, API keys, passwords, or other credentials.

The current Ganache configuration is intended for local development and demonstration.

---

## Disclaimer

MedLedger is a prototype developed for educational, research, and demonstration purposes.

It should not be used with real patient medical information without appropriate security, privacy, regulatory, and compliance controls.
