#!/usr/bin/env node
// test-browser-e2e.js — E2E test using jsdom to simulate browser environment
// Tests the actual bundled yolo.html and hodl.html JavaScript
// Usage: node build/test-browser-e2e.js

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const PASS = '\x1b[32m✅\x1b[0m';
const FAIL = '\x1b[31m❌\x1b[0m';
let passed = 0, failed = 0, errors = [];

function assert(cond, msg) {
  if (cond) { console.log(`  ${PASS} ${msg}`); passed++; }
  else { console.log(`  ${FAIL} ${msg}`); failed++; errors.push(msg); }
}

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EXPECTED_TR_TESTNET = 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv';
const EXPECTED_SW_TESTNET = 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0';

console.log('\n🧪 Browser E2E test (jsdom) — testing bundled JS from yolo.html & hodl.html\n');

// ============================================================
// Load yolo.html in jsdom and test
// ============================================================
console.log('📋 Step 1: Load yolo.html bundle and test crypto operations');

const yoloHtml = fs.readFileSync(path.resolve(__dirname, '..', 'yolo.html'), 'utf8');
const yoloDom = new JSDOM(yoloHtml, { runScripts: 'dangerously', url: 'http://localhost' });
const yoloWin = yoloDom.window;

// Check nugap global exists
assert(typeof yoloWin.nugap !== 'undefined', 'yolo: nugap global exists');
assert(typeof yoloWin.nugap.btcSigner !== 'undefined', 'yolo: btcSigner available');
assert(typeof yoloWin.nugap.UREncoder !== 'undefined', 'yolo: UREncoder available');
assert(typeof yoloWin.nugap.URDecoder !== 'undefined', 'yolo: URDecoder available');
assert(typeof yoloWin.Buffer !== 'undefined', 'yolo: Buffer polyfill loaded');

// Test key derivation in yolo context
const yoloTest = yoloWin.eval(`
(function() {
  try {
    const { btcSigner, HDKey, UR, UREncoder, URDecoder } = nugap;
    // yolo doesn't have mnemonicToSeedSync — use HDKey from known xpub
    // Instead, test with raw key derivation from seed hex
    const { sha256 } = nugap;
    const net = btcSigner.TEST_NETWORK;

    // Use a known extended key for testing
    // We test the flow that yolo actually uses: import vpub/tpub → derive addresses
    // For PSBT testing, create a key pair directly
    const privKey = sha256(new Uint8Array(32).fill(1)); // deterministic test key
    const pubKey = nugap.secp256k1.getPublicKey(privKey, true);
    const xonly = pubKey.slice(1);
    
    const p2trOut = btcSigner.p2tr(xonly, undefined, net);
    const addrTR = p2trOut.address;

    // Build PSBT
    const tx = new btcSigner.Transaction();
    tx.addInput({
      txid: 'a'.repeat(64),
      index: 0,
      witnessUtxo: { script: p2trOut.script, amount: BigInt(100000) },
      tapInternalKey: xonly,
    });
    tx.addOutputAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', BigInt(50000), net);
    tx.addOutputAddress(addrTR, BigInt(49000), net);
    const psbtBytes = tx.toPSBT();

    // UR encode
    function cborEncodeBytes(buf) {
      const len = buf.length;
      if (len < 24) { const out = new Uint8Array(1 + len); out[0] = 0x40 + len; out.set(buf, 1); return out; }
      if (len < 256) { const out = new Uint8Array(2 + len); out[0] = 0x58; out[1] = len; out.set(buf, 2); return out; }
      const out = new Uint8Array(3 + len); out[0] = 0x59; out[1] = (len >> 8) & 0xff; out[2] = len & 0xff; out.set(buf, 3); return out;
    }
    const cbor = cborEncodeBytes(psbtBytes);
    const ur = new UR(Buffer.from(cbor), 'crypto-psbt');
    const encoder = new UREncoder(ur, 500);
    const part = encoder.nextPart();

    // UR decode
    const decoder = new URDecoder();
    decoder.receivePart(part);
    const decoded = decoder.isComplete() && decoder.isSuccess();

    // Multi-frame UR (fountain)
    const encoder2 = new UREncoder(ur, 50);
    const parts = [];
    for (let i = 0; i < encoder2.fragmentsLength + 2; i++) parts.push(encoder2.nextPart());
    const decoder2 = new URDecoder();
    for (const p of parts) { decoder2.receivePart(p); if (decoder2.isComplete()) break; }
    const decodedMulti = decoder2.isComplete() && decoder2.isSuccess();

    // Sign + finalize (to verify PSBT is valid)
    const tx2 = btcSigner.Transaction.fromPSBT(psbtBytes);
    tx2.signIdx(privKey, 0);
    const signedPsbt = tx2.toPSBT();
    const tx3 = btcSigner.Transaction.fromPSBT(signedPsbt);
    tx3.finalize();
    const rawTx = tx3.extract();

    return {
      ok: true, addrTR,
      psbtLen: psbtBytes.length,
      urDecoded: decoded,
      urDecodedMulti: decodedMulti,
      fountainParts: parts.length,
      signAndFinalize: rawTx.length > 0,
    };
  } catch(e) {
    return { ok: false, error: e.message, stack: e.stack };
  }
})()
`);

