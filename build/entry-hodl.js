// entry-hodl.js — Bundle all libraries for hodl.html (offline signer)
// This gets bundled by esbuild into a single IIFE

// Buffer polyfill for browser (required by @ngraveio/bc-ur)
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;

// BIP-39 mnemonic (NEW — not in yolo)
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// BTC transaction construction & PSBT
import * as btcSigner from '@scure/btc-signer';

// HD key derivation
import { HDKey } from '@scure/bip32';

// Hash functions
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';

// Secp256k1
import { secp256k1 } from '@noble/curves/secp256k1.js';

// BC-UR for animated QR
import { UR, UREncoder, URDecoder } from '@ngraveio/bc-ur';

// QR code generation
import qrcode from 'qrcode-generator';

// QR scanning
import { Html5Qrcode } from 'html5-qrcode';

// Base encoding for zpub conversion
import { base58check as _base58check, hex } from '@scure/base';
import { sha256 as _sha256hash } from '@noble/hashes/sha2.js';
const base58c = _base58check(_sha256hash);

// Export everything under nugap global
export {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
  wordlist,
  btcSigner,
  HDKey,
  sha256,
  ripemd160,
  secp256k1,
  UR,
  UREncoder,
  URDecoder,
  qrcode,
  Html5Qrcode,
  base58c,
  hex,
};
