# ⚡ Bolt — Code Quality Audit Report (Phase 1: yolo.html)

**Date:** 2026-04-14
**Auditor:** Bolt (Code quality perspective)
**Scope:** template.html code structure, patterns, maintainability, edge cases
**Verdict:** ⚠️ CONDITIONAL PASS — 2 HIGH, 5 MEDIUM issues

---

## Code Structure Overview

- **Total lines:** ~1095 (template.html application logic)
- **Architecture:** Single-file SPA with section-based navigation
- **State management:** Global `APP` object (reasonable for this scope)
- **Dependencies:** Well-chosen (@scure/btc-signer, @noble/*, etc.)
- **Build pipeline:** esbuild → IIFE bundle → inline into HTML

---

## High Issues

### C-1: `btcToSats` uses `parseFloat` + `Math.round` — precision risk
**Severity:** HIGH
**Location:** `function btcToSats(b) { return Math.round(parseFloat(b) * 1e8); }`
**Problem:** While `Math.round` compensates for most floating-point errors, edge cases exist:
```javascript
parseFloat("0.29999999") * 1e8 = 29999998.999999996
Math.round(29999998.999999996) = 29999999 // OK here
// But:
parseFloat("9007199.25477581") * 1e8 = 900719925477580.9
Math.round(900719925477580.9) = 900719925477581 // OK
// However, for amounts near Number.MAX_SAFE_INTEGER / 1e8:
parseFloat("90071992.54775807") * 1e8 = 9007199254775806 // off by 1
```
**Spec reference:** Section 6.5 — "Never use parseFloat for financial amounts"
**Recommendation:** Parse BTC string manually: split on '.', handle integer + decimal parts separately, multiply/pad to 8 digits.

### C-2: Recursive API retry without depth limit
**Severity:** HIGH
**Location:** `async function api(path, opts={})` — on 429: `return api(path, opts);`
**Problem:** No recursion depth limit. If mempool.space returns 429 persistently, this creates infinite recursion that will eventually stack overflow or hang the browser tab.
**Recommendation:** Add `retries` parameter with max 3 attempts.

---

## Medium Issues

### C-3: Global function pollution
**Severity:** MEDIUM
**Details:** All functions (`doImport`, `refreshWallet`, `showDashboard`, etc.) are global. While acceptable for a single-file app with `onclick` handlers, this creates a large global namespace footprint.
**Recommendation:** Consider wrapping in IIFE and exposing only click handlers via `window.X = X` pattern. Not blocking.

### C-4: No loading/disabled state on "Create Transaction"
**Severity:** MEDIUM
**Location:** `createTransaction()` — fetches raw tx hex for each input but button stays enabled
**Problem:** User can click "Create Transaction" multiple times while API calls are in progress.
**Recommendation:** Disable button and show spinner during PSBT construction (same pattern as `doImport`).

### C-5: `processSignedPsbt` assumes finalization succeeds
**Severity:** MEDIUM
**Location:** `processSignedPsbt()` — `tx.finalize()` called without try/catch on the finalize specifically
**Problem:** If the PSBT is only partially signed or has invalid signatures, `finalize()` will throw. While the outer try/catch handles this, the error message ("Failed to process signed PSBT") doesn't tell the user *why* — e.g., "Missing signature for input 0".
**Recommendation:** Catch finalize errors specifically and provide descriptive messages.

### C-6: QR speed control resets animation
**Severity:** MEDIUM
**Location:** `qrSlower()` / `qrFaster()` — calls `stopQrDisplay(); showPsbtQR();`
**Problem:** This restarts the UREncoder from scratch, potentially resetting the fountain code sequence. For small PSBTs this is fine, but for large multi-frame PSBTs, it means the scanner on the other device has to restart capture.
**Recommendation:** Adjust interval timing without recreating the encoder.

### C-7: No cleanup of scanner on page navigation
**Severity:** MEDIUM
**Location:** If user navigates away from scan section by other means (e.g., browser back), the camera stays active.
**Problem:** Camera resource leak. The scanner should be stopped whenever leaving the scan section.
**Recommendation:** Add cleanup in `showSection()` to stop scanner if leaving scan view.

---

## Low Issues

### C-8: Magic numbers throughout
**Severity:** LOW
**Details:** `546` (dust limit), `200` (API delay ms), `200` (UR fragment size), `500` (single QR max bytes), `68` / `57.5` (input vbytes) — all hardcoded.
**Recommendation:** Define named constants at top.

### C-9: No TypeScript / JSDoc
**Severity:** LOW
**Details:** No type documentation. The `APP` state object structure is implicit.
**Recommendation:** Add JSDoc for key functions. Not blocking for MVP.

### C-10: Error in `b58decode` padding logic
**Severity:** LOW (edge case)
**Location:** `b58decode()` — `const hex = n.toString(16).padStart(164, '0');` — this line is dead code (followed by a different conversion approach), but the remaining logic may fail for xpub strings with leading '1' characters.
**Details:** The dead code line (`padStart(164, '0')`) suggests an earlier implementation attempt that was replaced. The comment "Actually variable length..." confirms this was a fix-in-progress. The working path converts via hex string parsing.
**Recommendation:** Remove dead code line. Verify leading-zero handling with test cases.

---

## Positive Code Quality ✅

1. **Clean section navigation** — Simple show/hide pattern, no unnecessary framework
2. **Consistent error handling** — `try/catch` in all async functions with user-visible notifications
3. **Proper async/await** — No callback hell, clean async patterns
4. **Good CSS organization** — Logical sections, responsive design, BEM-ish naming
5. **Appropriate library choices** — @scure/btc-signer is audited and well-maintained
6. **State isolation** — Single `APP` object makes state easy to reason about
7. **200ms API delay** — Respectful rate limiting between sequential calls
8. **Spinner UX** — Loading states for import and refresh operations

---

## Code Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| Template lines | ~1095 | Reasonable for scope |
| Built yolo.html | ~2024 KB | Within 3MB limit (spec 4.2) |
| Global functions | ~30 | Acceptable for single-file app |
| External deps | 7 bundled | All well-known, audited |
| Test coverage | 13 tests | Covers core paths, needs edge cases |

---

## Recommendation

**C-1 (parseFloat)** and **C-2 (infinite retry)** should be fixed before release. Both are correctness issues that could manifest in production.

C-4, C-5, C-7 are important UX improvements for a financial application.

The rest are code hygiene items for Phase 4 polish.

**Overall code quality: GOOD for MVP stage.** Clean, readable, no unnecessary complexity.
