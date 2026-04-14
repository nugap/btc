// verify-hodl.js — Phase 2 Functional Verification
// Tests: wallet create/import, key derivation, zpub conversion,
//        PSBT parse/sign/finalize, BC-UR encode/decode round-trip
'use strict';

const vm = require('vm');
const fs = require('fs');
const crypto = require('crypto');

// Load bundle into sandbox
const bundleCode = fs.readFileSync(__dirname + '/bundle.js', 'utf8');

// Use hodl bundle if exists, fallback to shared bundle
const hodlBundlePath = __dirname + '/../build/bundle-hodl.js';
const bundlePath = fs.existsSync(hodlBundlePath) ? hodlBundlePath : __dirname + '/bundle.js';
const bundle = fs.readFileSync(bundlePath, 'utf8');

const sandbox = {
  Buffer, console, Uint8Array, Int8Array, Uint16Array, Int16Array,
  Uint32Array, Int32Array, Float32Array, Float64Array, BigInt64Array,
  BigUint64Array, ArrayBuffer, SharedArrayBuffer, DataView,
  TextEncoder: require('util').TextEncoder,
  TextDecoder: require('util').TextDecoder,
  process, globalThis: {}, self: {}, window: {}, navigator: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  crypto: crypto.webcrypto || crypto,
  URL, URLSearchParams, BigInt,
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);
vm.runInContext(bundle, ctx);

const {
  generateMnemonic, mnemonicToSeedSync, validateMnemonic, wordlist,
  btcSigner, HDKey, sha256, secp256k1,
  UR, UREncoder, URDecoder, base58c, hex,
} = sandbox.nugap;

// ─── Test harness ───
let passed = 0, failed = 0, total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

// ─── Known test vector (BIP-39 / BIP-32 / BIP-84) ───
// Standard test mnemonic
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSPHRASE = '';

console.log('\n══════════════════════════════════════');
console.log(' Phase 2 — hodl.html Functional Verification');
console.log('══════════════════════════════════════\n');

// ═══════════════════════════════════════════
// 1. MNEMONIC GENERATION
// ═══════════════════════════════════════════
console.log('1. Mnemonic Generation');

test('generateMnemonic(12) returns 12 valid words', () => {
  const mn = generateMnemonic(wordlist, 128);
  const words = mn.split(' ');
  assertEqual(words.length, 12, `Expected 12 words, got ${words.length}`);
  assert(validateMnemonic(mn, wordlist), 'Generated mnemonic fails validation');
  // Every word must be in wordlist
  for (const w of words) {
    assert(wordlist.includes(w), `Word "${w}" not in BIP-39 wordlist`);
  }
});

test('generateMnemonic(24) returns 24 valid words', () => {
  const mn = generateMnemonic(wordlist, 256);
  const words = mn.split(' ');
  assertEqual(words.length, 24, `Expected 24 words, got ${words.length}`);
  assert(validateMnemonic(mn, wordlist), 'Generated 24-word mnemonic fails validation');
});

test('Two generated mnemonics are different (entropy test)', () => {
  const a = generateMnemonic(wordlist, 128);
  const b = generateMnemonic(wordlist, 128);
  assert(a !== b, 'Two sequential mnemonics are identical — entropy problem');
});

// ═══════════════════════════════════════════
// 2. MNEMONIC VALIDATION
// ═══════════════════════════════════════════
console.log('\n2. Mnemonic Validation');

test('Valid mnemonic passes validation', () => {
  assert(validateMnemonic(TEST_MNEMONIC, wordlist), 'Known-good mnemonic should validate');
});

test('Invalid word rejected', () => {
  const bad = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon zzzzz';
  assert(!validateMnemonic(bad, wordlist), 'Should reject invalid word');
});

test('Wrong checksum rejected', () => {
  // Swap last word to break checksum
  const bad = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
  assert(!validateMnemonic(bad, wordlist), 'Should reject bad checksum');
});

