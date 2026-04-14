// verify-e2e.js — End-to-end functional verification
// Tests: import → balance → tx build → PSBT → QR → decode
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
const n = sandbox.nugap;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'fail'); }

// ============================================
// Replicate key template.html functions here
// ============================================

// bech32 decode (same as template)
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Decode(str) {
  str = str.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) return null;
  const hrp = str.slice(0, pos);
  const data = [];
  for (let i = pos + 1; i < str.length; i++) {
    const c = BECH32_CHARSET.indexOf(str[i]);
    if (c === -1) return null;
    data.push(c);
  }
  const ENC_BECH32 = 1, ENC_BECH32M = 0x2bc830a3;
  function polymod(values) {
    const GEN = [0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
    let chk = 1;
    for (const v of values) { const b = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ v; for (let i=0;i<5;i++) if ((b>>i)&1) chk ^= GEN[i]; }
    return chk;
  }
  function hrpExpand(h) { const r=[]; for(const c of h) r.push(c.charCodeAt(0)>>5); r.push(0); for(const c of h) r.push(c.charCodeAt(0)&31); return r; }
  const chk = polymod(hrpExpand(hrp).concat(data));
  let encoding = null;
  if (chk === ENC_BECH32) encoding = 'bech32';
  else if (chk === ENC_BECH32M) encoding = 'bech32m';
  else return null;
  const dp = data.slice(0, -6);
  const witnessVer = dp[0];
  const payload = [];
  let acc = 0, bits = 0;
  for (let i = 1; i < dp.length; i++) {
    acc = (acc << 5) | dp[i]; bits += 5;
    if (bits >= 8) { bits -= 8; payload.push((acc >> bits) & 0xff); }
  }
  if (bits >= 5 || (acc << (8-bits)) & ((1<<8)-1)) return null;
  return { hrp, witnessVer, program: new Uint8Array(payload), encoding };
}

function validateAddress(addr) {
  if (/^[13]/.test(addr)) return { valid: false, error: 'Legacy' };
  if (/^tb1/i.test(addr)) return { valid: false, error: 'Testnet' };
  const dec = bech32Decode(addr);
  if (!dec || dec.hrp !== 'bc') return { valid: false, error: 'Invalid' };
  if (dec.witnessVer === 0 && dec.encoding !== 'bech32') return { valid: false, error: 'v0 must bech32' };
  if (dec.witnessVer > 0 && dec.encoding !== 'bech32m') return { valid: false, error: 'v1+ must bech32m' };
  if (dec.witnessVer === 0 && dec.program.length !== 20 && dec.program.length !== 32) return { valid: false, error: 'Bad wpkh len' };
  if (dec.witnessVer === 1 && dec.program.length !== 32) return { valid: false, error: 'Bad tr len' };
  return { valid: true, type: dec.witnessVer === 0 ? 'p2wpkh' : 'p2tr' };
}

// b58
function b58decode(str) {
  const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let nn = 0n;
  for (const c of str) { const i = ALPHA.indexOf(c); if (i < 0) return null; nn = nn * 58n + BigInt(i); }
  const bytes = [];
  let h = nn.toString(16); if (h.length % 2) h = '0' + h;
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i,i+2), 16));
  for (const c of str) { if (c === '1') bytes.unshift(0); else break; }
  const arr = new Uint8Array(bytes);
  const payload = arr.slice(0, -4);
  const checksum = arr.slice(-4);
  const hash1 = n.sha256(payload);
  const hash2 = n.sha256(hash1);
  for (let i = 0; i < 4; i++) { if (hash2[i] !== checksum[i]) return null; }
  return payload;
}

function b58encode(bytes) {
  const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let nn = 0n;
  for (const b of bytes) nn = nn * 256n + BigInt(b);
  let str = '';
  while (nn > 0n) { str = ALPHA[Number(nn % 58n)] + str; nn /= 58n; }
  for (const b of bytes) { if (b === 0) str = '1' + str; else break; }
  return str;
}

