// build.js — Assembles yolo.html from bundle.js + HTML template
const fs = require('fs');
const path = require('path');

const bundle = fs.readFileSync(path.join(__dirname, 'bundle.js'), 'utf8');
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

const processShim = `if(typeof process==="undefined"){var process={env:{},pid:0,noDeprecation:true,stderr:{isTTY:false},nextTick:function(f){setTimeout(f,0)},emitWarning:function(){}};}`;
const output = template.replace('/* __BUNDLE_JS__ */', processShim + '\n' + bundle);
const outPath = path.join(__dirname, '..', 'yolo.html');
fs.writeFileSync(outPath, output, 'utf8');
console.log(`Built yolo.html (${(Buffer.byteLength(output) / 1024).toFixed(0)} KB)`);