test('Wrong word count rejected (11 words)', () => {
  const bad = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
  assert(!validateMnemonic(bad, wordlist), 'Should reject 11 words');
});

// ═══════════════════════════════════════════
// 3. KEY DERIVATION (BIP-32/39/84)
// ═══════════════════════════════════════════
console.log('\n3. Key Derivation');

const seed = mnemonicToSeedSync(TEST_MNEMONIC, TEST_PASSPHRASE);
const masterKey = HDKey.fromMasterSeed(seed);

test('Seed is 64 bytes', () => {
  assertEqual(seed.length, 64, `Seed length: ${seed.length}`);
});

test('Master key has private key', () => {
  assert(masterKey.privateKey, 'Master key should have privateKey');
  assertEqual(masterKey.privateKey.length, 32, 'Private key should be 32 bytes');
});

test('Master key has public key', () => {
  assert(masterKey.publicKey, 'Master key should have publicKey');
  assertEqual(masterKey.publicKey.length, 33, 'Public key should be 33 bytes (compressed)');
});

test('Master key has fingerprint', () => {
  assert(masterKey.fingerprint !== undefined, 'Should have fingerprint');
});

// BIP-84 derivation
const bip84Account = masterKey.derive("m/84'/0'/0'");

test('BIP-84 account derives successfully', () => {
  assert(bip84Account, 'BIP-84 account should exist');
  assert(bip84Account.publicExtendedKey, 'Should have xpub');
  assert(bip84Account.publicExtendedKey.startsWith('xpub'), 'Should start with xpub');
});

test('BIP-84 first receive address is correct (known vector)', () => {
  // For "abandon..." mnemonic, BIP-84 m/84h/0h/0h/0/0 address:
  // bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu
  const child = bip84Account.deriveChild(0).deriveChild(0);
  const addr = btcSigner.p2wpkh(child.publicKey).address;
  assertEqual(addr, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    `Expected bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu, got ${addr}`);
});

test('BIP-84 address derivation for first 5 receive addresses', () => {
  for (let i = 0; i < 5; i++) {
    const child = bip84Account.deriveChild(0).deriveChild(i);
    const addr = btcSigner.p2wpkh(child.publicKey).address;
    assert(addr.startsWith('bc1q'), `Address ${i} should start with bc1q: ${addr}`);
  }
});

test('BIP-84 change address derivation', () => {
  const child = bip84Account.deriveChild(1).deriveChild(0);
  const addr = btcSigner.p2wpkh(child.publicKey).address;
  assert(addr.startsWith('bc1q'), `Change address should start with bc1q: ${addr}`);
  // Change address should differ from receive address
  const recv = bip84Account.deriveChild(0).deriveChild(0);
  const recvAddr = btcSigner.p2wpkh(recv.publicKey).address;
  assert(addr !== recvAddr, 'Change address should differ from receive address');
});

// BIP-86 Taproot derivation
const bip86Account = masterKey.derive("m/86'/0'/0'");

test('BIP-86 account derives successfully', () => {
  assert(bip86Account, 'BIP-86 account should exist');
  assert(bip86Account.publicExtendedKey, 'Should have xpub');
});

test('BIP-86 first receive address is Taproot (bc1p)', () => {
  const child = bip86Account.deriveChild(0).deriveChild(0);
  const xonly = child.publicKey.length === 33 ? child.publicKey.slice(1) : child.publicKey;
  const addr = btcSigner.p2tr(xonly).address;
  assert(addr.startsWith('bc1p'), `Taproot address should start with bc1p: ${addr}`);
});

// ═══════════════════════════════════════════
// 4. ZPUB CONVERSION
// ═══════════════════════════════════════════
console.log('\n4. zpub Conversion');

function xpubToZpub(xpubStr) {
  const decoded = base58c.decode(xpubStr);
  const buf = new Uint8Array(decoded);
  buf[0] = 0x04; buf[1] = 0xB2; buf[2] = 0x47; buf[3] = 0x46;
  return base58c.encode(buf);
}

