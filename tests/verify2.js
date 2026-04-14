// verify2.js — Check script generation from address
'use strict';
const vm = require('vm');
const fs = require('fs');
const bundleCode = fs.readFileSync(__dirname + '/bundle.js', 'utf8');
const sandbox = { 
  Buffer, console, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
  Float32Array, Float64Array, BigInt64Array, BigUint64Array, ArrayBuffer, SharedArrayBuffer,
  DataView, TextEncoder: require('util').TextEncoder, TextDecoder: require('util').TextDecoder,
  process, globalThis: {}, self: {}, window: {}, navigator: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  crypto: require('crypto').webcrypto || require('crypto'), URL, URLSearchParams,
};
sandbox.global = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(bundleCode, ctx);
const { btcSigner, HDKey, sha256, ripemd160 } = sandbox.nugap;

// Test 1: Address generation using .address directly
const testXpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
const hd = HDKey.fromExtendedKey(testXpub);
const child = hd.deriveChild(0).deriveChild(0);
const pubkey = child.publicKey;

// Current template method (BROKEN):
const broken = btcSigner.Address(btcSigner.p2wpkh(pubkey)).toString();
console.log('BROKEN method result:', broken); // [object Object]

// Correct method:
const correct = btcSigner.p2wpkh(pubkey).address;
console.log('CORRECT address:', correct); // bc1q...

// Test 2: p2tr address
const xonly = pubkey.slice(1);
const brokenTr = btcSigner.Address(btcSigner.p2tr(xonly)).toString();
console.log('BROKEN p2tr:', brokenTr);
const correctTr = btcSigner.p2tr(xonly).address;
console.log('CORRECT p2tr:', correctTr);

// Test 3: Script from address for witnessUtxo
console.log('\n--- Script from address ---');
const addr = correct;
const decoded = btcSigner.Address().decode(addr);
console.log('Address().decode result:', decoded);
console.log('Has .script?', 'script' in decoded);

// Check what p2wpkh gives
const p2 = btcSigner.p2wpkh(pubkey);
console.log('p2wpkh keys:', Object.keys(p2));
console.log('p2wpkh.script:', p2.script);

// The right way to get script from an address:
// Option A: OutScript.encode from decoded address
const encoded = btcSigner.OutScript.encode(decoded);
console.log('OutScript.encode(decoded):', encoded);

// Option B: Use p2wpkh/p2tr directly for known types
// But we need to go from address string → script

// Option C: Use getAddress 
console.log('getAddress:', typeof btcSigner.getAddress);

// Let's check if there's a way to get payment from address
console.log('\n--- Finding address→script path ---');

// Try: Address(NETWORK).encode(decoded) — maybe encode gives script?
const addrCodec = btcSigner.Address();
const fromDecoded = addrCodec.decode(addr);
console.log('decode gives:', fromDecoded);

// The OutScript.encode approach:
const script = btcSigner.OutScript.encode(fromDecoded);
console.log('Script from OutScript.encode:', Buffer.from(script).toString('hex'));

// Verify it matches p2wpkh script
console.log('p2wpkh script:', Buffer.from(p2.script).toString('hex'));
console.log('Match:', Buffer.from(script).equals(Buffer.from(p2.script)));

// Test with a P2TR address
console.log('\n--- P2TR script ---');
const trAddr = correctTr;
const trDecoded = addrCodec.decode(trAddr);
console.log('P2TR decode:', trDecoded);
const trScript = btcSigner.OutScript.encode(trDecoded);
console.log('P2TR script:', Buffer.from(trScript).toString('hex'));
const trP2 = btcSigner.p2tr(xonly);
console.log('p2tr.script:', Buffer.from(trP2.script).toString('hex'));
console.log('Match:', Buffer.from(trScript).equals(Buffer.from(trP2.script)));

// Test 4: UR.fromBuffer - template uses UR.fromBuffer which might not exist
console.log('\n--- UR API ---');
const { UR } = sandbox.nugap;
console.log('UR keys:', Object.keys(UR));
console.log('UR.fromBuffer:', typeof UR.fromBuffer);
// Try creating UR
try {
  const ur = UR.fromBuffer(Buffer.from('deadbeef', 'hex'), 'crypto-psbt');
  console.log('UR created, type:', ur.type);
} catch(e) {
  console.log('UR.fromBuffer FAILED:', e.message);
  // Maybe need new UR(type, cbor) instead
  try {
    const ur = new UR(Buffer.from('deadbeef', 'hex'), 'crypto-psbt');
    console.log('new UR() created, type:', ur.type);
  } catch(e2) {
    console.log('new UR() also FAILED:', e2.message);
  }
}

// Test 5: Check sha256 returns Uint8Array (template assumes this)
console.log('\n--- sha256 output ---');
const h = sandbox.nugap.sha256(new Uint8Array([1,2,3]));
console.log('sha256 result type:', h.constructor.name, 'length:', h.length);

// Test 6: ripemd160
const r = sandbox.nugap.ripemd160(h);
console.log('ripemd160 result type:', r.constructor.name, 'length:', r.length);

console.log('\nDone!');
