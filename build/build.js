var fs = require('fs');
var path = require('path');

var bundle = fs.readFileSync(path.join(__dirname, 'bundle.js'), 'utf8');
var template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
var processShim = 'if(typeof process==="undefined"){var process={env:{},pid:0,noDeprecation:true,stderr:{isTTY:false},nextTick:function(f){setTimeout(f,0)},emitWarning:function(){}};}';

function build(network, outName) {
  var html = template.replace("'/* __NETWORK__ */'", "'" + network + "'");
  html = html.replace('/* __BUNDLE_JS__ */', processShim + '\n' + bundle);
  var outPath = path.join(__dirname, '..', outName);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log('Built ' + outName + ' (' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB)');
}

build('mainnet', 'yolo.html');
build('testnet4', 'yolo_test.html');