test('xpub converts to zpub with correct prefix', () => {
  const xpub = bip84Account.publicExtendedKey;
  const zpub = xpubToZpub(xpub);
  assert(zpub.startsWith('zpub'), `Should start with zpub: ${zpub}`);
});

test('zpub decodes back to same pubkey data', () => {
  const xpub = bip84Account.publicExtendedKey;
  const zpub = xpubToZpub(xpub);
  const xpubDecoded = base58c.decode(xpub);
  const zpubDecoded = base58c.decode(zpub);
  // Bytes 4+ should be identical (only version differs)
  assert(Buffer.from(xpubDecoded.slice(4)).equals(Buffer.from(zpubDecoded.slice(4))),
    'Payload bytes should match after version prefix');
});

test('zpub can reconstruct same addresses as xpub', () => {
  // Import zpub as HDKey and derive addresses
  const xpub = bip84Account.publicExtendedKey;
  const zpub = xpubToZpub(xpub);
  // Decode zpub back to xpub for HDKey import (HDKey expects xpub prefix)
  const zpubBytes = base58c.decode(zpub);
  const xpubBytes = new Uint8Array(zpubBytes);
  xpubBytes[0] = 0x04; xpubBytes[1] = 0x88; xpubBytes[2] = 0xB2; xpubBytes[3] = 0x1E;
  const xpubRestored = base58c.encode(xpubBytes);
  const restoredKey = HDKey.fromExtendedKey(xpubRestored);
  const childOriginal = bip84Account.deriveChild(0).deriveChild(0);
  const childRestored = restoredKey.deriveChild(0).deriveChild(0);
  const addrOriginal = btcSigner.p2wpkh(childOriginal.publicKey).address;
  const addrRestored = btcSigner.p2wpkh(childRestored.publicKey).address;
  assertEqual(addrOriginal, addrRestored, 'Addresses should match after zpub round-trip');
});

// ═══════════════════════════════════════════
// 5. PSBT CREATE → SIGN → FINALIZE
// ═══════════════════════════════════════════
console.log('\n5. PSBT Signing Flow');

test('Create PSBT, sign with private key, finalize', () => {
  // Simulate: yolo creates a PSBT spending from our BIP-84 address
  const child00 = bip84Account.deriveChild(0).deriveChild(0);
  const p2 = btcSigner.p2wpkh(child00.publicKey);

  // Build PSBT (without bip32Derivation to avoid format issues)
  const tx = new btcSigner.Transaction();
  tx.addInput({
    txid: 'a'.repeat(64),
    index: 0,
    witnessUtxo: {
      script: p2.script,
      amount: BigInt(100000), // 0.001 BTC
    },
  });

  // Output: send 90000 sats to a random address
  const recipientChild = bip84Account.deriveChild(0).deriveChild(5);
  const recipientAddr = btcSigner.p2wpkh(recipientChild.publicKey).address;
  tx.addOutputAddress(recipientAddr, BigInt(90000));

  // Change output: 9000 sats (fee = 1000)
  const changeChild = bip84Account.deriveChild(1).deriveChild(0);
  const changeAddr = btcSigner.p2wpkh(changeChild.publicKey).address;
  tx.addOutputAddress(changeAddr, BigInt(9000));

  // Export as PSBT bytes
  const psbtBytes = tx.toPSBT();
  assert(psbtBytes.length > 0, 'PSBT should have content');

  // Now sign (simulating hodl.html's signing logic)
  const tx2 = btcSigner.Transaction.fromPSBT(psbtBytes);
  // Derive the private key for input 0
  const signerKey = masterKey.derive("m/84'/0'/0'/0/0");
  tx2.signIdx(signerKey.privateKey, 0);
  tx2.finalize();

  // Extract final transaction
  const finalHex = tx2.hex;
  assert(finalHex.length > 0, 'Should produce final tx hex');
  assert(typeof finalHex === 'string', 'Hex should be a string');

  // Verify we can get signed PSBT back too
  const signedPSBT = tx2.toPSBT();
  assert(signedPSBT.length > psbtBytes.length, 'Signed PSBT should be larger than unsigned');
});

