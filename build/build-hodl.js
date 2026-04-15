var fs = require('fs');
var path = require('path');

var bundle = fs.readFileSync(path.join(__dirname, 'bundle-hodl.js'), 'utf8');
var template = fs.readFileSync(path.join(__dirname, 'template-hodl.html'), 'utf8');
var processShim = 'if(typeof process==="undefined"){var process={env:{},pid:0,noDeprecation:true,stderr:{isTTY:false},nextTick:function(f){setTimeout(f,0)},emitWarning:function(){}};}';

var BANNED = [
  { pattern: /fetch\s*\(/gi, name: 'fetch()' },
  { pattern: /XMLHttpRequest/gi, name: 'XMLHttpRequest' },
  { pattern: /WebSocket/gi, name: 'WebSocket' },
  { pattern: /EventSource/gi, name: 'EventSource' },
  { pattern: /sendBeacon/gi, name: 'sendBeacon' },
  { pattern: /navigator\.geolocation/gi, name: 'navigator.geolocation' },
  { pattern: /navigator\.bluetooth/gi, name: 'navigator.bluetooth' },
  { pattern: /navigator\.usb/gi, name: 'navigator.usb' },
  { pattern: /localStorage/gi, name: 'localStorage' },
  { pattern: /sessionStorage/gi, name: 'sessionStorage' },
  { pattern: /IndexedDB/gi, name: 'IndexedDB' },
  { pattern: /src\s*=\s*["']https?:/gi, name: 'external src' },
  { pattern: /href\s*=\s*["']https?:/gi, name: 'external href' },
];

var clean = template.replace('/* __BUNDLE_JS__ */', '');
var violations = [];
BANNED.forEach(function(rule) {
  var m = clean.match(rule.pattern);
  if (m) violations.push('  ⛔ ' + rule.name + ': ' + m.length + ' occurrence(s)');
});
if (violations.length) {
  console.error('\n🚨 SECURITY SCAN FAILED:\n');
  violations.forEach(function(v) { console.error(v) });
  process.exit(1);
}
console.log('✅ Security scan passed');

function build(network, outName) {
  var html = template.replace("'/* __NETWORK__ */'", "'" + network + "'");
  html = html.replace('/* __BUNDLE_JS__ */', processShim + '\n' + bundle);
  var outPath = path.join(__dirname, '..', outName);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log('Built ' + outName + ' (' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB)');
}

build('mainnet', 'hodl.html');
build('testnet4', 'hodl_test.html');
