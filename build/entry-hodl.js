import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import * as btcSigner from '@scure/btc-signer';
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { base58check as _base58check, hex } from '@scure/base';
import { sha256 as _sha256hash } from '@noble/hashes/sha2.js';
const base58c = _base58check(_sha256hash);

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
  base58c,
  hex,
};