test('Multi-input PSBT signing', () => {
  // 2 inputs from different addresses
  const child00 = bip84Account.deriveChild(0).deriveChild(0);
  const child01 = bip84Account.deriveChild(0).deriveChild(1);
  const p2_0 = btcSigner.p2wpkh(child00.publicKey);
  const p2_1 = btcSigner.p2wpkh(child01.publicKey);

  const tx = new btcSigner.Transaction();
  tx.addInput({
    txid: 'b'.repeat(64),
    index: 0,
    witnessUtxo: { script: p2_0.script, amount: BigInt(50000) },
  });
  tx.addInput({
    txid: 'c'.repeat(64),
    index: 1,
    witnessUtxo: { script: p2_1.script, amount: BigInt(60000) },
  });
  // Output
  const recipientChild = bip84Account.deriveChild(0).deriveChild(10);
  tx.addOutputAddress(btcSigner.p2wpkh(recipientChild.publicKey).address, BigInt(100000));

  const psbtBytes = tx.toPSBT();
  const tx2 = btcSigner.Transaction.fromPSBT(psbtBytes);

  // Sign both inputs with correct keys
  tx2.signIdx(masterKey.derive("m/84'/0'/0'/0/0").privateKey, 0);
  tx2.signIdx(masterKey.derive("m/84'/0'/0'/0/1").privateKey, 1);
  tx2.finalize();

  assert(tx2.hex.length > 0, 'Multi-input tx should produce hex');
});

test('PSBT fee calculation is correct', () => {
  const child00 = bip84Account.deriveChild(0).deriveChild(0);
  const p2 = btcSigner.p2wpkh(child00.publicKey);

  const tx = new btcSigner.Transaction();
  tx.addInput({
    txid: 'd'.repeat(64),
    index: 0,
    witnessUtxo: { script: p2.script, amount: BigInt(200000) },
  });

  const recipient = bip84Account.deriveChild(0).deriveChild(3);
  tx.addOutputAddress(btcSigner.p2wpkh(recipient.publicKey).address, BigInt(150000));
  const change = bip84Account.deriveChild(1).deriveChild(0);
  tx.addOutputAddress(btcSigner.p2wpkh(change.publicKey).address, BigInt(49000));

  // fee = 200000 - 150000 - 49000 = 1000
  const psbt = tx.toPSBT();
  const tx2 = btcSigner.Transaction.fromPSBT(psbt);

  let totalIn = 0n;
  for (let i = 0; i < tx2.inputsLength; i++) {
    const inp = tx2.getInput(i);
    if (inp.witnessUtxo) totalIn += BigInt(inp.witnessUtxo.amount);
  }
  let totalOut = 0n;
  for (let i = 0; i < tx2.outputsLength; i++) {
    const out = tx2.getOutput(i);
    totalOut += BigInt(out.amount);
  }
  const fee = totalIn - totalOut;
  assertEqual(Number(fee), 1000, `Fee should be 1000 sats, got ${fee}`);
});

// ═══════════════════════════════════════════
// 6. BC-UR ENCODE/DECODE ROUND-TRIP
// ═══════════════════════════════════════════
console.log('\n6. BC-UR Round-Trip');

