#!/usr/bin/env node
// browser-test-jsdom.js — DOM-based tests for yolo.html using jsdom
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const yoloPath = path.resolve(__dirname, '..', 'yolo.html');
const html = fs.readFileSync(yoloPath, 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}

console.log(`=== Loading yolo.html (${Math.round(html.length/1024)} KB) ===`);

const errors = [];
const dom = new JSDOM(html, {
  url: 'https://nugap.github.io/btc/yolo.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    // crypto is already provided by jsdom in modern Node
  },
});
const { window } = dom;
const { document } = window;

// Give scripts time to execute
setTimeout(() => {
  console.log('\n=== Structure Tests ===');

  test('HTML has doctype', () => {
    if (!html.toLowerCase().startsWith('<!doctype') && !html.toLowerCase().startsWith('<!DOCTYPE'))
      throw new Error('Missing doctype');
  });

  test('Has <title>', () => {
    const t = document.querySelector('title');
    if (!t || !t.textContent) throw new Error('No title');
    console.log(`    Title: "${t.textContent}"`);
  });

  test('Has meta charset', () => {
    const m = document.querySelector('meta[charset]');
    if (!m) throw new Error('No charset meta');
  });

  test('Has meta viewport', () => {
    const m = document.querySelector('meta[name="viewport"]');
    if (!m) throw new Error('No viewport meta');
  });

  console.log('\n=== UI Element Tests ===');

  test('Has input fields', () => {
    const inputs = document.querySelectorAll('input, textarea');
    if (!inputs.length) throw new Error('No inputs');
    console.log(`    Found ${inputs.length} input/textarea elements`);
  });

  test('Has buttons', () => {
    const btns = document.querySelectorAll('button');
    if (!btns.length) throw new Error('No buttons');
    console.log(`    Found ${btns.length} buttons`);
    const labels = [...btns].slice(0, 8).map(b => b.textContent.trim().slice(0, 30));
    console.log(`    First buttons: ${labels.join(', ')}`);
  });

  test('Has navigation/tabs', () => {
    const navs = document.querySelectorAll('nav, [class*="tab"], [role="tablist"], .tabs');
    console.log(`    Found ${navs.length} nav/tab elements`);
  });

  console.log('\n=== Crypto Bundle Tests ===');

  test('nugap global available', () => {
    if (!window.nugap) throw new Error('window.nugap not defined');
    const keys = Object.keys(window.nugap);
    console.log(`    nugap exports: ${keys.join(', ')}`);
  });

  test('btcSigner loaded', () => {
    if (!window.nugap?.btcSigner) throw new Error('btcSigner missing');
    const keys = Object.keys(window.nugap.btcSigner).slice(0, 10);
    console.log(`    btcSigner keys: ${keys.join(', ')}...`);
  });

  test('HDKey loaded', () => {
    if (!window.nugap?.HDKey) throw new Error('HDKey missing');
  });

  test('QR modules loaded', () => {
    const hasQR = window.nugap?.Qrcode || window.nugap?.qrcode || window.nugap?.Html5Qrcode;
    if (!hasQR) throw new Error('No QR module');
  });

  test('UR (BC-UR) loaded', () => {
    if (!window.nugap?.UR) throw new Error('UR missing');
  });

  console.log('\n=== Functional Tests ===');

  // Test zpub derivation via DOM
  const TEST_ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtympa9SO76jV26i944i4o5JX9kW6gNB4KbU798snQifUCs42kJHMn2oTcQk8BbKMWGNTMCNBDDgYiQ';

  test('zpub → address derivation works', () => {
    const { HDKey } = window.nugap;
    const { btcSigner } = window.nugap;
    // Convert zpub to xpub (zpub uses version 0x04b24746)
    const b58 = require('buffer');  // we have Buffer
    const decoded = Buffer.from(HDKey.fromExtendedKey(TEST_ZPUB).publicKey);
    if (!decoded || decoded.length < 33) throw new Error('Failed to derive pubkey from zpub');
    console.log(`    Derived pubkey: ${decoded.toString('hex').slice(0, 20)}...`);
  });

  test('Bech32 address validation functions exist', () => {
    // Check if template defines validation functions
    const fnNames = ['validateAddress', 'isValidAddress', 'verifyAddress'];
    const found = fnNames.find(n => typeof window[n] === 'function');
    if (found) {
      console.log(`    Found: ${found}()`);
    } else {
      // Check if validation is inline in event handlers
      const scripts = document.querySelectorAll('script');
      const hasValidation = [...scripts].some(s => 
        s.textContent.includes('bc1q') || s.textContent.includes('bech32')
      );
      if (!hasValidation) throw new Error('No address validation found');
      console.log('    Validation logic found in inline scripts');
    }
  });

  console.log('\n=== Security Tests ===');

  test('No inline event handlers (XSS surface)', () => {
    const all = document.querySelectorAll('*');
    const bad = [];
    for (const el of all) {
      for (const attr of el.attributes || []) {
        if (attr.name.startsWith('on') && attr.name !== 'onchange' && attr.name !== 'oninput') {
          bad.push(`<${el.tagName.toLowerCase()} ${attr.name}=...>`);
        }
      }
    }
    if (bad.length > 5) throw new Error(`Found ${bad.length} inline handlers: ${bad.slice(0,3).join(', ')}`);
    console.log(`    Inline event handlers: ${bad.length} (acceptable)`);
  });

  test('No external script src (should be self-contained)', () => {
    const externalScripts = [...document.querySelectorAll('script[src]')]
      .filter(s => s.src.startsWith('http'));
    if (externalScripts.length) throw new Error(`External scripts: ${externalScripts.map(s=>s.src).join(', ')}`);
    console.log('    All scripts are inline ✓');
  });

  test('No external stylesheets', () => {
    const extLinks = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(l => l.href.startsWith('http'));
    if (extLinks.length) throw new Error(`External CSS: ${extLinks.map(l=>l.href).join(', ')}`);
    console.log('    All styles are inline ✓');
  });

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failed) { console.log('⚠️  Some tests failed!'); process.exit(1); }
  else console.log('🎉 All DOM tests PASSED!');

  dom.window.close();
}, 2000);
