// verify3.js — Check UR decode API
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
const { UR, UREncoder, URDecoder } = sandbox.nugap;

// Create a fake PSBT (just some bytes)
const data = Buffer.from('70736274ff0100520200000001', 'hex');
const ur = UR.fromBuffer(data, 'crypto-psbt');
console.log('UR type:', ur.type);
console.log('UR keys:', Object.keys(ur));
console.log('UR.cbor:', ur.cbor);
console.log('UR.decodeCBOR:', typeof ur.decodeCBOR);

// Encode then decode
const encoder = new UREncoder(ur, 200);
const parts = [];
for (let i = 0; i < 5; i++) parts.push(encoder.nextPart());
console.log('Encoded parts:', parts);

const decoder = new URDecoder();
for (const p of parts) {
  decoder.receivePart(p);
  if (decoder.isComplete()) break;
}
console.log('Complete:', decoder.isComplete());
console.log('Success:', decoder.isSuccess());
const resultUR = decoder.resultUR();
console.log('resultUR type:', resultUR.type);
console.log('resultUR keys:', Object.keys(resultUR));
console.log('resultUR.cbor:', resultUR.cbor);
console.log('resultUR.decodeCBOR:', typeof resultUR.decodeCBOR);

// Try to get the bytes back
if (resultUR.decodeCBOR) {
  try {
    const decoded = resultUR.decodeCBOR();
    console.log('decodeCBOR result:', decoded);
  } catch(e) {
    console.log('decodeCBOR FAILED:', e.message);
  }
}
if (resultUR.cbor) {
  console.log('cbor value:', resultUR.cbor);
  console.log('cbor is Buffer?', Buffer.isBuffer(resultUR.cbor));
}

// The actual way to get bytes from UR
console.log('\n--- UR internal structure ---');
const proto = Object.getPrototypeOf(resultUR);
console.log('Proto methods:', Object.getOwnPropertyNames(proto));