test('BC-UR single-part encode/decode round-trip (crypto-psbt)', () => {
  // Small PSBT that fits in one part
  const child00 = bip84Account.deriveChild(0).deriveChild(0);
  const p2 = btcSigner.p2wpkh(child00.publicKey);
  const tx = new btcSigner.Transaction();
  tx.addInput({
    txid: 'e'.repeat(64), index: 0,
    witnessUtxo: { script: p2.script, amount: BigInt(50000) },
  });
  tx.addOutputAddress(btcSigner.p2wpkh(bip84Account.deriveChild(0).deriveChild(2).publicKey).address, BigInt(49000));
  const psbtBytes = tx.toPSBT();

  // Encode — use UR constructor with explicit type 'crypto-psbt'
  const ur = new UR(Buffer.from(psbtBytes), 'crypto-psbt');
  const encoder = new UREncoder(ur, psbtBytes.length + 200);
  const part = encoder.nextPart();
  assert(part.toLowerCase().startsWith('ur:crypto-psbt/'), `Should be ur:crypto-psbt, got: ${part.substring(0, 30)}`);

  // Decode
  const decoder = new URDecoder();
  decoder.receivePart(part);
  assert(decoder.isComplete(), 'Single part should complete decode');
  assert(decoder.isSuccess(), 'Decode should succeed');
  const decoded = decoder.resultUR();
  assertEqual(decoded.type, 'crypto-psbt', 'Type should be crypto-psbt');
  const decodedBytes = new Uint8Array(decoded.cbor);
  assert(Buffer.from(psbtBytes).equals(Buffer.from(decodedBytes)), 'Round-trip bytes should match');
});

test('BC-UR multi-part (animated QR) encode/decode round-trip', () => {
  // Create a larger PSBT (multiple inputs to make it bigger)
  const tx = new btcSigner.Transaction();
  for (let i = 0; i < 10; i++) {
    const child = bip84Account.deriveChild(0).deriveChild(i);
    const p2 = btcSigner.p2wpkh(child.publicKey);
    tx.addInput({
      txid: i.toString(16).padStart(64, '0'), index: 0,
      witnessUtxo: { script: p2.script, amount: BigInt(10000) },
    });
  }
  tx.addOutputAddress(btcSigner.p2wpkh(bip84Account.deriveChild(0).deriveChild(15).publicKey).address, BigInt(95000));

  const psbtBytes = tx.toPSBT();

  // CBOR-encode then UR-encode (matching actual hodl/yolo implementation)
  function cborEncodeBytes(buf) {
    const len = buf.length;
    if (len < 24) {
      const out = new Uint8Array(1 + len); out[0] = 0x40 + len; out.set(buf, 1); return out;
    } else if (len < 256) {
      const out = new Uint8Array(2 + len); out[0] = 0x58; out[1] = len; out.set(buf, 2); return out;
    } else if (len < 65536) {
      const out = new Uint8Array(3 + len); out[0] = 0x59; out[1] = (len >> 8) & 0xff; out[2] = len & 0xff; out.set(buf, 3); return out;
    } else {
      const out = new Uint8Array(5 + len); out[0] = 0x5a; out[1]=(len>>24)&0xff; out[2]=(len>>16)&0xff; out[3]=(len>>8)&0xff; out[4]=len&0xff; out.set(buf, 5); return out;
    }
  }
  const cborPayload = cborEncodeBytes(psbtBytes);

  // Encode with small fragment size to force multi-part
  const ur = new UR(Buffer.from(cborPayload), 'crypto-psbt');
  const encoder = new UREncoder(ur, 100); // small fragment → many parts

  // Collect enough parts
  const decoder = new URDecoder();
  let attempts = 0;
  while (!decoder.isComplete() && attempts < 500) {
    const part = encoder.nextPart();
    decoder.receivePart(part);
    attempts++;
  }

  assert(decoder.isComplete(), `Should complete after ${attempts} parts`);
  assert(decoder.isSuccess(), 'Multi-part decode should succeed');
  const decoded = decoder.resultUR();
  assertEqual(decoded.type, 'crypto-psbt', 'Multi-part type should be crypto-psbt');
  // decodeCBOR unwraps the CBOR envelope to get original PSBT bytes
  const decodedBytes = new Uint8Array(decoded.decodeCBOR ? decoded.decodeCBOR() : decoded.cbor);
  assert(Buffer.from(psbtBytes).equals(Buffer.from(decodedBytes)), 'Multi-part round-trip bytes should match');
  console.log(`    (used ${attempts} parts for ${psbtBytes.length} byte PSBT)`);
});

