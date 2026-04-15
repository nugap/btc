// entry.js — Bundle all libraries for yolo.html
// This gets bundled by esbuild into a single IIFE

// Buffer polyfill for browser (required by @ngraveio/bc-ur)
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;

// BTC transaction construction & PSBT
import * as btcSigner from '@scure/btc-signer';

// HD key derivation (xpub → child keys)
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

// Export everything under nugap global
export {
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
};
