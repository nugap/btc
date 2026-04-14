#!/usr/bin/env node
// browser-test.js — Headless browser tests for yolo.html
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const YOLO = 'file://' + path.resolve(__dirname, '..', 'yolo.html');

let passed = 0, failed = 0;
async function test(name, fn, page) {
  try { await fn(page); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Collect console errors
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  console.log('=== Loading yolo.html ===');
  await page.goto(YOLO, { waitUntil: 'networkidle0', timeout: 30000 });

  await test('Page loads without JS errors', async () => {
    if (errors.length) throw new Error(`JS errors: ${errors.join('; ')}`);
  });

  await test('Page has title', async () => {
    const title = await page.title();
    if (!title) throw new Error('No title');
    console.log(`    Title: "${title}"`);
  });

  await test('nugap global exists', async () => {
    const has = await page.evaluate(() => typeof window.nugap !== 'undefined');
    if (!has) throw new Error('window.nugap not found');
  });

  await test('Main UI sections render', async () => {
    const sections = await page.evaluate(() => {
      const els = document.querySelectorAll('section, [id*="wallet"], [id*="send"], [id*="receive"], [class*="tab"], [class*="section"], .card, .panel');
      return els.length;
    });
    if (sections < 1) throw new Error(`Only ${sections} sections found`);
    console.log(`    Found ${sections} UI sections`);
  });

  // Test address validation if there's an input field
  await test('Address input field exists', async () => {
    const hasInput = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, textarea');
      return inputs.length > 0;
    });
    if (!hasInput) throw new Error('No input fields found');
    const count = await page.evaluate(() => document.querySelectorAll('input, textarea').length);
    console.log(`    Found ${count} input fields`);
  });

  // Test zpub import flow
  const TEST_ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtympa9SO76jV26i944i4o5JX9kW6gNB4KbU798snQifUCs42kJHMn2oTcQk8BbKMWGNTMCNBDDgYiQ';
  
  await test('Import zpub wallet flow', async () => {
    // Try to find import-related elements
    const importResult = await page.evaluate((zpub) => {
      // Look for import input or textarea
      const inputs = [...document.querySelectorAll('input, textarea')];
      const importInput = inputs.find(i => 
        i.placeholder?.toLowerCase().includes('zpub') ||
        i.placeholder?.toLowerCase().includes('xpub') ||
        i.id?.toLowerCase().includes('import') ||
        i.id?.toLowerCase().includes('key') ||
        i.id?.toLowerCase().includes('wallet')
      );
      if (importInput) {
        importInput.value = zpub;
        importInput.dispatchEvent(new Event('input', { bubbles: true }));
        return { found: true, id: importInput.id || importInput.placeholder };
      }
      return { found: false, inputCount: inputs.length, ids: inputs.map(i => i.id || i.placeholder).slice(0, 5) };
    }, TEST_ZPUB);
    console.log(`    Import field: ${JSON.stringify(importResult)}`);
  });

  // Test that buttons exist and are clickable
  await test('Interactive buttons exist', async () => {
    const buttons = await page.evaluate(() => {
      const btns = document.querySelectorAll('button, [role="button"], .btn');
      return btns.length;
    });
    if (buttons < 1) throw new Error('No buttons found');
    console.log(`    Found ${buttons} buttons`);
  });

  // Check no console errors after interactions
  await test('No runtime errors after interactions', async () => {
    // Give a moment for any async errors
    await new Promise(r => setTimeout(r, 1000));
    const runtimeErrors = errors.filter(e => !e.includes('favicon'));
    if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join('; ')}`);
  });

  // Check page weight
  await test('Page size reasonable', async () => {
    const html = await page.content();
    const sizeKB = Math.round(html.length / 1024);
    console.log(`    Page size: ${sizeKB} KB`);
    if (sizeKB > 10000) throw new Error(`Page too large: ${sizeKB} KB`);
  });

  await browser.close();

  console.log(`\n=== BROWSER TESTS: ${passed} passed, ${failed} failed ===`);
  if (failed) { console.log('⚠️  Some tests failed!'); process.exit(1); }
  else console.log('🎉 All browser tests PASSED!');
})().catch(e => { console.error('Fatal:', e); process.exit(1); });
