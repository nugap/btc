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

function loadHtml(name) {
  var html = fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
  return new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost' });
}

console.log('\n🧪 Browser E2E — 4-file build\n');

console.log('📋 Step 1: yolo_test.html (testnet4)');
var yDom = loadHtml('yolo_test.html');
var yWin = yDom.window;
assert(typeof yWin.nugap !== 'undefined', 'yolo_test: nugap exists');
assert(typeof yWin.nugap.btcSigner !== 'undefined', 'yolo_test: btcSigner available');

var yt = yWin.eval("(function() {\
  try {\
    var net = nugap.btcSigner.TEST_NETWORK;\
    var privKey = nugap.sha256(new Uint8Array(32).fill(1));\
    var xo = nugap.secp256k1.getPublicKey(privKey, true).slice(1);\
    var p2tr = nugap.btcSigner.p2tr(xo, undefined, net);\
    var tx = new nugap.btcSigner.Transaction();\
    tx.addInput({ txid: 'a'.repeat(64), index: 0, witnessUtxo: { script: p2tr.script, amount: BigInt(100000) }, tapInternalKey: xo });\
    tx.addOutputAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', BigInt(50000), net);\
    var psbt = tx.toPSBT();\
    var bin = ''; for (var i = 0; i < psbt.length; i++) bin += String.fromCharCode(psbt[i]);\
    var b64 = btoa(bin);\
    var bin2 = atob(b64);\
    var psbt2 = new Uint8Array(bin2.length);\
    for (var i = 0; i < bin2.length; i++) psbt2[i] = bin2.charCodeAt(i);\
    var tx2 = nugap.btcSigner.Transaction.fromPSBT(psbt2);\
    tx2.signIdx(privKey, 0);\
    tx2.finalize();\
    return { ok: true, rawLen: tx2.extract().length, addr: p2tr.address };\
  } catch(e) { return { ok: false, error: e.message }; }\
})()");

if (yt.ok) {
  assert(yt.rawLen > 0, 'yolo_test: sign+finalize works (' + yt.rawLen + 'B)');
  assert(yt.addr.startsWith('tb1p'), 'yolo_test: testnet taproot address');
} else assert(false, 'yolo_test failed: ' + yt.error);

console.log('\n📋 Step 2: yolo.html (mainnet)');
var yMain = loadHtml('yolo.html');
assert(typeof yMain.window.nugap !== 'undefined', 'yolo: nugap exists');

console.log('\n📋 Step 3: hodl_test.html (testnet4)');
var hDom = loadHtml('hodl_test.html');
assert(typeof hDom.window.nugap !== 'undefined', 'hodl_test: nugap exists');

console.log('\n📋 Step 4: hodl.html (mainnet)');
var hMain = loadHtml('hodl.html');
assert(typeof hMain.window.nugap !== 'undefined', 'hodl: nugap exists');

console.log('\n📋 Step 5: Full flow (yolo_test → hodl_test → yolo_test)');
var ft = hDom.window.eval("(function() {\
  try {\
    var seed = nugap.mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');\
    var master = nugap.HDKey.fromMasterSeed(seed);\
    var net = nugap.btcSigner.TEST_NETWORK;\
    var child = master.derive(\"m/86'/0'/0'\").deriveChild(0).deriveChild(0);\
    var xo = child.publicKey.slice(1);\
    var p2tr = nugap.btcSigner.p2tr(xo, undefined, net);\
    var tx = new nugap.btcSigner.Transaction();\
    tx.addInput({ txid: 'c'.repeat(64), index: 0, witnessUtxo: { script: p2tr.script, amount: BigInt(100000) }, tapInternalKey: xo });\
    tx.addOutputAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', BigInt(50000), net);\
    var psbt = tx.toPSBT();\
    var bin = ''; for (var i = 0; i < psbt.length; i++) bin += String.fromCharCode(psbt[i]);\
    var b64 = btoa(bin);\
    var bin2 = atob(b64);\
    var psbt2 = new Uint8Array(bin2.length);\
    for (var i = 0; i < bin2.length; i++) psbt2[i] = bin2.charCodeAt(i);\
    var tx2 = nugap.btcSigner.Transaction.fromPSBT(psbt2);\
    tx2.signIdx(child.privateKey, 0);\
    var signed = tx2.toPSBT();\
    var sbin = ''; for (var i = 0; i < signed.length; i++) sbin += String.fromCharCode(signed[i]);\
    var sb64 = btoa(sbin);\
    var sbin2 = atob(sb64);\
    var s2 = new Uint8Array(sbin2.length);\
    for (var i = 0; i < sbin2.length; i++) s2[i] = sbin2.charCodeAt(i);\
    var tx3 = nugap.btcSigner.Transaction.fromPSBT(s2);\
    tx3.finalize();\
    return { ok: true, rawLen: tx3.extract().length, addr: p2tr.address };\
  } catch(e) { return { ok: false, error: e.message }; }\
})()");

if (ft.ok) {
  assert(true, 'Full flow: PSBT → sign → finalize (' + ft.rawLen + 'B)');
  assert(ft.addr === 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv', 'Address matches reference');
} else assert(false, 'Full flow failed: ' + ft.error);

console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.log('\x1b[31m\n⚠️  SOME TESTS FAILED\x1b[0m');
  errors.forEach(function(e) { console.log('  - ' + e) });
  process.exit(1);
} else console.log('\x1b[32m\n🎉 ALL TESTS PASSED!\x1b[0m');
