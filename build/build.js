const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const PROCESS_SHIM = 'if(typeof process==="undefined"){var process={env:{},pid:0,noDeprecation:true,stderr:{isTTY:false},nextTick:function(f){setTimeout(f,0)},emitWarning:function(){}};}';

const ENTRIES = {
  yolo: {
    imports: [
      "import * as btcSigner from '@scure/btc-signer'",
      "import { HDKey } from '@scure/bip32'",
      "import { sha256 } from '@noble/hashes/sha2.js'",
    ],
    exports: 'btcSigner, HDKey, sha256',
    template: 'template-yolo.html',
    outputs: { mainnet: 'yolo.html', testnet4: 'yolo_test.html' },
  },
  hodl: {
    imports: [
      "import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'",
      "import { wordlist } from '@scure/bip39/wordlists/english.js'",
      "import * as btcSigner from '@scure/btc-signer'",
      "import { HDKey } from '@scure/bip32'",
      "import { base58check as _base58check } from '@scure/base'",
      "import { sha256 } from '@noble/hashes/sha2.js'",
    ],
    setup: 'const base58c = _base58check(sha256);',
    exports: 'generateMnemonic, mnemonicToSeedSync, validateMnemonic, wordlist, btcSigner, HDKey, base58c',
    template: 'template-hodl.html',
    outputs: { mainnet: 'hodl.html', testnet4: 'hodl_test.html' },
    scan: true,
  },
};

const BANNED = [
  /fetch\s*\(/gi, /XMLHttpRequest/gi, /WebSocket/gi, /EventSource/gi,
  /sendBeacon/gi, /navigator\.geolocation/gi, /navigator\.bluetooth/gi,
  /navigator\.usb/gi, /localStorage/gi, /sessionStorage/gi, /IndexedDB/gi,
  /src\s*=\s*["']https?:/gi, /href\s*=\s*["']https?:/gi,
];

for (const [name, cfg] of Object.entries(ENTRIES)) {
  const entryCode = cfg.imports.join(';\n') + ';\n' + (cfg.setup || '') + '\nexport { ' + cfg.exports + ' };\n';
  const entryFile = path.join(dir, `_entry_${name}.js`);
  const bundleFile = path.join(dir, `bundle-${name}.js`);
  fs.writeFileSync(entryFile, entryCode);

  execSync(`npx esbuild ${entryFile} --bundle --format=iife --global-name=nugap --platform=browser --target=es2020 --outfile=${bundleFile}`, { cwd: dir, stdio: 'pipe' });
  fs.unlinkSync(entryFile);

  const bundleSize = (fs.statSync(bundleFile).size / 1024).toFixed(1);
  console.log(`${name} bundle: ${bundleSize} KB`);

  const template = fs.readFileSync(path.join(dir, cfg.template), 'utf8');

  if (cfg.scan) {
    const clean = template.replace('/* __BUNDLE_JS__ */', '');
    const violations = BANNED.filter(p => clean.match(p));
    if (violations.length) {
      console.error(`\n🚨 SECURITY SCAN FAILED for ${name}\n`);
      process.exit(1);
    }
    console.log(`✅ ${name} security scan passed`);
  }

  const bundle = fs.readFileSync(bundleFile, 'utf8');
  for (const [network, outName] of Object.entries(cfg.outputs)) {
    let html = template.replace("'/* __NETWORK__ */'", "'" + network + "'");
    html = html.replace('/* __BUNDLE_JS__ */', PROCESS_SHIM + '\n' + bundle);
    const outPath = path.join(dir, '..', outName);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`Built ${outName} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
  }
}