function convertZpubToXpub(zpubStr) {
  const data = b58decode(zpubStr);
  if (!data || data.length !== 78) return null;
  const xpubData = new Uint8Array(data);
  xpubData[0]=0x04; xpubData[1]=0x88; xpubData[2]=0xB2; xpubData[3]=0x1E;
  const hash1 = n.sha256(xpubData);
  const hash2 = n.sha256(hash1);
  const full = new Uint8Array(82);
  full.set(xpubData); full.set(hash2.slice(0,4), 78);
  return b58encode(full);
}

// ============================================
// Tests
// ============================================

console.log('\n=== Address Validation ===');
test('Valid bc1q address', () => {
  const r = validateAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  assert(r.valid, 'Should be valid');
  assert(r.type === 'p2wpkh', 'Should be p2wpkh');
});
test('Valid bc1p (taproot) address', () => {
  const r = validateAddress('bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297');
  assert(r.valid, 'Should be valid');
  assert(r.type === 'p2tr', 'Should be p2tr');
});
test('Reject legacy 1... address', () => {
  const r = validateAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
  assert(!r.valid, 'Should reject');
});
test('Reject testnet tb1', () => {
  const r = validateAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx');
  assert(!r.valid, 'Should reject testnet');
});
test('Reject invalid checksum', () => {
  const r = validateAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5'); // changed last char
  assert(!r.valid, 'Should reject bad checksum');
});

console.log('\n=== HD Key Derivation (Fixed) ===');
test('zpub → xpub conversion', () => {
  // Use a known zpub
  const zpub = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
  const xpub = convertZpubToXpub(zpub);
  assert(xpub !== null, 'Conversion should not return null');
  assert(xpub.startsWith('xpub'), 'Should start with xpub, got: ' + xpub);
  console.log('    zpub →', xpub.slice(0, 20) + '...');
});

test('BIP-84 address derivation gives bc1q addresses', () => {
  const zpub = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
  const xpub = convertZpubToXpub(zpub);
  const hd = n.HDKey.fromExtendedKey(xpub);
  const child = hd.deriveChild(0).deriveChild(0);
  // FIXED: use .address directly
  const addr = n.btcSigner.p2wpkh(child.publicKey).address;
  assert(addr.startsWith('bc1q'), 'Should be bc1q, got: ' + addr);
  console.log('    First receive:', addr);
});

test('BIP-86 address derivation gives bc1p addresses', () => {
  const testXpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
  const hd = n.HDKey.fromExtendedKey(testXpub);
  const child = hd.deriveChild(0).deriveChild(0);
  const xonly = child.publicKey.slice(1);
  // FIXED: use .address directly
  const addr = n.btcSigner.p2tr(xonly).address;
  assert(addr.startsWith('bc1p'), 'Should be bc1p, got: ' + addr);
  console.log('    First receive:', addr);
});

console.log('\n=== PSBT Construction ===');
test('Build PSBT with OutScript.encode fix', () => {
  const testXpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
  const hd = n.HDKey.fromExtendedKey(testXpub);
  const child = hd.deriveChild(0).deriveChild(0);
  const addr = n.btcSigner.p2wpkh(child.publicKey).address;

  const tx = new n.btcSigner.Transaction();
  
  // The FIXED witnessUtxo script generation
  const decoded = n.btcSigner.Address().decode(addr);
  const script = n.btcSigner.OutScript.encode(decoded);
  
  tx.addInput({
    txid: 'a'.repeat(64),
    index: 0,
    witnessUtxo: { script, amount: BigInt(100000) },
  });
  tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(90000));
  
  const psbt = tx.toPSBT();
  assert(psbt.length > 0, 'PSBT should not be empty');
  console.log('    PSBT size:', psbt.length, 'bytes');
  
  // Round trip
  const tx2 = n.btcSigner.Transaction.fromPSBT(psbt);
  assert(tx2.inputsLength === 1, 'Should have 1 input');
  assert(tx2.outputsLength === 1, 'Should have 1 output');
  console.log('    Round-trip: OK');
});

