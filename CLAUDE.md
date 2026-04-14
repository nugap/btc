# CLAUDE.md — nugap BTC Project Guide

## What is nugap?

A minimal air-gapped crypto wallet. Each blockchain gets its own repo under the `nugap` GitHub org, hosted via GitHub Pages at `nugap.github.io/<chain>/`.

## Philosophy

Airgap is great but too heavy. nugap strips it down to the absolute essentials: two HTML files, zero backend, zero dependencies beyond what's inlined.

## Architecture

- **yolo.html** — Online (hot) wallet: watch-only, construct unsigned transactions, scan signed QR from offline device, broadcast to network
- **hodl.html** — Offline (cold) signer: generate/import mnemonic, sign transactions, display signed transaction as QR code

Both are **single-file static HTML** with all JS dependencies inlined. Zero backend. Zero build step. Open in a browser and it works.

## Repo Structure

```
btc/
├── yolo.html    ← online/hot (watch & broadcast)
├── hodl.html    ← offline/cold (sign)
└── README.md
```

## Tech Stack

### Crypto Libraries (all @paulmillr's scure/noble ecosystem — zero dependency, audited, browser-native)
- `@scure/btc-signer` — transaction construction, PSBT (BIP-174), signing
- `@scure/bip32` — HD key derivation from xpub/zpub
- `@scure/bip39` — mnemonic generation & validation
- `@noble/hashes` — SHA256, RIPEMD160, etc.
- `@noble/curves/secp256k1` — elliptic curve operations

### QR Libraries
- `@ngraveio/bc-ur` (or equivalent) — BC-UR animated QR encoding/decoding (fountain codes for large payloads)
- `qrcode-generator` — lightweight QR code rendering
- `html5-qrcode` — camera-based QR scanning

### Blockchain Data
- Default: mempool.space API (`https://mempool.space/api/`)
- User can configure custom endpoint
- Mainnet first

### Why NOT bitcoinjs-lib?
- Heavy, many dependencies, requires Buffer polyfill in browser
- @scure/btc-signer is zero-dependency, browser-native, same author as noble/hashes
- Perfect fit for single-file inline HTML

## Tech Constraints

- **Pure vanilla JS** — no frameworks, no React, no Vue, no build tools
- **Single HTML file** per page — all CSS/JS inlined
- **Offline-capable** — hodl.html must work with zero network access
- **No localStorage/IndexedDB for private keys** — keys exist only in memory, gone on refresh
- **All libraries bundled inline** — use esbuild to create a single bundle, then inline into HTML

## QR Communication Protocol

```
yolo → hodl: ur:crypto-psbt (unsigned PSBT, animated QR)
hodl → yolo: ur:crypto-psbt (signed PSBT, animated QR)
```

BC-UR fountain codes handle large payloads across multiple QR frames. This is the same standard used by hardware wallets (Keystone, Foundation Passport, Sparrow).

## Address Types (MVP)

- **Native SegWit (P2WPKH)** — bc1q... (BIP-84) — primary
- **Taproot (P2TR)** — bc1p... (BIP-86) — secondary

## Branch Strategy

- `main` — protected, production, deployed to GitHub Pages
- `dev` — active development branch

## PWA

manifest.json and sw.js are hosted on `nugap.github.io` (the org landing page repo), shared across all chain repos. Individual chain repos do NOT include PWA files.

## Future Chains

Same pattern per chain. Planned: ETH, SOL, NEO, and more.

## Team

- vang (@vang1ong7ang) — Product Owner
- shwhy do (@do-shwhy) — Operations
- april (@zk524) — Testing
