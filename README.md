# Anchor Escrow

A Solana escrow program built with Anchor.

This project demonstrates a secure token-for-token escrow workflow using Program Derived Addresses (PDAs), Associated Token Accounts (ATAs), and SPL Token transfers.

Repository: [anchor-escrow](https://github.com/ShabihEthSec/anchor-escrow?utm_source=chatgpt.com)

---

## Overview

The escrow flow enables two parties to exchange SPL tokens trustlessly.

### Actors

- **Initializer** — creates the escrow offer
- **Taker** — accepts the escrow trade

### Flow

1. Initializer deposits Token A into a vault PDA
2. Escrow state account stores trade terms
3. Taker sends Token B to initializer
4. Vault releases Token A to taker
5. Escrow account and vault are closed

This design removes counterparty risk and ensures atomic settlement.

---

## Architecture

### Program Components

| Component         | Description             |
| ----------------- | ----------------------- |
| Escrow PDA        | Stores escrow state     |
| Vault ATA         | Holds deposited tokens  |
| Initializer       | Creates escrow          |
| Taker             | Accepts escrow          |
| SPL Token Program | Handles token transfers |

### Instructions

#### Initialize

Creates:

- Escrow state PDA
- Vault ATA

Transfers initializer's Token A into vault.

#### Exchange

- Transfers Token B from taker → initializer
- Transfers Token A from vault → taker
- Closes escrow accounts

#### Cancel

Allows initializer to:

- reclaim Token A
- close vault
- close escrow state

---

## Tech Stack

- Rust
- Anchor
- Solana
- SPL Token Program
- TypeScript tests

---

## Project Structure

```txt
.
├── programs/
│   └── anchor-escrow/
│       └── src/
│           └── lib.rs
├── tests/
│   └── anchor-escrow.ts
├── migrations/
├── Anchor.toml
├── Cargo.toml
├── package.json
└── tsconfig.json
```

---

## PDA Design

### Escrow PDA

Derived using:

```rust
[b"state", seed]
```

### Vault ATA

Associated token account owned by escrow PDA.

This avoids unsafe authority transfers and follows modern Anchor escrow patterns. ([GitHub][1])

---

## Local Development

### Prerequisites

Install:

- Rust
- Solana CLI
- Anchor
- Node.js

### Verify Versions

```bash
solana --version
anchor --version
node -v
rustc --version
```

---

## Setup

Clone repository:

```bash
git clone https://github.com/ShabihEthSec/anchor-escrow.git
cd anchor-escrow
```

Install dependencies:

```bash
yarn install
```

---

## Configure Program ID

Generate program keys:

```bash
anchor keys list
```

Update:

### `Anchor.toml`

```toml
[programs.localnet]
anchor_escrow = "YOUR_PROGRAM_ID"
```

### `lib.rs`

```rust
declare_id!("YOUR_PROGRAM_ID");
```

---

## Build

```bash
anchor build
```

---

## Test

Run local validator tests:

```bash
anchor test
```

The tests:

- create test mints
- mint SPL tokens
- initialize escrow
- exchange tokens
- verify balances

The repository uses Anchor + SPL Token integration tests. ([GitHub][2])

---

## Deploy

Start validator:

```bash
solana-test-validator
```

Deploy:

```bash
anchor deploy
```

---

## Security Notes

### PDA Validation

All vault authorities are PDAs derived deterministically.

### ATA Usage

The vault uses an ATA owned by the PDA instead of transferring token authority manually.

### Account Constraints

Anchor account validation ensures:

- signer checks
- mint validation
- ownership verification
- PDA seed enforcement

### Escrow Closure

Accounts are closed after exchange/cancel to reclaim rent.

---

## Example Escrow Use Case

Alice wants:

- 100 Token B

In exchange for:

- 50 Token A

Steps:

1. Alice initializes escrow
2. 50 Token A moved into vault
3. Bob accepts escrow
4. Bob sends 100 Token B
5. Bob receives 50 Token A

Atomic and trustless.

---

## References

- [Anchor Framework](https://www.anchor-lang.com?utm_source=chatgpt.com)
- [Solana Docs](https://solana.com/docs?utm_source=chatgpt.com)
- [SPL Token Program](https://spl.solana.com/token?utm_source=chatgpt.com)

Implementation patterns inspired by established Anchor escrow examples. ([GitHub][1])

---

## Author

**Mohd Shabihul Hasan Khan**
GitHub: [ShabihEthSec](https://github.com/ShabihEthSec?utm_source=chatgpt.com)

Solana • Rust • Smart Contract Security • Anchor Development

## License

MIT
