# 🦅 Hawk — Security Audit Report (Phase 1: yolo.html)

**Date:** 2026-04-14
**Auditor:** Hawk (Security perspective)
**Scope:** template.html application logic, build pipeline, bundled dependencies
**Verdict:** ⚠️ CONDITIONAL PASS — 2 HIGH, 3 MEDIUM, 4 LOW findings

---

## Summary

The yolo.html watch-only wallet correctly adheres to its core security principle: **no private keys are ever generated, imported, or handled**. The code review confirms zero signing capability. However, several issues need attention before production use.

---

## Critical / High Findings

### H-1: `innerHTML` used in QR rendering (XSS vector)
**Severity:** HIGH
**Location:** `showPsbtQR()` → `container.innerHTML = qr.createSvgTag(6, 0);`
**Risk:** The `qrcode-generator` library's `createSvgTag()` produces SVG markup. While the data fed into QR is self-generated (PSBT bytes), `container.innerHTML = ...` bypasses XSS prevention if the library or data is ever compromised.
**Spec reference:** Section 6.3 — "Never use `innerHTML` with user data"
**Recommendation:** Use `createSvgTag` but insert via DOM parsing:
```javascript
const tmp = document.createElement('div');
tmp.innerHTML = qr.createSvgTag(6, 0);
container.replaceChildren(tmp.firstChild);
```
Or use `createImgTag()` / canvas rendering instead.

### H-2: `renderDashboard()` uses `innerHTML = ''` for clearing
**Severity:** HIGH
**Location:** `renderDashboard()` → `list.innerHTML = '';`, also `card.innerHTML = '';` in multiple places
**Risk:** While clearing innerHTML with empty string is safe in isolation, the pattern normalizes innerHTML usage. More concerning: the QR SVG injection (H-1) is the real risk. All DOM manipulation should use `textContent` or `replaceChildren()`.
**Recommendation:** Replace `el.innerHTML = ''` with `el.replaceChildren()` everywhere. Replace SVG insertion with DOM API.

---

## Medium Findings

### M-1: No CSP (Content Security Policy)
**Severity:** MEDIUM
**Details:** The HTML has no `<meta http-equiv="Content-Security-Policy">` tag. While it's a single-file app, adding a restrictive CSP would prevent XSS even if an attacker injects content.
**Recommendation:** Add:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://mempool.space; img-src data: blob:">
```

### M-2: API base URL is user-configurable without validation
**Severity:** MEDIUM
**Location:** `saveSettings()` — accepts any URL
**Risk:** User could be social-engineered into entering a malicious API endpoint that returns crafted data (e.g., wrong UTXO values → constructing a transaction that overpays fees).
**Recommendation:** Validate URL format, warn if not HTTPS, consider a whitelist of known trusted endpoints.

### M-3: `confirm()` for self-send warning is blockable
**Severity:** MEDIUM
**Location:** `createTransaction()` uses `confirm()` for self-send warning
**Risk:** In some browser contexts (embedded WebView), `confirm()` may auto-dismiss. Not a critical issue but could lead to accidental self-sends.
**Recommendation:** Use a custom modal instead of native `confirm()`.

---

## Low Findings

### L-1: No rate limiting on API retry (429 handler)
**Severity:** LOW
**Location:** `api()` function — on 429, waits 5s then retries indefinitely (recursive)
**Risk:** Could cause infinite retry loop if mempool.space is permanently throttling.
**Recommendation:** Add max retry count (e.g., 3 retries).

### L-2: HTTPS warning dismissible without consequence
**Severity:** LOW
**Location:** `#https-warn` dismiss button
**Risk:** User can dismiss the HTTPS warning and continue on HTTP. While spec says "allow dismissing", consider making the warning persistent or logging it more prominently.

### L-3: `console.warn` in production code
**Severity:** LOW
**Location:** `fetchAllBalances()` catches errors with `console.warn`
**Risk:** Not a security risk per se, but error swallowing could hide API manipulation. Errors should be surfaced to user.

### L-4: No Subresource Integrity check on bundle
**Severity:** LOW
**Details:** The bundle is inlined, so SRI doesn't apply directly. But there's no hash verification of the bundle at build time.
**Recommendation:** Build script should log SHA256 of the output for manual verification.

---

## Positive Findings (Things Done Right) ✅

1. **No private key handling** — Thoroughly verified. Zero signing code.
2. **Integer arithmetic for amounts** — All satoshi calculations use integers, no floating point.
3. **Bech32 checksum validation** — Proper polymod-based validation for addresses.
4. **Base58check validation** — xpub/zpub checksums properly verified.
5. **HTTPS protocol check** — Warning displayed on non-HTTPS access.
6. **No eval/Function** — No dynamic code execution.
7. **textContent used for user data** — Address labels, amounts all use textContent (except QR SVG issue).
8. **PSBT standard compliance** — Uses @scure/btc-signer which is a well-audited library.

---

## Recommendation

Fix H-1 and M-1 before QA pass. The rest are improvements for Phase 4 hardening.

**Overall: The security model is SOUND. yolo.html is genuinely watch-only.**
