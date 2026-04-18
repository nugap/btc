const fs = require('fs');
const path = require('path');
const root = __dirname;
const build = path.join(root, 'build');

const bundle = fs.readFileSync(path.join(build, 'crypto.js'), 'utf8');

const ENTRIES = {
  hodl: { template: 'template-hodl.html', outputs: { mainnet: 'hodl.html', testnet4: 'test/hodl.html' } },
  yolo: { template: 'template-yolo.html', outputs: { mainnet: 'yolo.html', testnet4: 'test/yolo.html' } },
};

for (const [name, cfg] of Object.entries(ENTRIES)) {
  const template = fs.readFileSync(path.join(build, cfg.template), 'utf8');
  for (const [network, outName] of Object.entries(cfg.outputs)) {
    let html = template.replace("'/* __NETWORK__ */'", "'" + network + "'");
    html = html.replace('/* __BUNDLE_JS__ */', bundle);
    const outPath = path.join(root, outName);
    fs.writeFileSync(outPath, html, 'utf8');
    const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
    console.log(name + ' [' + network + '] -> ' + outName + ' (' + kb + ' KB)');
  }
}
