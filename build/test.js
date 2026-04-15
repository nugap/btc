const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const PASS = '\x1b[32m✅\x1b[0m';
const FAIL = '\x1b[31m❌\x1b[0m';
let passed = 0, failed = 0;
const errors = [];

const assert = (cond, msg) => {
  if (cond) { console.log('  ' + PASS + ' ' + msg); passed++; }
  else { console.log('  ' + FAIL + ' ' + msg); failed++; errors.push(msg); }
};

const loadHtml = name => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
  return new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost' });
};

console.log('\n🧪 Browser E2E — 4-file build\n');

console.log('📋 Step 1: Load all 4 HTML files');
const yolo = loadHtml('yolo.html');
const yoloTest = loadHtml('yolo_test.html');
const hodl = loadHtml('hodl.html');
const hodlTest = loadHtml('hodl_test.html');

assert(typeof yolo.window.nugap !== 'undefined', 'yolo.html: nugap exists');
assert(typeof yoloTest.window.nugap !== 'undefined', 'yolo_test.html: nugap exists');
assert(typeof hodl.window.nugap !== 'undefined', 'hodl.html: nugap exists');
assert(typeof hodlTest.window.nugap !== 'undefined', 'hodl_test.html: nugap exists');

console.log('\n📋 Step 2: hodl_test — derive keys from mnemonic');
const keys = hodlTest.window.eval("(function() {\
  const seed = nugap.mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');\
  const master = nugap.HDKey.fromMasterSeed(seed);\
  const child = master.derive(\"m/86'/0'/0'\").deriveChild(0).deriveChild(0);\
  const xo = child.publicKey.slice(1);\
  const net = nugap.btcSigner.TEST_NETWORK;\
  const p2tr = nugap.btcSigner.p2tr(xo, undefined, net);\
  return { addr: p2tr.address, xo: Array.from(xo), script: Array.from(p2tr.script), privKey: Array.from(child.privateKey) };\
})()");
assert(keys.addr === 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv', 'hodl_test: address matches reference');

console.log('\n📋 Step 3: yolo_test — create unsigned PSBT');
const xoHex = keys.xo.map(b => b.toString(16).padStart(2, '0')).join('');
const scriptHex = keys.script.map(b => b.toString(16).padStart(2, '0')).join('');
const unsignedB64 = yoloTest.window.eval("(function() {\
  const net = nugap.btcSigner.TEST_NETWORK;\
  const xo = new Uint8Array(" + JSON.stringify(keys.xo) + ");\
  const script = new Uint8Array(" + JSON.stringify(keys.script) + ");\
  const tx = new nugap.btcSigner.Transaction();\
  tx.addInput({ txid: 'c'.repeat(64), index: 0, witnessUtxo: { script: script, amount: BigInt(100000) }, tapInternalKey: xo });\
  tx.addOutputAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', BigInt(50000), net);\
  const psbt = tx.toPSBT();\
  let bin = ''; for (let i = 0; i < psbt.length; i++) bin += String.fromCharCode(psbt[i]);\
  return btoa(bin);\
})()");
assert(unsignedB64 && unsignedB64.startsWith('cHNidP8'), 'yolo_test: PSBT created (base64)');

console.log('\n📋 Step 4: hodl_test — sign PSBT');
const signedB64 = hodlTest.window.eval("(function() {\
  const b64 = '" + unsignedB64 + "';\
  const bin = atob(b64);\
  const psbt = new Uint8Array(bin.length);\
  for (let i = 0; i < bin.length; i++) psbt[i] = bin.charCodeAt(i);\
  const tx = nugap.btcSigner.Transaction.fromPSBT(psbt);\
  const privKey = new Uint8Array(" + JSON.stringify(keys.privKey) + ");\
  tx.signIdx(privKey, 0);\
  const signed = tx.toPSBT();\
  let sbin = ''; for (let i = 0; i < signed.length; i++) sbin += String.fromCharCode(signed[i]);\
  return btoa(sbin);\
})()");
assert(signedB64 && signedB64.length > unsignedB64.length, 'hodl_test: signed PSBT larger than unsigned');

console.log('\n📋 Step 5: yolo_test — finalize signed PSBT');
const finalResult = yoloTest.window.eval("(function() {\
  const b64 = '" + signedB64 + "';\
  const bin = atob(b64);\
  const psbt = new Uint8Array(bin.length);\
  for (let i = 0; i < bin.length; i++) psbt[i] = bin.charCodeAt(i);\
  const tx = nugap.btcSigner.Transaction.fromPSBT(psbt);\
  tx.finalize();\
  const raw = tx.extract();\
  return { rawLen: raw.length };\
})()");
assert(finalResult.rawLen > 0, 'yolo_test: finalized TX (' + finalResult.rawLen + 'B)');

console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.log('\x1b[31m\n⚠️  SOME TESTS FAILED\x1b[0m');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
} else console.log('\x1b[32m\n🎉 ALL TESTS PASSED!\x1b[0m');
