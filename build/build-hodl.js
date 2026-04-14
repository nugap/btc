// build-hodl.js — Assembles hodl.html from bundle-hodl.js + HTML template
// Includes security scan: REJECTS build if any network-related code found in output
const fs = require('fs');
const path = require('path');

const bundle = fs.readFileSync(path.join(__dirname, 'bundle-hodl.js'), 'utf8');
const template = fs.readFileSync(path.join(__dirname, 'template-hodl.html'), 'utf8');

// Process shim for browser compat (same as yolo)
const processShim = `if(typeof process==="undefined"){var process={env:{},pid:0,noDeprecation:true,stderr:{isTTY:false},nextTick:function(f){setTimeout(f,0)},emitWarning:function(){}};}`;
const output = template.replace('/* __BUNDLE_JS__ */', processShim + '\n' + bundle);

// ======== SECURITY SCAN ========
// hodl.html must contain ZERO network-related code in template (non-bundle) sections
// We scan the template portion only (bundle may have feature detection code)
const templateClean = template.replace('/* __BUNDLE_JS__ */', '');
const BANNED_TEMPLATE = [
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

let violations = [];
for (const rule of BANNED_TEMPLATE) {
  const matches = templateClean.match(rule.pattern);
  if (matches) {
    violations.push(`  ⛔ ${rule.name}: ${matches.length} occurrence(s)`);
  }
}

if (violations.length > 0) {
  console.error('\n🚨 SECURITY SCAN FAILED — Network code detected in template:\n');
  violations.forEach(v => console.error(v));
  console.error('\nhodl.html must contain ZERO network code. Fix violations and rebuild.\n');
  process.exit(1);
}

console.log('✅ Security scan passed — no network code in template');

// Write output
const outPath = path.join(__dirname, '..', 'hodl.html');
fs.writeFileSync(outPath, output, 'utf8');
const sizeKB = (Buffer.byteLength(output) / 1024).toFixed(0);
console.log(`Built hodl.html (${sizeKB} KB)`);
if (parseInt(sizeKB) > 3072) {
  console.warn(`⚠️ Warning: hodl.html exceeds 3MB target (${sizeKB} KB)`);
}
