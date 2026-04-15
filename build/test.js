var { JSDOM } = require('jsdom');
var fs = require('fs');
var path = require('path');

var PASS = '\x1b[32m✅\x1b[0m';
var FAIL = '\x1b[31m❌\x1b[0m';
var passed = 0, failed = 0, errors = [];

function assert(cond, msg) {
  if (cond) { console.log('  ' + PASS + ' ' + msg); passed++; }
  else { console.log('  ' + FAIL + ' ' + msg); failed++; errors.push(msg); }
}

console.log('\n🧪 Browser E2E test (jsdom) — base64 PSBT flow\n');

console.log('📋 Step 1: Load yolo.html');
var yoloHtml = fs.readFileSync(path.resolve(__dirname, '..', 'yolo.html'), 'utf8');
var yoloDom = new JSDOM(yoloHtml, { runScripts: 'dangerously', url: 'http://localhost' });
var yoloWin = yoloDom.window;

assert(typeof yoloWin.nugap !== 'undefined', 'yolo: nugap global exists');
assert(typeof yoloWin.nugap.btcSigner !== 'undefined', 'yolo: btcSigner available');

var yoloTest = yoloWin.eval("(function() {\
  try {\
    var btcSigner = nugap.btcSigner;\
    var sha256 = nugap.sha256;\
    var net = btcSigner.TEST_NETWORK;\
    var privKey = sha256(new Uint8Array(32).fill(1));\
    var pubKey = nugap.secp256k1.getPublicKey(privKey, true);\
    var xo = pubKey.slice(1);\
    var p2tr = btcSigner.p2tr(xo, undefined, net);\
    var tx = new btcSigner.Transaction();\
    tx.addInput({ txid: 'a'.repeat(64), index: 0, witnessUtxo: { script: p2tr.script, amount: BigInt(100000) }, tapInternalKey: xo });\
    tx.addOutputAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', BigInt(50000), net);\
    var psbt = tx.toPSBT();\
    var bin = ''; for (var i = 0; i < psbt.length; i++) bin += String.fromCharCode(psbt[i]);\
    var b64 = btoa(bin);\
    var bin2 = atob(b64);\
    var psbt2 = new Uint8Array(bin2.length);\
    for (var i = 0; i < bin2.length; i++) psbt2[i] = bin2.charCodeAt(i);\
    var tx2 = btcSigner.Transaction.fromPSBT(psbt2);\
    tx2.signIdx(privKey, 0);\
    var signed = tx2.toPSBT();\
    var tx3 = btcSigner.Transaction.fromPSBT(signed);\
    tx3.finalize();\
    var raw = tx3.extract();\
    return { ok: true, psbtLen: psbt.length, b64Len: b64.length, signedLen: signed.length, rawLen: raw.length, addr: p2tr.address };\
  } catch(e) { return { ok: false, error: e.message, stack: e.stack }; }\
})()");

if (yoloTest.ok) {
  assert(true, 'yolo: PSBT created (' + yoloTest.psbtLen + ' bytes)');
  assert(yoloTest.b64Len > 0, 'yolo: base64 encode works (' + yoloTest.b64Len + ' chars)');
  assert(yoloTest.rawLen > 0, 'yolo: sign + finalize works (' + yoloTest.rawLen + ' bytes)');
  assert(yoloTest.addr.startsWith('tb1p'), 'yolo: taproot testnet address');
} else {
  assert(false, 'yolo test failed: ' + yoloTest.error);
}

console.log('\n📋 Step 2: Load hodl.html');
var hodlHtml = fs.readFileSync(path.resolve(__dirname, '..', 'hodl.html'), 'utf8');
var hodlDom = new JSDOM(hodlHtml, { runScripts: 'dangerously', url: 'http://localhost' });
var hodlWin = hodlDom.window;

assert(typeof hodlWin.nugap !== 'undefined', 'hodl: nugap global exists');

console.log('\n📋 Step 3: Full flow (yolo base64 → hodl sign → yolo finalize)');
var flowTest = hodlWin.eval("(function() {\
  try {\
    var btcSigner = nugap.btcSigner;\
    var HDKey = nugap.HDKey;\
    var seed = nugap.mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');\
    var master = HDKey.fromMasterSeed(seed);\
    var net = btcSigner.TEST_NETWORK;\
    var child = master.derive(\"m/86'/0'/0'\").deriveChild(0).deriveChild(0);\
    var xo = child.publicKey.slice(1);\
    var p2tr = btcSigner.p2tr(xo, undefined, net);\
    var tx = new btcSigner.Transaction();\
    tx.addInput({ txid: 'c'.repeat(64), index: 0, witnessUtxo: { script: p2tr.script, amount: BigInt(100000) }, tapInternalKey: xo });\
    tx.addOutputAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', BigInt(50000), net);\
    var psbt = tx.toPSBT();\
    var bin = ''; for (var i = 0; i < psbt.length; i++) bin += String.fromCharCode(psbt[i]);\
    var b64 = btoa(bin);\
    var bin2 = atob(b64);\
    var psbt2 = new Uint8Array(bin2.length);\
    for (var i = 0; i < bin2.length; i++) psbt2[i] = bin2.charCodeAt(i);\
    var tx2 = btcSigner.Transaction.fromPSBT(psbt2);\
    tx2.signIdx(child.privateKey, 0);\
    var signed = tx2.toPSBT();\
    var sbin = ''; for (var i = 0; i < signed.length; i++) sbin += String.fromCharCode(signed[i]);\
    var sb64 = btoa(sbin);\
    var sbin2 = atob(sb64);\
    var signed2 = new Uint8Array(sbin2.length);\
    for (var i = 0; i < sbin2.length; i++) signed2[i] = sbin2.charCodeAt(i);\
    var tx3 = btcSigner.Transaction.fromPSBT(signed2);\
    tx3.finalize();\
    var raw = tx3.extract();\
    return { ok: true, psbtLen: psbt.length, signedLen: signed.length, rawLen: raw.length, addr: p2tr.address };\
  } catch(e) { return { ok: false, error: e.message, stack: e.stack }; }\
})()");

if (flowTest.ok) {
  assert(true, 'Full flow: PSBT ' + flowTest.psbtLen + 'B → signed ' + flowTest.signedLen + 'B → raw ' + flowTest.rawLen + 'B');
  assert(flowTest.addr === 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv', 'Address matches reference');
} else {
  assert(false, 'Full flow failed: ' + flowTest.error);
}

console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.log('\x1b[31m\n⚠️  SOME TESTS FAILED\x1b[0m');
  errors.forEach(function(e) { console.log('  - ' + e) });
  process.exit(1);
} else {
  console.log('\x1b[32m\n🎉 ALL BROWSER E2E TESTS PASSED!\x1b[0m');
}
