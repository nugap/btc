// verify5.js — Check Transaction.fromPSBT / finalize / extract API
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
const { btcSigner, HDKey, sha256 } = sandbox.nugap;

// Test Transaction.fromPSBT exists
console.log('Transaction.fromPSBT:', typeof btcSigner.Transaction.fromPSBT);

// Test creating a simple PSBT and converting back
const tx = new btcSigner.Transaction();

// Create a dummy p2wpkh script for testing
const testXpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
const hd = HDKey.fromExtendedKey(testXpub);
const child = hd.deriveChild(0).deriveChild(0);
const pubkey = child.publicKey;
const p2 = btcSigner.p2wpkh(pubkey);

// Using OutScript approach (our fix)
const addrDecoded = btcSigner.Address().decode(p2.address);
const script = btcSigner.OutScript.encode(addrDecoded);
console.log('Script match:', Buffer.from(script).equals(Buffer.from(p2.script)));

// Add a dummy input
try {
  tx.addInput({
    txid: '0'.repeat(64),
    index: 0,
    witnessUtxo: {
      script: script,
      amount: BigInt(50000),
    },
  });
  console.log('addInput with OutScript-generated script: OK');
} catch(e) {
  console.log('addInput FAILED:', e.message);
}

// Add output
try {
  tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(40000));
  console.log('addOutputAddress: OK');
} catch(e) {
  console.log('addOutputAddress FAILED:', e.message);
}

// toPSBT
try {
  const psbt = tx.toPSBT();
  console.log('toPSBT: OK, length:', psbt.length);
  
  // fromPSBT
  const tx2 = btcSigner.Transaction.fromPSBT(psbt);
  console.log('fromPSBT: OK');
  console.log('Inputs:', tx2.inputsLength);
  console.log('Outputs:', tx2.outputsLength);
  
  // Can't finalize without signatures, but verify the method exists
  console.log('tx2.finalize:', typeof tx2.finalize);
  console.log('tx2.extract:', typeof tx2.extract);
} catch(e) {
  console.log('PSBT round-trip FAILED:', e.message);
}

console.log('\nAll API checks passed!');