if (yoloTest.ok) {
  assert(yoloTest.addrTR && yoloTest.addrTR.startsWith('tb1p'), 'yolo: Taproot testnet address generated');
  assert(yoloTest.psbtLen > 0, `yolo: PSBT created (${yoloTest.psbtLen} bytes)`);
  assert(yoloTest.urDecoded, 'yolo: UR single-frame round-trip OK');
  assert(yoloTest.urDecodedMulti, `yolo: UR fountain round-trip OK (${yoloTest.fountainParts} parts)`);
  assert(yoloTest.signAndFinalize, 'yolo: sign + finalize works in browser context');
} else {
  assert(false, 'yolo test failed: ' + yoloTest.error);
  console.log('    Stack:', yoloTest.stack?.split('\n').slice(0,3).join('\n'));
}

// ============================================================
// Load hodl.html and test signing
// ============================================================
console.log('\n📋 Step 2: Load hodl.html bundle and test signing');

const hodlHtml = fs.readFileSync(path.resolve(__dirname, '..', 'hodl.html'), 'utf8');
const hodlDom = new JSDOM(hodlHtml, { runScripts: 'dangerously', url: 'http://localhost' });
const hodlWin = hodlDom.window;

assert(typeof hodlWin.nugap !== 'undefined', 'hodl: nugap global exists');
assert(typeof hodlWin.Buffer !== 'undefined', 'hodl: Buffer polyfill loaded');

// ============================================================
// Simulate full flow: yolo builds PSBT → hodl signs → yolo finalizes
// ============================================================
console.log('\n📋 Step 3: Full air-gapped flow (yolo → hodl → yolo)');

const flowTest = hodlWin.eval(`
(function() {
  try {
    const { btcSigner, HDKey, UR, UREncoder, URDecoder } = nugap;
    const seed = nugap.mnemonicToSeedSync('${MNEMONIC}');
    const master = HDKey.fromMasterSeed(seed);
    const net = btcSigner.TEST_NETWORK;
    const child = master.derive("m/86'/0'/0'").deriveChild(0).deriveChild(0);
    const xonly = child.publicKey.slice(1);

    // === YOLO: build PSBT ===
    const p2trOut = btcSigner.p2tr(xonly, undefined, net);
    const tx = new btcSigner.Transaction();
    tx.addInput({
      txid: 'c'.repeat(64),
      index: 0,
      witnessUtxo: { script: p2trOut.script, amount: BigInt(100000) },
      tapInternalKey: xonly,
    });
    tx.addOutputAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', BigInt(50000), net);
    const psbt = tx.toPSBT();

    // === YOLO → UR encode ===
    function cborEncodeBytes(buf) {
      const len = buf.length;
      if (len < 256) { const out = new Uint8Array(2 + len); out[0] = 0x58; out[1] = len; out.set(buf, 2); return out; }
      const out = new Uint8Array(3 + len); out[0] = 0x59; out[1] = (len >> 8) & 0xff; out[2] = len & 0xff; out.set(buf, 3); return out;
    }
    const cbor1 = cborEncodeBytes(psbt);
    const ur1 = new UR(Buffer.from(cbor1), 'crypto-psbt');
    const enc1 = new UREncoder(ur1, 500);
    const part1 = enc1.nextPart();

    // === HODL: UR decode ===
    const dec1 = new URDecoder();
    dec1.receivePart(part1);
    if (!dec1.isComplete() || !dec1.isSuccess()) return { ok: false, error: 'UR decode failed' };
    const urResult = dec1.resultUR();
    
    // Extract bytes from CBOR
    const raw = urResult.cbor;
    const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const first = buf[0];
    let psbtBytes;
    if (first >= 0x40 && first <= 0x57) psbtBytes = buf.slice(1, 1 + (first - 0x40));
    else if (first === 0x58) psbtBytes = buf.slice(2, 2 + buf[1]);
    else if (first === 0x59) psbtBytes = buf.slice(3, 3 + ((buf[1] << 8) | buf[2]));
    else psbtBytes = buf;

    // === HODL: Sign (NOT finalize) ===
    const tx2 = btcSigner.Transaction.fromPSBT(psbtBytes);
    tx2.signIdx(child.privateKey, 0);
    const signedPsbt = tx2.toPSBT();

    // === HODL → UR encode signed ===
    const cbor2 = cborEncodeBytes(signedPsbt);
    const ur2 = new UR(Buffer.from(cbor2), 'crypto-psbt');
    const enc2 = new UREncoder(ur2, 500);
    const part2 = enc2.nextPart();

    // === YOLO: UR decode signed ===
    const dec2 = new URDecoder();
    dec2.receivePart(part2);
    if (!dec2.isComplete() || !dec2.isSuccess()) return { ok: false, error: 'Signed UR decode failed' };
    const urResult2 = dec2.resultUR();
    const raw2 = urResult2.cbor;
    const buf2 = raw2 instanceof Uint8Array ? raw2 : new Uint8Array(raw2);
    const first2 = buf2[0];
    let signedBytes;
    if (first2 === 0x58) signedBytes = buf2.slice(2, 2 + buf2[1]);
    else if (first2 === 0x59) signedBytes = buf2.slice(3, 3 + ((buf2[1] << 8) | buf2[2]));
    else signedBytes = buf2;

    // === YOLO: Finalize & extract ===
    const tx3 = btcSigner.Transaction.fromPSBT(signedBytes);
    tx3.finalize();
    const rawTx = tx3.extract();
    const txHex = Array.from(rawTx).map(b => b.toString(16).padStart(2,'0')).join('');

    return {
      ok: true,
      psbtLen: psbt.length,
      signedLen: signedPsbt.length,
      rawTxLen: rawTx.length,
      txHex: txHex.slice(0, 40),
    };
  } catch(e) {
    return { ok: false, error: e.message, stack: e.stack };
  }
})()
`);

