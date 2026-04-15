#!/usr/bin/env node
// test-e2e.js — End-to-end test simulating hodl ↔ yolo air-gapped flow
// Run: node build/test-e2e.js

const { HDKey } = require('@scure/bip32');
const { mnemonicToSeedSync } = require('@scure/bip39');
const btc = require('@scure/btc-signer');
const { UR, UREncoder, URDecoder } = require('@ngraveio/bc-ur');

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';
let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ${PASS} ${msg}`); passed++; }
  else { console.log(`  ${FAIL} ${msg}`); failed++; }
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i/2] = parseInt(hex.slice(i,i+2), 16);
  return bytes;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
}

// CBOR encode bytes (same as in template)
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

// Extract raw bytes from UR CBOR (same as extractURBytes in templates)
function extractURBytes(ur) {
  const raw = ur.cbor;
  const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const first = buf[0];
  if (first >= 0x40 && first <= 0x57) return buf.slice(1, 1 + (first - 0x40));
  if (first === 0x58) return buf.slice(2, 2 + buf[1]);
  if (first === 0x59) return buf.slice(3, 3 + ((buf[1] << 8) | buf[2]));
  if (first === 0x5a) return buf.slice(5, 5 + ((buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4]));
  return new Uint8Array(ur.decodeCBOR());
}

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// ======================================================================
console.log('\n🧪 nugap e2e test — air-gapped Taproot signing flow\n');

// --- Step 1: Key derivation (hodl side) ---
console.log('📋 Step 1: Key derivation (hodl)');
const seed = mnemonicToSeedSync(MNEMONIC);
const master = HDKey.fromMasterSeed(seed);

// BIP-86 Taproot (coin type 0 — Unisat compatible)
const acc86 = master.derive("m/86'/0'/0'");
const child86 = acc86.deriveChild(0).deriveChild(0);
const xonly = child86.publicKey.slice(1);

// BIP-84 SegWit
const acc84 = master.derive("m/84'/0'/0'");
const child84 = acc84.deriveChild(0).deriveChild(0);

for (const [net, netObj, expectedTR, expectedSW] of [
  ['mainnet', btc.NETWORK,
   'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
   'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'],
  ['testnet4', btc.TEST_NETWORK,
   'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv',
   'tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0'],
]) {
  const addrTR = btc.p2tr(xonly, undefined, netObj).address;
  const addrSW = btc.p2wpkh(child84.publicKey, netObj).address;
  assert(addrTR === expectedTR, `${net} Taproot address`);
  assert(addrSW === expectedSW, `${net} SegWit address`);
}

// --- Step 2: PSBT construction (yolo side) ---
console.log('\n📋 Step 2: PSBT construction (yolo)');
const net = btc.TEST_NETWORK;
const p2trOut = btc.p2tr(xonly, undefined, net);
const senderAddr = p2trOut.address;

const tx = new btc.Transaction();
tx.addInput({
  txid: 'a'.repeat(64),  // fake txid for testing
  index: 0,
  witnessUtxo: { script: p2trOut.script, amount: BigInt(100000) },
  tapInternalKey: xonly,
});

const recipientAddr = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
tx.addOutputAddress(recipientAddr, BigInt(50000), net);
tx.addOutputAddress(senderAddr, BigInt(49000), net); // change

const psbtBytes = tx.toPSBT();
assert(psbtBytes.length > 0, `PSBT created (${psbtBytes.length} bytes)`);

// Verify PSBT round-trips
const txCheck = btc.Transaction.fromPSBT(psbtBytes);
const inp = txCheck.getInput(0);
assert(!!inp.tapInternalKey, 'PSBT has tapInternalKey');
assert(inp.tapInternalKey.length === 32, 'tapInternalKey is 32 bytes (x-only)');

// --- Step 3: UR encoding (yolo → hodl) ---
console.log('\n📋 Step 3: UR encode/decode (yolo → hodl)');
const cborPayload = cborEncodeBytes(psbtBytes);
const ur = new UR(Buffer.from(cborPayload), 'crypto-psbt');

// Single frame
const encoder1 = new UREncoder(ur, psbtBytes.length + 200);
const singlePart = encoder1.nextPart();
assert(singlePart.startsWith('ur:crypto-psbt/'), 'UR part has correct type');

// Decode single frame
const decoder1 = new URDecoder();
decoder1.receivePart(singlePart);
assert(decoder1.isComplete() && decoder1.isSuccess(), 'Single-frame UR decodes');
const decodedUR1 = decoder1.resultUR();
const decodedPsbt1 = extractURBytes(decodedUR1);
assert(bytesToHex(decodedPsbt1) === bytesToHex(psbtBytes), 'UR round-trip matches (single frame)');

// Multi-frame (fountain)
const encoder2 = new UREncoder(ur, 50); // small fragment → multiple parts
const parts = [];
for (let i = 0; i < encoder2.fragmentsLength + 2; i++) {
  parts.push(encoder2.nextPart());
}
assert(parts.length > 1, `Fountain encoder created ${parts.length} parts`);

const decoder2 = new URDecoder();
for (const part of parts) {
  decoder2.receivePart(part);
  if (decoder2.isComplete()) break;
}
assert(decoder2.isComplete() && decoder2.isSuccess(), 'Multi-frame UR decodes');
const decodedPsbt2 = extractURBytes(decoder2.resultUR());
assert(bytesToHex(decodedPsbt2) === bytesToHex(psbtBytes), 'UR round-trip matches (fountain)');

// --- Step 4: Sign (hodl side) ---
console.log('\n📋 Step 4: PSBT signing (hodl)');
const txSign = btc.Transaction.fromPSBT(decodedPsbt1);
txSign.signIdx(child86.privateKey, 0);
const signedPsbt = txSign.toPSBT();
assert(signedPsbt.length > psbtBytes.length, `Signed PSBT is larger (${signedPsbt.length} > ${psbtBytes.length})`);

// Verify NOT finalized yet
const txCheck2 = btc.Transaction.fromPSBT(signedPsbt);
let extractFailed = false;
try { txCheck2.extract(); } catch(e) { extractFailed = true; }
assert(extractFailed, 'Signed PSBT is not yet finalized (extract should fail)');

// --- Step 5: UR encode signed PSBT (hodl → yolo) ---
console.log('\n📋 Step 5: UR encode signed PSBT (hodl → yolo)');
const signedCbor = cborEncodeBytes(signedPsbt);
const signedUR = new UR(Buffer.from(signedCbor), 'crypto-psbt');
const signedEncoder = new UREncoder(signedUR, signedPsbt.length + 200);
const signedPart = signedEncoder.nextPart();

const signedDecoder = new URDecoder();
signedDecoder.receivePart(signedPart);
assert(signedDecoder.isComplete() && signedDecoder.isSuccess(), 'Signed UR decodes');
const decodedSignedPsbt = extractURBytes(signedDecoder.resultUR());
assert(bytesToHex(decodedSignedPsbt) === bytesToHex(signedPsbt), 'Signed UR round-trip matches');

// --- Step 6: Finalize & extract (yolo side) ---
console.log('\n📋 Step 6: Finalize & broadcast (yolo)');
const txFinal = btc.Transaction.fromPSBT(decodedSignedPsbt);
txFinal.finalize();
const rawTx = txFinal.extract();
assert(rawTx.length > 0, `Raw TX extracted (${rawTx.length} bytes)`);

const txHex = bytesToHex(rawTx);
assert(txHex.length > 0, `TX hex: ${txHex.slice(0, 40)}...`);

// --- Summary ---
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\x1b[31m\n⚠️  SOME TESTS FAILED\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32m\n🎉 ALL TESTS PASSED — air-gapped flow is working!\x1b[0m');
}
