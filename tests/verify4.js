// verify4.js — Check creating UR with correct type
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

// Try creating UR with specific type via constructor
const data = Buffer.from('70736274ff0100520200000001', 'hex');

// Method 1: new UR(cbor, type) — but cbor needs to be CBOR-encoded
// The cbor property is the CBOR-encoded payload
// For crypto-psbt, the CBOR encoding is just a bytestring wrapping

// Let's CBOR-encode the data (major type 2 = byte string)
function cborEncodeBytes(buf) {
  if (buf.length < 24) {
    return Buffer.concat([Buffer.from([0x40 + buf.length]), buf]);
  } else if (buf.length < 256) {
    return Buffer.concat([Buffer.from([0x58, buf.length]), buf]);
  } else if (buf.length < 65536) {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(buf.length);
    return Buffer.concat([Buffer.from([0x59]), len, buf]);
  } else {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(buf.length);
    return Buffer.concat([Buffer.from([0x5a]), len, buf]);
  }
}

const cborPayload = cborEncodeBytes(data);
console.log('CBOR payload:', cborPayload.toString('hex'));

try {
  const ur = new UR(cborPayload, 'crypto-psbt');
  console.log('Created UR type:', ur.type);
  console.log('UR cbor:', ur.cbor.toString('hex'));
  
  const encoder = new UREncoder(ur, 200);
  const part = encoder.nextPart();
  console.log('Encoded part:', part);
  // Should contain crypto-psbt in the URI
  console.log('Contains crypto-psbt:', part.includes('crypto-psbt'));
  
  // Decode
  const decoder = new URDecoder();
  decoder.receivePart(part);
  console.log('Complete:', decoder.isComplete());
  if (decoder.isComplete() && decoder.isSuccess()) {
    const result = decoder.resultUR();
    console.log('Decoded type:', result.type);
    const decoded = result.decodeCBOR();
    console.log('Decoded data:', decoded.toString('hex'));
    console.log('Matches original:', data.equals(decoded));
  }
} catch(e) {
  console.log('new UR(cbor, type) FAILED:', e.message);
}
