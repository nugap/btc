// Quick smoke test for hodl bundle
if (typeof window === 'undefined') global.window = global;
if (typeof document === 'undefined') global.document = {
  createElement: () => ({ style: {} }),
  body: { appendChild: () => {} },
  getElementById: () => null,
  querySelectorAll: () => []
};
if (typeof navigator === 'undefined') global.navigator = { userAgent: 'node' };

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/bundle-hodl.js', 'utf8');
eval(src);
const n = nugap;

// 1. All exports present
const expected = ['generateMnemonic', 'mnemonicToSeedSync', 'validateMnemonic', 'wordlist',
                  'btcSigner', 'HDKey', 'sha256', 'UR', 'UREncoder', 'URDecoder',
                  'qrcode', 'Html5Qrcode', 'base58c'];
const missing = expected.filter(k => !n[k]);
if (missing.length > 0) { console.error('MISSING:', missing); process.exit(1); }
console.log('✅ All exports present');

// 2. Generate mnemonic
const mn = n.generateMnemonic(n.wordlist, 128);
if (mn.split(' ').length !== 12) throw new Error('Bad mnemonic');
console.log('✅ 12-word mnemonic generated');

// 3. Validate
if (!n.validateMnemonic(mn, n.wordlist)) throw new Error('Invalid mnemonic');
console.log('✅ Mnemonic validates');

// 4. Seed + master key
const seed = n.mnemonicToSeedSync(mn, '');
if (seed.length !== 64) throw new Error('Bad seed length');
const mk = n.HDKey.fromMasterSeed(seed);
console.log('✅ Master key derived (fp: 0x' + mk.fingerprint.toString(16) + ')');

// 5. BIP-84 account
const acc84 = mk.derive("m/84'/0'/0'");
const xpub = acc84.publicExtendedKey;
if (!xpub.startsWith('xpub')) throw new Error('Not xpub: ' + xpub.slice(0, 10));
console.log('✅ BIP-84 xpub: ' + xpub.slice(0, 25) + '...');

// 6. zpub conversion
const decoded = n.base58c.decode(xpub);
const buf = new Uint8Array(decoded);
buf[0] = 0x04; buf[1] = 0xB2; buf[2] = 0x47; buf[3] = 0x46;
const zpub = n.base58c.encode(buf);
if (!zpub.startsWith('zpub')) throw new Error('Not zpub: ' + zpub.slice(0, 10));
console.log('✅ zpub: ' + zpub.slice(0, 25) + '...');

// 7. First address
const child = acc84.deriveChild(0).deriveChild(0);
const addr = n.btcSigner.p2wpkh(child.publicKey).address;
if (!addr.startsWith('bc1q')) throw new Error('Bad address: ' + addr);
console.log('✅ First address: ' + addr);

// 8. BIP-86 Taproot
const acc86 = mk.derive("m/86'/0'/0'");
const child86 = acc86.deriveChild(0).deriveChild(0);
const xonly = child86.publicKey.length === 33 ? child86.publicKey.slice(1) : child86.publicKey;
const trAddr = n.btcSigner.p2tr(xonly).address;
if (!trAddr.startsWith('bc1p')) throw new Error('Bad taproot addr: ' + trAddr);
console.log('✅ Taproot address: ' + trAddr);

// 9. 24-word mnemonic
const mn24 = n.generateMnemonic(n.wordlist, 256);
if (mn24.split(' ').length !== 24) throw new Error('Bad 24-word mnemonic');
console.log('✅ 24-word mnemonic generated');

// 10. QR generation
const qr = n.qrcode(0, 'M');
qr.addData(zpub);
qr.make();
console.log('✅ QR generation works');

console.log('\n🎉 All smoke tests passed!');