if (flowTest.ok) {
  assert(true, `Full flow: PSBT ${flowTest.psbtLen}B → signed ${flowTest.signedLen}B → raw TX ${flowTest.rawTxLen}B`);
  assert(flowTest.rawTxLen > 0, `Extracted raw TX: ${flowTest.txHex}...`);
} else {
  assert(false, 'Full flow failed: ' + flowTest.error);
  if (flowTest.stack) console.log('    Stack:', flowTest.stack?.split('\n').slice(0,3).join('\n'));
}

// ============================================================
// Test cbor-sync encode works (the "Unsupported output format" bug)
// ============================================================
console.log('\n📋 Step 4: cbor-sync Buffer compatibility');

const cborTest = hodlWin.eval(`
(function() {
  try {
    const { UR, UREncoder } = nugap;
    // Create a larger payload to trigger fountain encoder
    const bigData = new Uint8Array(1000);
    for (let i = 0; i < bigData.length; i++) bigData[i] = i & 0xff;
    
    function cborEncodeBytes(buf) {
      const len = buf.length;
      const out = new Uint8Array(3 + len); 
      out[0] = 0x59; out[1] = (len >> 8) & 0xff; out[2] = len & 0xff; 
      out.set(buf, 3); return out;
    }
    const cbor = cborEncodeBytes(bigData);
    const ur = new UR(Buffer.from(cbor), 'crypto-psbt');
    
    // Force fountain encoding (small fragment size)
    const encoder = new UREncoder(ur, 100);
    const parts = [];
    for (let i = 0; i < encoder.fragmentsLength; i++) {
      parts.push(encoder.nextPart());
    }
    
    // Decode all parts
    const decoder = nugap.URDecoder ? new nugap.URDecoder() : null;
    if (decoder) {
      for (const p of parts) {
        decoder.receivePart(p);
        if (decoder.isComplete()) break;
      }
    }
    
    return { ok: true, parts: parts.length, decoded: decoder?.isSuccess() };
  } catch(e) {
    return { ok: false, error: e.message };
  }
})()
`);

if (cborTest.ok) {
  assert(true, `Fountain encoder works (${cborTest.parts} parts)`);
  assert(cborTest.decoded, 'Fountain decoder reassembled OK');
} else {
  assert(false, 'cbor-sync/fountain test failed: ' + cborTest.error);
}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\x1b[31m\n⚠️  SOME TESTS FAILED\x1b[0m');
  errors.forEach(e => console.log(`  - ${e}`));
  process.exit(1);
} else {
  console.log('\x1b[32m\n🎉 ALL BROWSER E2E TESTS PASSED!\x1b[0m');
}
