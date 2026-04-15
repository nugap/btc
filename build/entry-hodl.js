import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import * as btcSigner from '@scure/btc-signer';
import { HDKey } from '@scure/bip32';
import { base58check as _base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
const base58c = _base58check(sha256);

export { generateMnemonic, mnemonicToSeedSync, validateMnemonic, wordlist, btcSigner, HDKey, base58c };