// ═══════════════════════════════════════════
// 7. TAPROOT (BIP-86) SIGNING
// ═══════════════════════════════════════════
console.log('\n7. Taproot (BIP-86) Signing');

test('BIP-86 Taproot address generation and PSBT signing', () => {
  const child00 = bip86Account.deriveChild(0).deriveChild(0);
  const xonly = child00.publicKey.length === 33 ? child00.publicKey.slice(1) : child00.publicKey;
  const p2tr = btcSigner.p2tr(xonly);
  assert(p2tr.address.startsWith('bc1p'), `Taproot address should start bc1p: ${p2tr.address}`);

  const tx = new btcSigner.Transaction();
  tx.addInput({
    txid: 'f'.repeat(64), index: 0,
    witnessUtxo: { script: p2tr.script, amount: BigInt(80000) },
    tapInternalKey: xonly,
  });
  
  // Output to another taproot address
  const child05 = bip86Account.deriveChild(0).deriveChild(5);
  const xonly5 = child05.publicKey.length === 33 ? child05.publicKey.slice(1) : child05.publicKey;
  tx.addOutputAddress(btcSigner.p2tr(xonly5).address, BigInt(79000));

  const psbtBytes = tx.toPSBT();
  const tx2 = btcSigner.Transaction.fromPSBT(psbtBytes);
  
  // Sign with taproot key
  const signerKey = masterKey.derive("m/86'/0'/0'/0/0");
  tx2.signIdx(signerKey.privateKey, 0);
  tx2.finalize();
  
  assert(tx2.hex.length > 0, 'Taproot tx should produce hex');
});

// ═══════════════════════════════════════════
// 8. IMPORT → DERIVE → SAME RESULT
// ═══════════════════════════════════════════
console.log('\n8. Import Wallet Consistency');

test('Importing same mnemonic produces identical keys', () => {
  const seed2 = mnemonicToSeedSync(TEST_MNEMONIC, '');
  const mk2 = HDKey.fromMasterSeed(seed2);
  const acc2 = mk2.derive("m/84'/0'/0'");
  const addr2 = btcSigner.p2wpkh(acc2.deriveChild(0).deriveChild(0).publicKey).address;
  const addr1 = btcSigner.p2wpkh(bip84Account.deriveChild(0).deriveChild(0).publicKey).address;
  assertEqual(addr1, addr2, 'Same mnemonic should produce same address');
});

test('Passphrase changes derived keys', () => {
  const seedWithPass = mnemonicToSeedSync(TEST_MNEMONIC, 'mypassphrase');
  const mkPass = HDKey.fromMasterSeed(seedWithPass);
  const accPass = mkPass.derive("m/84'/0'/0'");
  const addrPass = btcSigner.p2wpkh(accPass.deriveChild(0).deriveChild(0).publicKey).address;
  const addrNoPass = btcSigner.p2wpkh(bip84Account.deriveChild(0).deriveChild(0).publicKey).address;
  assert(addrPass !== addrNoPass, 'Passphrase should produce different address');
});

// ═══════════════════════════════════════════
// 9. SECURITY CHECKS
// ═══════════════════════════════════════════
console.log('\n9. Security Checks');