console.log('\n=== BC-UR Encode/Decode (crypto-psbt) ===');
test('UR round trip with crypto-psbt type', () => {
  // Fake PSBT bytes
  const psbtBytes = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x00, 0x52, 0x02, 0x00, 0x00, 0x00, 0x01]);
  
  // CBOR encode (same as template fix)
  function cborEncodeBytes(buf) {
    const len = buf.length;
    if (len < 24) {
      const out = new Uint8Array(1 + len); out[0] = 0x40 + len; out.set(buf, 1); return out;
    } else if (len < 256) {
      const out = new Uint8Array(2 + len); out[0] = 0x58; out[1] = len; out.set(buf, 2); return out;
    } else {
      const out = new Uint8Array(3 + len); out[0] = 0x59; out[1] = (len >> 8) & 0xff; out[2] = len & 0xff; out.set(buf, 3); return out;
    }
  }
  
  const cborPayload = cborEncodeBytes(psbtBytes);
  const ur = new n.UR(Buffer.from(cborPayload), 'crypto-psbt');
  assert(ur.type === 'crypto-psbt', 'Type should be crypto-psbt, got: ' + ur.type);
  
  // Encode
  const encoder = new n.UREncoder(ur, 200);
  const part = encoder.nextPart();
  assert(part.includes('crypto-psbt'), 'Part should contain crypto-psbt');
  console.log('    Encoded:', part);
  
  // Decode
  const decoder = new n.URDecoder();
  decoder.receivePart(part);
  assert(decoder.isComplete(), 'Should be complete');
  assert(decoder.isSuccess(), 'Should be success');
  const result = decoder.resultUR();
  assert(result.type === 'crypto-psbt', 'Decoded type should be crypto-psbt');
  
  // Get bytes back
  const decoded = result.decodeCBOR();
  assert(decoded.length === psbtBytes.length, 'Length mismatch');
  for (let i = 0; i < decoded.length; i++) {
    assert(decoded[i] === psbtBytes[i], `Byte ${i} mismatch`);
  }
  console.log('    Round-trip verified!');
});

console.log('\n=== UTXO Selection Logic ===');
test('UTXO selection basic', () => {
  // Simulate the selectUtxos function
  const utxos = [
    { value: 50000, txid: 'a'.repeat(64), vout: 0 },
    { value: 30000, txid: 'b'.repeat(64), vout: 1 },
    { value: 10000, txid: 'c'.repeat(64), vout: 0 },
  ];
  
  // Sort descending
  utxos.sort((a,b) => b.value - a.value);
  assert(utxos[0].value === 50000, 'Sort failed');
  
  const targetSats = 40000;
  const feeRate = 2;
  const inputVB = 68; // P2WPKH
  
  let total = 0;
  const selected = [];
  for (const u of utxos) {
    selected.push(u);
    total += u.value;
    const estVsize = Math.ceil(selected.length * inputVB + 2 * 31 + 10.5);
    const estFee = estVsize * feeRate;
    if (total >= targetSats + estFee) {
      const change = total - targetSats - estFee;
      if (change > 0 && change < 546) {
        console.log('    Dust change detected, absorbing');
      } else {
        console.log(`    Selected ${selected.length} UTXOs, fee: ${estFee}, change: ${change}`);
      }
      break;
    }
  }
  assert(selected.length > 0, 'Should select at least 1 UTXO');
  assert(total >= targetSats, 'Should have enough funds');
});

console.log('\n=== Amount Conversion ===');
test('satsToBtc precision', () => {
  const satsToBtc = (s) => (Number(s) / 1e8).toFixed(8);
  assert(satsToBtc(100000000) === '1.00000000', '1 BTC');
  assert(satsToBtc(1) === '0.00000001', '1 sat');
  assert(satsToBtc(0) === '0.00000000', '0');
  assert(satsToBtc(2100000000000000) === '21000000.00000000', '21M BTC');
});
test('btcToSats precision', () => {
  const btcToSats = (b) => Math.round(parseFloat(b) * 1e8);
  assert(btcToSats('1.0') === 100000000, '1 BTC');
  assert(btcToSats('0.00000001') === 1, '1 sat');
  assert(btcToSats('0.001') === 100000, '0.001 BTC');
});

// Summary
console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
else console.log('🎉 All functional verifications PASSED!');
