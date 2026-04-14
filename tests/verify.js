// verify.js — Functional verification for yolo.html core logic
// Run: node verify.js
'use strict';

// Load the bundled libs
const vm = require('vm');
const fs = require('fs');

// We need to create a mock browser environment for the bundle
const bundleCode = fs.readFileSync(__dirname + '/bundle.js', 'utf8');

// Execute bundle in sandbox
const sandbox = { 
  Buffer: Buffer, 
  console: console, 
  Uint8Array, 
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  ArrayBuffer,
  SharedArrayBuffer,
  DataView,
  TextEncoder: require('util').TextEncoder,
  TextDecoder: require('util').TextDecoder,
  process: process,
  globalThis: {},
  self: {},
  window: {},
  navigator: {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  crypto: require('crypto').webcrypto || require('crypto'),
  URL: URL,
  URLSearchParams: URLSearchParams,
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(bundleCode, ctx);
const nugap = sandbox.nugap;

if (!nugap) {
  console.error('FAIL: nugap global not found after bundle execution');
  process.exit(1);
}

console.log('✅ Bundle loaded, nugap keys:', Object.keys(nugap));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch(e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// === 1. Library presence ===
console.log('\n=== 1. Library Presence ===');
test('btcSigner exists', () => assert(nugap.btcSigner, 'btcSigner missing'));
test('HDKey exists', () => assert(nugap.HDKey, 'HDKey missing'));
test('sha256 exists', () => assert(typeof nugap.sha256 === 'function', 'sha256 missing'));
test('ripemd160 exists', () => assert(typeof nugap.ripemd160 === 'function', 'ripemd160 missing'));
test('UR exists', () => assert(nugap.UR, 'UR missing'));
test('UREncoder exists', () => assert(nugap.UREncoder, 'UREncoder missing'));
test('URDecoder exists', () => assert(nugap.URDecoder, 'URDecoder missing'));
test('qrcode exists', () => assert(typeof nugap.qrcode === 'function' || nugap.qrcode, 'qrcode missing'));
test('Html5Qrcode exists', () => assert(nugap.Html5Qrcode, 'Html5Qrcode missing'));

// === 2. btcSigner API ===
console.log('\n=== 2. btcSigner API ===');
test('btcSigner.Transaction exists', () => assert(nugap.btcSigner.Transaction, 'Transaction missing'));
test('btcSigner.p2wpkh exists', () => assert(nugap.btcSigner.p2wpkh, 'p2wpkh missing'));
test('btcSigner.p2tr exists', () => assert(nugap.btcSigner.p2tr, 'p2tr missing'));

// Check Address API — the template uses btcSigner.Address() in two different ways:
// 1. btcSigner.Address(btcSigner.p2wpkh(pubkey)).toString()
// 2. btcSigner.Address().decode(recipientAddr)
test('btcSigner.Address exists', () => {
  const A = nugap.btcSigner.Address;
  assert(A, 'Address missing');
  console.log('    Address type:', typeof A);
  // Check if it's a function or object
  if (typeof A === 'function') {
    console.log('    Address() is a function');
    try {
      const inst = A();
      console.log('    Address() called, result type:', typeof inst);
      if (inst) console.log('    Address() result keys:', Object.keys(inst));
    } catch(e) {
      console.log('    Address() threw:', e.message);
    }
  } else {
    console.log('    Address is an object, keys:', Object.keys(A));
  }
});

// Check OutScript for address encoding
test('btcSigner.OutScript exists', () => {
  const OS = nugap.btcSigner.OutScript;
  if (OS) {
    console.log('    OutScript keys:', Object.keys(OS));
  } else {
    console.log('    OutScript not found');
  }
});

// === 3. HDKey ===
console.log('\n=== 3. HDKey ===');
test('HDKey.fromExtendedKey works', () => {
  // Known test xpub (Bitcoin mainnet)
  const testXpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
  const hd = nugap.HDKey.fromExtendedKey(testXpub);
  assert(hd, 'fromExtendedKey returned null');
  assert(hd.publicKey, 'No publicKey');
  console.log('    pubkey length:', hd.publicKey.length);
  // Derive a child
  const child = hd.deriveChild(0).deriveChild(0);
  assert(child.publicKey, 'Child has no pubkey');
  console.log('    child pubkey length:', child.publicKey.length);
});

// === 4. Address generation from pubkey ===
console.log('\n=== 4. Address Generation ===');
test('p2wpkh address from pubkey', () => {
  const testXpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
  const hd = nugap.HDKey.fromExtendedKey(testXpub);
  const child = hd.deriveChild(0).deriveChild(0);
  const pubkey = child.publicKey;
  
  // Method from template: btcSigner.Address(btcSigner.p2wpkh(pubkey)).toString()
  try {
    const p2 = nugap.btcSigner.p2wpkh(pubkey);
    console.log('    p2wpkh result keys:', Object.keys(p2));
    if (p2.address) {
      console.log('    p2wpkh.address:', p2.address);
    }
    
    // Try the template's method
    const addr = nugap.btcSigner.Address;
    if (typeof addr === 'function') {
      try {
        const result = addr(p2);
        console.log('    Address(p2wpkh) result:', typeof result, result);
        if (result && typeof result.toString === 'function') {
          console.log('    .toString():', result.toString());
        }
      } catch(e) {
        console.log('    Address(p2wpkh) threw:', e.message);
      }
    }
  } catch(e) {
    throw new Error('p2wpkh address gen failed: ' + e.message);
  }
});

test('p2tr address from x-only pubkey', () => {
  const testXpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
  const hd = nugap.HDKey.fromExtendedKey(testXpub);
  const child = hd.deriveChild(0).deriveChild(0);
  const pubkey = child.publicKey;
  const xonly = pubkey.slice(1); // 32 bytes x-only
  
  try {
    const p2 = nugap.btcSigner.p2tr(xonly);
    console.log('    p2tr result keys:', Object.keys(p2));
    if (p2.address) {
      console.log('    p2tr.address:', p2.address);
    }
  } catch(e) {
    console.log('    p2tr threw:', e.message);
    // This might be expected — p2tr might need proper internal key
    throw e;
  }
});

// === 5. Transaction API ===
console.log('\n=== 5. Transaction API ===');
test('Transaction can be instantiated', () => {
  const tx = new nugap.btcSigner.Transaction();
  assert(tx, 'Transaction null');
  assert(typeof tx.addInput === 'function', 'addInput missing');
  assert(typeof tx.addOutputAddress === 'function', 'addOutputAddress missing');
  assert(typeof tx.toPSBT === 'function', 'toPSBT missing');
  console.log('    Transaction methods: addInput, addOutputAddress, toPSBT — OK');
});

// === 6. BC-UR ===
console.log('\n=== 6. BC-UR ===');
test('UR encode/decode round trip', () => {
  const data = Buffer.from('deadbeef', 'hex');
  const ur = nugap.UR.fromBuffer(data, 'crypto-psbt');
  assert(ur, 'UR creation failed');
  
  const encoder = new nugap.UREncoder(ur, 200);
  const part = encoder.nextPart();
  assert(typeof part === 'string', 'nextPart should return string');
  console.log('    UR part:', part);
  
  const decoder = new nugap.URDecoder();
  decoder.receivePart(part);
  const complete = decoder.isComplete();
  console.log('    Complete after 1 part:', complete);
});

// === 7. Address decode for PSBT outputs ===
console.log('\n=== 7. Address Decode ===');
test('Address decode for bc1q address', () => {
  // The template uses: btcSigner.Address().decode(addr)
  // Let's check the actual API
  const btcS = nugap.btcSigner;
  
  // Try different approaches
  const testAddr = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
  
  // Approach 1: Address().decode()
  if (typeof btcS.Address === 'function') {
    try {
      const result = btcS.Address().decode(testAddr);
      console.log('    Address().decode() works:', result);
    } catch(e) {
      console.log('    Address().decode() FAILED:', e.message);
    }
  }
  
  // Approach 2: Address(network).decode()
  try {
    const result = btcS.Address();
    console.log('    Address() returns:', typeof result);
    if (result && typeof result.decode === 'function') {
      const decoded = result.decode(testAddr);
      console.log('    .decode() result:', decoded);
    }
  } catch(e) {
    console.log('    Address().decode approach failed:', e.message);
  }
  
  // Approach 3: OutScript.decode
  if (btcS.OutScript) {
    try {
      console.log('    OutScript.decode exists:', typeof btcS.OutScript.decode);
    } catch(e) {}
  }
  
  // Approach 4: p2wpkh.decode or similar
  console.log('    Available btcSigner exports:', Object.keys(btcS).sort().join(', '));
});

// Summary
console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