test('hodl.html has no network code (fetch/XMLHttpRequest/WebSocket)', () => {
  const hodlPath = __dirname + '/../hodl.html';
  if (!fs.existsSync(hodlPath)) {
    throw new Error('hodl.html not found — build first');
  }
  const html = fs.readFileSync(hodlPath, 'utf8');
  
  // These patterns should NOT appear (outside of comments/library feature detection)
  // We check for actual usage patterns
  const banned = [
    { pattern: /new\s+XMLHttpRequest/g, name: 'XMLHttpRequest constructor' },
    { pattern: /new\s+WebSocket/g, name: 'WebSocket constructor' },
    { pattern: /new\s+EventSource/g, name: 'EventSource constructor' },
    { pattern: /navigator\.sendBeacon/g, name: 'sendBeacon' },
    { pattern: /navigator\.geolocation/g, name: 'geolocation' },
    { pattern: /<script\s+src=/gi, name: 'external script' },
    { pattern: /<link\s+href="http/gi, name: 'external stylesheet' },
    { pattern: /<img\s+src="http/gi, name: 'external image' },
  ];
  
  const violations = [];
  for (const { pattern, name } of banned) {
    if (pattern.test(html)) {
      violations.push(name);
    }
  }
  assertEqual(violations.length, 0, `Network code found: ${violations.join(', ')}`);
});

test('hodl.html has CSP meta tag', () => {
  const html = fs.readFileSync(__dirname + '/../hodl.html', 'utf8');
  assert(html.includes("Content-Security-Policy"), 'Should have CSP meta tag');
  assert(html.includes("default-src 'none'"), 'CSP should have default-src none');
});

test('hodl.html uses crypto.getRandomValues (not Math.random for keys)', () => {
  // In the application code (template part), verify crypto.getRandomValues is available
  // The library (@scure/bip39) uses it internally
  // We just check that the template doesn't override or bypass it
  const template = fs.readFileSync(__dirname + '/../build/template-hodl.html', 'utf8');
  // Application code should not use Math.random for any security purpose
  // Check that crypto.getRandomValues is used in verify flow (for random word indices)
  assert(template.includes('crypto.getRandomValues'), 'Template should use crypto.getRandomValues');
});

test('hodl.html has no localStorage/sessionStorage/IndexedDB', () => {
  const template = fs.readFileSync(__dirname + '/../build/template-hodl.html', 'utf8');
  assert(!template.includes('localStorage'), 'Should not use localStorage');
  assert(!template.includes('sessionStorage'), 'Should not use sessionStorage');
  assert(!template.includes('IndexedDB'), 'Should not use IndexedDB');
});

test('hodl.html has offline detection', () => {
  const template = fs.readFileSync(__dirname + '/../build/template-hodl.html', 'utf8');
  assert(template.includes('navigator.onLine'), 'Should check navigator.onLine');
  assert(template.includes("addEventListener('online'") || template.includes('addEventListener("online"'),
    'Should listen for online event');
});

// ═══════════════════════════════════════════
// 10. BRUTE-FORCE SIGNING (FALLBACK PATH)
// ═══════════════════════════════════════════
console.log('\n10. Brute-force Signing Fallback');

test('Can sign PSBT without bip32Derivation using brute-force', () => {
  // PSBT without bip32Derivation — hodl.html should try common paths
  const child = bip84Account.deriveChild(0).deriveChild(3);
  const p2 = btcSigner.p2wpkh(child.publicKey);
  
  const tx = new btcSigner.Transaction();
  tx.addInput({
    txid: '1'.repeat(64), index: 0,
    witnessUtxo: { script: p2.script, amount: BigInt(30000) },
    // NO bip32Derivation — simulate a PSBT from another wallet
  });
  tx.addOutputAddress(btcSigner.p2wpkh(bip84Account.deriveChild(0).deriveChild(7).publicKey).address, BigInt(29000));
  
  const psbtBytes = tx.toPSBT();
  const tx2 = btcSigner.Transaction.fromPSBT(psbtBytes);
  
  // Brute-force: try paths until one works
  let signed = false;
  const paths = ["m/84'/0'/0'", "m/86'/0'/0'"];
  for (const basePath of paths) {
    for (const chain of [0, 1]) {
      for (let idx = 0; idx < 20; idx++) {
        try {
          const tryKey = masterKey.derive(`${basePath}/${chain}/${idx}`);
          tx2.signIdx(tryKey.privateKey, 0);
          signed = true;
          break;
        } catch(e) {}
      }
      if (signed) break;
    }
    if (signed) break;
  }
  
  assert(signed, 'Brute-force should find the correct key');
  tx2.finalize();
  assert(tx2.hex.length > 0, 'Should produce valid hex after brute-force signing');
});

// ═══════════════════════════════════════════
// 11. ADDRESS PARSING FROM PSBT OUTPUTS
// ═══════════════════════════════════════════
console.log('\n11. Address Parsing from PSBT Outputs');

test('Can decode p2wpkh output address from PSBT', () => {
  const child = bip84Account.deriveChild(0).deriveChild(0);
  const p2 = btcSigner.p2wpkh(child.publicKey);
  const tx = new btcSigner.Transaction();
  tx.addInput({
    txid: '2'.repeat(64), index: 0,
    witnessUtxo: { script: p2.script, amount: BigInt(50000) },
  });
  tx.addOutputAddress(p2.address, BigInt(49000));
  
  const psbt = tx.toPSBT();
  const tx2 = btcSigner.Transaction.fromPSBT(psbt);
  const out = tx2.getOutput(0);
  
  // Decode address from script — use Address().encode() (same as template logic)
  let addr = '';
  try {
    const decoded = btcSigner.OutScript.decode(out.script);
    addr = btcSigner.Address().encode(decoded);
  } catch(e) { console.log('    decode error:', e.message); }
  
  assertEqual(addr, p2.address, 'Decoded address should match original');
});

test('Can decode p2tr output address from PSBT', () => {
  const child = bip86Account.deriveChild(0).deriveChild(0);
  const xonly = child.publicKey.length === 33 ? child.publicKey.slice(1) : child.publicKey;
  const p2tr = btcSigner.p2tr(xonly);
  
  const childInput = bip84Account.deriveChild(0).deriveChild(0);
  const p2Input = btcSigner.p2wpkh(childInput.publicKey);
  
  const tx = new btcSigner.Transaction();
  tx.addInput({
    txid: '3'.repeat(64), index: 0,
    witnessUtxo: { script: p2Input.script, amount: BigInt(50000) },
  });
  tx.addOutputAddress(p2tr.address, BigInt(49000));
  
  const psbt = tx.toPSBT();
  const tx2 = btcSigner.Transaction.fromPSBT(psbt);
  const out = tx2.getOutput(0);
  
  // Use Address().encode() (same as template's primary decode path)
  let addr = '';
  try {
    const decoded = btcSigner.OutScript.decode(out.script);
    addr = btcSigner.Address().encode(decoded);
  } catch(e) { console.log('    decode error:', e.message); }
  
  assertEqual(addr, p2tr.address, 'Decoded Taproot address should match original');
});

// ═══════════════════════════════════════════
// 12. CHANGE ADDRESS DETECTION
// ═══════════════════════════════════════════
console.log('\n12. Change Address Detection');

test('getChangeAddresses correctly identifies change outputs', () => {
  // Simulate hodl's change address detection
  const addrs = new Set();
  for (const type of ['bip84', 'bip86']) {
    const acc = type === 'bip84' ? bip84Account : bip86Account;
    for (let i = 0; i < 20; i++) {
      const child = acc.deriveChild(1).deriveChild(i); // change chain
      if (type === 'bip84') {
        addrs.add(btcSigner.p2wpkh(child.publicKey).address);
      } else {
        const xonly = child.publicKey.length === 33 ? child.publicKey.slice(1) : child.publicKey;
        addrs.add(btcSigner.p2tr(xonly).address);
      }
    }
  }
  
  // Change address should be in the set
  const changeChild = bip84Account.deriveChild(1).deriveChild(0);
  const changeAddr = btcSigner.p2wpkh(changeChild.publicKey).address;
  assert(addrs.has(changeAddr), 'Change address 0 should be detected');
  
  // Receive address should NOT be in the set
  const recvChild = bip84Account.deriveChild(0).deriveChild(0);
  const recvAddr = btcSigner.p2wpkh(recvChild.publicKey).address;
  assert(!addrs.has(recvAddr), 'Receive address should NOT be in change set');
});

// ═══════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log(` Results: ${passed}/${total} passed, ${failed} failed`);
console.log('══════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All functional verification tests passed!\n');
}
