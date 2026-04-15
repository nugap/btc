# nugap/btc Code Standards

## Code Style
- No comments in any code
- Minimal, clean, well-structured, practical
- Extract repeated DOM helpers ($, $v, $t, $on, $show, $hide)

## UI
- No beautification, only essential DOM + minimal layout CSS
- Reference: https://github.com/zk524/safe/blob/main/pure.html
- Monospace font, raw inputs/buttons/spans
- No QR code scanning or generation anywhere
- All data exchange via plain text input/textarea

## Architecture
- yolo.html = online watch-only wallet (no private keys)
- hodl.html = offline air-gapped signer (no network code)
- Data flow: yolo builds PSBT → UR text → hodl signs → UR text → yolo finalizes → broadcast
- hodl signs but does NOT finalize
- yolo finalizes and extracts raw tx

## Crypto
- Testnet uses coin type 0 (Unisat compatible): m/86'/0'/0', m/84'/0'/0'
- Taproot PSBT inputs must include tapInternalKey (x-only 32-byte pubkey)
- HDKey testnet versions: { public: 0x043587CF, private: 0x04358394 }
- UR format: CBOR-wrapped PSBT bytes via @ngraveio/bc-ur
- extractURBytes manually parses CBOR byte-string header (no decodeCBOR)
- Buffer polyfill via esbuild --inject:buffer-shim.js (must load before cbor-sync)

## Build
- esbuild bundles entry.js / entry-hodl.js with --inject:buffer-shim.js
- node build.js / build-hodl.js assembles final HTML
- hodl build has security scan rejecting network code in template
- Bundle placeholder: /* __BUNDLE_JS__ */

## Testing
- node build/test-e2e.js — Node.js logic tests (19 assertions)
- node build/test-browser-e2e.js — jsdom browser tests (16 assertions)
- Run both before every push
- Reference mnemonic: abandon x11 + about
  - BIP-84 mainnet: bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu
  - BIP-86 mainnet: bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr
  - BIP-84 testnet: tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0
  - BIP-86 testnet: tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv

## QA Checklist
- See ../QA-CHECKLIST.md for bug-driven test cases
